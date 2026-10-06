import 'dotenv/config';

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import {
  supabaseAdmin,
  isSupabaseConfigured,
  testSupabaseConnection,
  supabaseUrl,
  supabaseKey,
} from './server/supabase.js';
import { handleRegistrationsPostgrest } from './server/liveDataset.js';
import * as repository from './server/repository.js';
import { generateQrDataUrl, buildAttendeeQrText } from './server/qr.js';
import {
  sendRegistrationConfirmationEmail,
  sendAdminNewRegistrationNotification,
  sendTestEmail,
  emailAuditLog,
} from './server/email.js';
import { syncRegistrationToGoogleSheet, syncAllRegistrationsToGoogleSheet, deleteRegistrationFromGoogleSheet, formatIsoTimestamp } from './server/googleSheet.js';
import { Participant } from './src/types.js';
import { getPricePerPerson } from './server/pricing.js';
import { readClosedWorkshops, closeWorkshops, openWorkshops } from './server/closureStore.js';
import { isEventClosedStrict } from './src/utils/closureUtils.js';

function findEventByAnyKey(allEvents: any[], eventKey: string) {
  if (!eventKey || !Array.isArray(allEvents)) return undefined;
  const keyUpper = eventKey.trim().toUpperCase();
  const keyLower = eventKey.trim().toLowerCase();
  const stripped = keyLower.replace(/^(ws|tech|non|nontech)-/i, '');

  return allEvents.find((e) => {
    const idUpper = (e.id || '').toUpperCase();
    const slugUpper = (e.slug || e.code || '').toUpperCase();
    const nameUpper = (e.title || e.name || '').toUpperCase();
    const codeLower = (e.code || e.slug || '').toLowerCase();
    const nameLower = (e.title || e.name || '').toLowerCase();

    return (
      idUpper === keyUpper ||
      slugUpper === keyUpper ||
      nameUpper === keyUpper ||
      idUpper === `TECH-${keyUpper}` ||
      slugUpper === `TECH-${keyUpper}` ||
      idUpper === `WS-${keyUpper}` ||
      slugUpper === `WS-${keyUpper}` ||
      idUpper.replace('TECH-', '') === keyUpper ||
      slugUpper.replace('TECH-', '') === keyUpper ||
      idUpper.replace('WS-', '') === keyUpper ||
      slugUpper.replace('WS-', '') === keyUpper ||
      codeLower === stripped ||
      nameLower === stripped ||
      (stripped.includes('silicon') && (codeLower.includes('silicon') || nameLower.includes('silicon'))) ||
      (stripped.includes('vlsi') && (codeLower.includes('silicon') || nameLower.includes('silicon'))) ||
      (stripped.includes('embedded') && (codeLower.includes('embedded') || nameLower.includes('embedded'))) ||
      (stripped.includes('virtual') && (codeLower.includes('virtual') || nameLower.includes('virtual'))) ||
      (stripped.includes('paper') && (codeLower.includes('paper') || nameLower.includes('paper'))) ||
      (stripped.includes('evolvex') && (codeLower.includes('evolvex') || nameLower.includes('evolvex'))) ||
      (stripped.includes('tracktron') && (codeLower.includes('tracktron') || nameLower.includes('tracktron'))) ||
      (stripped.includes('mind') && (codeLower.includes('mind') || nameLower.includes('mind'))) ||
      (stripped.includes('prompt') && (codeLower.includes('prompt') || nameLower.includes('prompt'))) ||
      (stripped.includes('mem') && (codeLower.includes('mem') || nameLower.includes('mem'))) ||
      (stripped.includes('detective') && (codeLower.includes('detective') || nameLower.includes('detective')))
    );
  });
}

function cleanWorkshopTitle(raw: string | undefined): string {
  if (!raw) return 'Workshop';
  const s = raw.toLowerCase();
  if (s.includes('silicon') || s.includes('gds') || s.includes('cadence') || s.includes('vlsi')) {
    return 'SILICON 2 GDS';
  }
  if (s.includes('embedded') || s.includes('microcontroller') || s.includes('arm')) {
    return 'Embedded System';
  }
  if (s.includes('instrumentation') || s.includes('labview') || s.includes('virtual') || s.includes('daq')) {
    return 'Virtual Instrumentation';
  }
  return raw.replace(/ws-/i, '').trim() || 'Workshop';
}

const PORT = 3000;
const app = express();

app.use(
  express.json({
    limit: '8mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

const TOKEN_SECRET = process.env.ADMIN_PASSWORD || 'Evitron26@mec.ece#07';

function generateToken(): string {
  const payload = JSON.stringify({ admin: true, exp: Date.now() + 24 * 60 * 60 * 1000 });
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + hmac;
}

function verifyToken(token: string): boolean {
  if (!token) return false;
  try {
    const [payloadB64, hmac] = token.split('.');
    if (!payloadB64 || !hmac) return false;
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    const expectedHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (hmac !== expectedHmac) return false;
    const parsed = JSON.parse(payload);
    if (Number(parsed.exp) < Date.now()) return false;
    return Boolean(parsed.admin);
  } catch {
    return false;
  }
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Admin session required.' });
  }
  const token = authHeader.split(' ')[1];
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Invalid or expired admin session token.' });
  }
  next();
}

function wrap(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message || 'Server error' });
    });
  };
}

// ----------------------------------------------------
// PUBLIC API ENDPOINTS
// ----------------------------------------------------

app.get('/api/health', wrap(async (_req, res) => {
  const settings = await repository.getSiteSettings();
  const currentEnv = settings.appEnv || 'production';
  const supabaseTest = await testSupabaseConnection();
  res.json({
    status: 'ok',
    symposium: 'EVITRON 2K26',
    timestamp: formatIsoTimestamp(new Date()),
    environment: currentEnv,
    supabase: supabaseTest,
  });
}));

// Supabase proxy: Injects verified server master key to prevent "Unregistered API key"
app.all('/api/supabase-proxy/*', wrap(async (req, res) => {
  const targetPath = req.url.replace(/^\/api\/supabase-proxy/, '');
  const targetUrl = `${supabaseUrl}${targetPath}`;
  const method = req.method.toUpperCase();

  if ((method === 'GET' || method === 'HEAD') && targetPath.includes('/rest/v1/registrations')) {
    const postgrestResult = handleRegistrationsPostgrest(targetUrl, method, req.headers as any);
    if (postgrestResult.handled) {
      res.status(postgrestResult.status);
      Object.entries(postgrestResult.headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.json(postgrestResult.body);
    }
  }

  const headers = new Headers();
  const effectiveKey = supabaseKey || (req.headers['apikey'] as string) || '';
  headers.set('apikey', effectiveKey);
  headers.set('Authorization', `Bearer ${effectiveKey}`);
  
  if (req.headers['content-type']) {
    headers.set('content-type', req.headers['content-type'] as string);
  }
  if (req.headers['prefer']) {
    headers.set('prefer', req.headers['prefer'] as string);
  }

  const fetchInit: RequestInit = {
    method: req.method,
    headers,
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    fetchInit.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const proxyRes = await fetch(targetUrl, fetchInit);
  const data = await proxyRes.text();

  res.status(proxyRes.status);
  proxyRes.headers.forEach((val, key) => {
    if (['content-type', 'content-range', 'preference-applied'].includes(key.toLowerCase())) {
      res.setHeader(key, val);
    }
  });
  res.send(data);
}));

app.get('/api/settings', wrap(async (_req, res) => {
  const settings = await repository.getSiteSettings();
  const currentEnv = settings.appEnv || 'production';
  const defaultQrUrl = '/default-upi-qr.jpeg';

  const upiQrImage = settings.upiQrImageUrl || defaultQrUrl;
  const workshopUpiQrImage = settings.workshopUpiQrImageUrl || upiQrImage || defaultQrUrl;
  const techUpiQrImage = settings.techUpiQrImageUrl || upiQrImage || defaultQrUrl;

  res.json({
    ...settings,
    appEnv: currentEnv,
    upiQrImageUrl: upiQrImage,
    workshopUpiQrImageUrl: workshopUpiQrImage,
    techUpiQrImageUrl: techUpiQrImage,
  });
}));

app.get('/api/events', wrap(async (_req, res) => {
  const events = await repository.getEvents(false);
  res.json(events);
}));

app.get('/api/events/:slug', wrap(async (req, res) => {
  const event = await repository.getEventBySlug(req.params.slug);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json(event);
}));

async function validateRegistrationRules(body: {
  registrationType: 'workshop' | 'technical';
  selectedWorkshopId?: string;
  selectedTechnicalIds?: string[];
  selectedNonTechnicalIds?: string[];
  participants: Participant[];
}) {
  const settings = await repository.getSiteSettings();

  if (!settings.isRegistrationOpen) {
    return {
      valid: false,
      status: 403,
      error: settings.closedReason || 'Registrations are currently closed.',
    };
  }

  let closedEvents: string[];
  try {
    closedEvents = await readClosedWorkshops();
  } catch (err: any) {
    console.error('[CLOSURE] validation read failed:', err?.message || err);
    return { valid: false, status: 503, error: 'Unable to verify event availability right now. Please try again in a moment.' };
  }
  const { selectedWorkshopId, selectedTechnicalIds = [], selectedNonTechnicalIds = [] } = body;
  const dbEvents = await repository.getEvents(false);
  const isClosedStrict = (key: string | undefined) => isEventClosedStrict(key, closedEvents, dbEvents);

  if (selectedWorkshopId && isClosedStrict(selectedWorkshopId)) {
    return {
      valid: false,
      status: 400,
      error: 'Registration for the selected workshop is currently STRICTLY CLOSED by event administration.',
    };
  }

  for (const tid of selectedTechnicalIds) {
    if (isClosedStrict(tid)) {
      return {
        valid: false,
        status: 400,
        error: 'Registration for the selected technical event is currently STRICTLY CLOSED by event administration.',
      };
    }
  }

  for (const nid of selectedNonTechnicalIds) {
    if (isClosedStrict(nid)) {
      return {
        valid: false,
        status: 400,
        error: 'Registration for the selected non-technical event is currently STRICTLY CLOSED by event administration.',
      };
    }
  }

  const { registrationType, participants } = body;

  if (!Array.isArray(participants)) {
    return {
      valid: false,
      status: 400,
      error: 'Invalid participants list.',
    };
  }

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];

    if (
      !p.fullName?.trim() ||
      !p.email?.trim() ||
      !p.phone?.trim() ||
      !p.college?.trim()
    ) {
      return {
        valid: false,
        status: 400,
        error: `Participant #${i + 1} has incomplete details (Name, Email, Phone, and College are required).`,
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) {
      return {
        valid: false,
        status: 400,
        error: `Invalid email address for participant #${i + 1}: ${p.email}`,
      };
    }

    const digits = p.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      return {
        valid: false,
        status: 400,
        error: `Please enter a valid 10-digit mobile number for participant #${i + 1}.`,
      };
    }
  }

  const allSelectedIds = [
    ...(selectedWorkshopId ? [selectedWorkshopId] : []),
    ...selectedTechnicalIds,
    ...selectedNonTechnicalIds,
  ];

  const uniqueSelectedIds = new Set(allSelectedIds);

  if (uniqueSelectedIds.size !== allSelectedIds.length) {
    return {
      valid: false,
      status: 400,
      error: 'The same event cannot be selected more than once.',
    };
  }

  const eventValidation = await repository.validateRegistrationEvents(allSelectedIds);

  if (!eventValidation.valid) {
    return {
      valid: false,
      status: 400,
      error: eventValidation.error || 'One or more selected events are invalid.',
    };
  }

  for (const e of eventValidation.events || []) {
    if (isEventClosedStrict(e.id, closedEvents, dbEvents) || isEventClosedStrict((e as any).code, closedEvents, dbEvents)) {
      return { valid: false, status: 400, error: `Registration for "${e.name}" is STRICTLY CLOSED by event administration.` };
    }
  }

  const events = eventValidation.events || [];
  const findMatchingEvent = (key: string | undefined) => {
    if (!key) return undefined;
    const clean = key.trim().toLowerCase();
    const stripped = clean.replace(/^(ws|tech|non|nontech)-/i, '');
    return events.find((e) => {
      const eId = (e.id || '').toLowerCase();
      const eCode = ((e as any).code || (e as any).slug || '').toLowerCase();
      const eName = (e.name || '').toLowerCase();
      return (
        eId === clean ||
        eCode === clean ||
        eCode === stripped ||
        eName === clean ||
        (stripped.includes('silicon') && (eCode.includes('silicon') || eName.includes('silicon'))) ||
        (stripped.includes('embedded') && (eCode.includes('embedded') || eName.includes('embedded'))) ||
        (stripped.includes('virtual') && (eCode.includes('virtual') || eName.includes('virtual'))) ||
        (stripped.includes('paper') && (eCode.includes('paper') || eName.includes('paper'))) ||
        (stripped.includes('evolvex') && (eCode.includes('evolvex') || eName.includes('evolvex'))) ||
        (stripped.includes('tracktron') && (eCode.includes('tracktron') || eName.includes('tracktron'))) ||
        (stripped.includes('mind') && (eCode.includes('mind') || eName.includes('mind'))) ||
        (stripped.includes('prompt') && (eCode.includes('prompt') || eName.includes('prompt'))) ||
        (stripped.includes('mem') && (eCode.includes('mem') || eName.includes('mem'))) ||
        (stripped.includes('detective') && (eCode.includes('detective') || eName.includes('detective')))
      );
    });
  };

  if (registrationType === 'workshop') {
    if (!selectedWorkshopId) {
      return { valid: false, status: 400, error: 'Please select a workshop.' };
    }
    if (selectedTechnicalIds.length > 0 || selectedNonTechnicalIds.length > 0) {
      return {
        valid: false,
        status: 400,
        error: 'Workshop participants cannot register for technical or non-technical events.',
      };
    }
    if (participants.length !== 1) {
      return {
        valid: false,
        status: 400,
        error: 'Workshop registration is individual (strictly 1 participant).',
      };
    }

    const workshop = findMatchingEvent(selectedWorkshopId);
    if (!workshop || (workshop.category !== 'workshop' && workshop.category !== 'workshops')) {
      return { valid: false, status: 400, error: 'Selected workshop was not found or is invalid.' };
    }

    const perPersonPrice = getPricePerPerson('workshop', settings);
    return { valid: true, expectedAmount: perPersonPrice, events };
  }

  if (registrationType === 'technical') {
    if (selectedTechnicalIds.length !== 1) {
      return { valid: false, status: 400, error: 'Strictly only 1 technical event can be selected.' };
    }
    if (selectedNonTechnicalIds.length > 1) {
      return { valid: false, status: 400, error: 'Strictly at most 1 non-technical event can be selected.' };
    }
    if (selectedWorkshopId) {
      return { valid: false, status: 400, error: 'Cannot mix workshop and technical symposium registration.' };
    }
    if (participants.length < 2 || participants.length > 4) {
      return {
        valid: false,
        status: 400,
        error: `Technical symposium registration requires 2 to 4 participants per team. You provided ${participants.length}.`,
      };
    }

    const technical = findMatchingEvent(selectedTechnicalIds[0]);
    if (!technical || technical.category !== 'technical') {
      return { valid: false, status: 400, error: 'Selected technical event was not found.' };
    }

    for (const eventId of selectedNonTechnicalIds) {
      const nonTechnical = findMatchingEvent(eventId);
      if (!nonTechnical || (nonTechnical.category !== 'nontechnical' && nonTechnical.category !== 'non-technical' && nonTechnical.category !== 'non_technical')) {
        return { valid: false, status: 400, error: 'Selected non-technical event is invalid.' };
      }
    }

    const perPersonPrice = getPricePerPerson('technical', settings);
    const expectedAmount = perPersonPrice * participants.length;

    return { valid: true, expectedAmount, events };
  }

  return { valid: false, status: 400, error: 'Invalid registration category.' };
}

const handleRegistrationSubmit = async (req: express.Request, res: express.Response) => {
  const { registrationData, upiReference, screenshotDriveProof, paymentProofUrl } = req.body;
  const proofData = screenshotDriveProof || paymentProofUrl || '';

  if (!upiReference || upiReference.trim().length < 4) {
    return res.status(400).json({ error: 'Please enter a valid 12-digit UPI Transaction Reference (UTR / Ref ID).' });
  }

  const validation = await validateRegistrationRules(registrationData || req.body);
  if (!validation.valid) {
    return res.status(validation.status || 400).json({ error: validation.error });
  }

  const regData = registrationData || req.body;
  const settings = await repository.getSiteSettings();
  const newRecord = await repository.createRegistration({
    registrationType: regData.registrationType,
    selectedWorkshopId: regData.selectedWorkshopId,
    selectedTechnicalIds: regData.selectedTechnicalIds || [],
    selectedNonTechnicalIds: regData.selectedNonTechnicalIds || [],
    participants: regData.participants,
    totalAmount: validation.expectedAmount || (regData.registrationType === 'workshop' ? getPricePerPerson('workshop', settings) : getPricePerPerson('technical', settings) * (regData.participants?.length || 1)),
    paymentMethod: 'upi',
    paymentStatus: 'pending_verification',
    upiReference: upiReference.trim(),
    paymentProofUrl: proofData ? proofData.trim() : '',
  });

  const allEvents = await repository.getEvents(false);
  const eventTitles: string[] = [];
  if (newRecord.selectedWorkshopId || newRecord.registrationType === 'workshop') {
    const wsKey = newRecord.selectedWorkshopId || regData.selectedWorkshopId;
    const w = wsKey ? findEventByAnyKey(allEvents, wsKey) : null;
    eventTitles.push(cleanWorkshopTitle(w ? w.title : wsKey));
  }
  const techList = (newRecord.selectedTechnicalIds?.length ? newRecord.selectedTechnicalIds : regData.selectedTechnicalIds) || [];
  for (const tid of techList) {
    const t = findEventByAnyKey(allEvents, tid);
    if (t) eventTitles.push(t.title);
  }
  const nonTechList = (newRecord.selectedNonTechnicalIds?.length ? newRecord.selectedNonTechnicalIds : regData.selectedNonTechnicalIds) || [];
  for (const nid of nonTechList) {
    const n = findEventByAnyKey(allEvents, nid);
    if (n) eventTitles.push(n.title);
  }
  if (eventTitles.length === 0 && newRecord.eventsText) {
    eventTitles.push(newRecord.eventsText);
  }

  const adminEmails = settings.adminNotificationEmails?.length ? settings.adminNotificationEmails : ['evitron26@gmail.com'];

  // Asynchronously dispatch background tasks (emails, sheets) without blocking the client response
  Promise.allSettled([
    sendAdminNewRegistrationNotification(newRecord, eventTitles, adminEmails),
    sendRegistrationConfirmationEmail(newRecord, eventTitles),
    syncRegistrationToGoogleSheet(newRecord, eventTitles),
  ]).catch((err) => {
    console.warn('[REGISTRATION BACKGROUND SYNC NOTICE]', err?.message || err);
  });

  scheduleBroadcast();

  res.json({
    success: true,
    registrationId: newRecord.id,
    registration: newRecord,
  });
};

app.post('/api/register-upi', wrap(handleRegistrationSubmit));
app.post('/api/register', wrap(handleRegistrationSubmit));

app.post('/api/sync-registration', wrap(async (req, res) => {
  const { registration } = req.body;
  if (!registration || !registration.id) {
    return res.status(400).json({ error: 'Invalid registration payload' });
  }
  const success = await repository.ingestRegistrationIntoSupabase(registration);
  res.json({ success, registrationId: registration.id });
}));

app.get('/api/registration/:id', wrap(async (req, res) => {
  const reg = await repository.getRegistrationById(req.params.id);
  if (!reg) {
    return res.status(404).json({ error: 'Registration not found' });
  }

  const allEvents = await repository.getEvents(false);
  const eventTitles: string[] = [];
  if (reg.selectedWorkshopId || reg.registrationType === 'workshop') {
    const w = reg.selectedWorkshopId ? findEventByAnyKey(allEvents, reg.selectedWorkshopId) : null;
    eventTitles.push(cleanWorkshopTitle(w ? w.title : reg.selectedWorkshopId));
  }
  for (const tid of reg.selectedTechnicalIds) {
    const t = findEventByAnyKey(allEvents, tid);
    if (t) eventTitles.push(t.title);
  }
  for (const nid of reg.selectedNonTechnicalIds) {
    const n = findEventByAnyKey(allEvents, nid);
    if (n) eventTitles.push(n.title);
  }

  const trackLabel =
    reg.registrationType === 'workshop'
      ? 'Hands-on Workshop Track (Individual)'
      : `National Technical Symposium Track (Team of ${reg.participants.length})`;

  const qrText = buildAttendeeQrText({
    symposium: 'EVITRON 2K26',
    regId: reg.id,
    leaderName: reg.teamLeader.fullName,
    leaderPhone: reg.teamLeader.phone,
    leaderEmail: reg.teamLeader.email,
    college: reg.teamLeader.college,
    department: reg.teamLeader.department,
    track: trackLabel,
    events: eventTitles,
    members: reg.participants.map((p) => ({
      name: p.fullName,
      phone: p.phone,
      college: p.college,
      dept: p.department,
      year: p.year,
    })),
    amount: reg.totalAmount,
    paymentStatus: reg.paymentStatus,
    paymentMethod: reg.paymentMethod,
    date: '08 October 2026',
    venue: 'Mahendra Engineering College (Autonomous), Namakkal',
  });

  const qrDataUrl = await generateQrDataUrl(qrText);

  res.json({
    ...reg,
    qrDataUrl,
    qrText,
  });
}));

app.post('/api/attendance/mark', requireAdmin, wrap(async (req, res) => {
  const { registrationId } = req.body;
  if (!registrationId) {
    return res.status(400).json({ error: 'Registration ID is required.' });
  }

  const match = String(registrationId).match(/EV26-[A-Z0-9]{6}/i);
  const cleanId = match ? match[0].toUpperCase() : String(registrationId).trim().toUpperCase();

  try {
    const result = await repository.markAttendance(cleanId);
    if (result.success && result.registration) {
      const allEvents = await repository.getEvents(false);
      const eventTitles: string[] = [];
      if (result.registration.selectedWorkshopId || result.registration.registrationType === 'workshop') {
        const w = result.registration.selectedWorkshopId ? findEventByAnyKey(allEvents, result.registration.selectedWorkshopId) : null;
        eventTitles.push(cleanWorkshopTitle(w ? w.title : result.registration.selectedWorkshopId));
      }
      for (const tid of result.registration.selectedTechnicalIds) {
        const t = findEventByAnyKey(allEvents, tid);
        if (t) eventTitles.push(t.title);
      }
      for (const nid of result.registration.selectedNonTechnicalIds) {
        const n = findEventByAnyKey(allEvents, nid);
        if (n) eventTitles.push(n.title);
      }
      syncRegistrationToGoogleSheet(result.registration, eventTitles).catch(() => {});
    }
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message || 'Registration not found' });
  }
}));

// ----------------------------------------------------
// ADMIN API ENDPOINTS
// ----------------------------------------------------

app.post('/api/admin/login', wrap(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Evitron26@mec.ece#07';

  if (password.trim() === ADMIN_PASSWORD) {
    const token = generateToken();
    return res.json({ success: true, token, message: 'Admin authentication successful.' });
  }

  return res.status(401).json({ error: 'Incorrect administrator password.' });
}));

const activeSSEClients = new Set<express.Response>();

function broadcastToAdmins(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of activeSSEClients) {
    try {
      client.write(payload);
    } catch {
      activeSSEClients.delete(client);
    }
  }
}

setInterval(() => {
  broadcastToAdmins({ type: 'heartbeat' });
}, 15000);

let broadcastTimer: NodeJS.Timeout | null = null;
function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    broadcastToAdmins({ type: 'change' });
  }, 250);
}

if (isSupabaseConfigured()) {
  supabaseAdmin
    .channel('admin-db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
      scheduleBroadcast();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => {
      scheduleBroadcast();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
      scheduleBroadcast();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_events' }, () => {
      scheduleBroadcast();
    })
    .subscribe();
}

app.get('/api/admin/realtime-stream', (req, res) => {
  const token = req.query.token as string;
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized realtime connection.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  activeSSEClients.add(res);

  req.on('close', () => {
    activeSSEClients.delete(res);
  });
});

app.get('/api/admin/stats', requireAdmin, wrap(async (_req, res) => {
  res.json(await repository.getRegistrationStats());
}));

app.get('/api/admin/registrations', requireAdmin, wrap(async (req, res) => {
  const { type, status, search } = req.query as { type?: string; status?: string; search?: string };

  const registrations = await repository.listRegistrations({
    registrationType: type as any,
    paymentStatus: status as any,
    search,
  });

  const stats = repository.calculateStatsFromRegistrations(registrations);

  res.json({ registrations, stats });
}));

// Route for immediate status updates and email dispatch
app.patch('/api/admin/registrations/:id/status', requireAdmin, wrap(async (req, res) => {
  const { status } = req.body;
  if (!['paid', 'pending_verification', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const cleanId = String(req.params.id).trim().toUpperCase();
  const updated = await repository.updateRegistrationPayment(cleanId, { paymentStatus: status });
  if (!updated) {
    return res.status(404).json({ error: 'Registration not found' });
  }

  const allEvents = await repository.getEvents(false);
  const eventTitles: string[] = [];
  if (updated.selectedWorkshopId || updated.registrationType === 'workshop') {
    const w = updated.selectedWorkshopId ? findEventByAnyKey(allEvents, updated.selectedWorkshopId) : null;
    eventTitles.push(cleanWorkshopTitle(w ? w.title : updated.selectedWorkshopId));
  }
  for (const tid of updated.selectedTechnicalIds) {
    const t = findEventByAnyKey(allEvents, tid);
    if (t) eventTitles.push(t.title);
  }
  for (const nid of updated.selectedNonTechnicalIds) {
    const n = findEventByAnyKey(allEvents, nid);
    if (n) eventTitles.push(n.title);
  }

  await Promise.allSettled([
    status === 'paid' ? sendRegistrationConfirmationEmail(updated, eventTitles) : Promise.resolve(),
    syncRegistrationToGoogleSheet(updated, eventTitles),
  ]);

  scheduleBroadcast();
  res.json(updated);
}));

app.post('/api/admin/sync-google-sheet', requireAdmin, wrap(async (_req, res) => {
  const pullResult = await repository.syncRegistrationsFromGoogleSheet(true);
  const registrations = await repository.listRegistrations();
  const sorted = [...registrations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const pushResult = await syncAllRegistrationsToGoogleSheet(sorted);
  scheduleBroadcast();
  res.json({
    success: true,
    count: registrations.length,
    message: `Synchronized with Google Sheets (${pullResult.synced} newly imported to Supabase, ${pushResult.syncedCount} confirmed in Sheet). Total: ${registrations.length} registrations.`,
  });
}));

app.post('/api/admin/test-email', requireAdmin, wrap(async (req, res) => {
  const { recipient } = req.body;
  const target = recipient || 'evitron26@gmail.com';
  const result = await sendTestEmail(target);
  res.json(result);
}));

app.get('/api/admin/registrations/:id/payment-proof', requireAdmin, wrap(async (req, res) => {
  const reg = await repository.getRegistrationById(req.params.id);
  if (!reg) {
    return res.status(404).json({ error: 'Registration not found' });
  }
  res.json({ paymentProofUrl: reg.paymentProofUrl });
}));

app.delete('/api/admin/registrations/:id', requireAdmin, wrap(async (req, res) => {
  const { deletePassword } = req.body;
  const expectedPassword = process.env.DELETE_CONFIRM_PASSWORD || 'evitron@26';

  if (!deletePassword || deletePassword.trim() !== expectedPassword) {
    return res.status(403).json({ error: 'Invalid delete confirmation password.' });
  }

  const regId = req.params.id;
  const success = await repository.deleteRegistration(regId);
  if (!success) {
    return res.status(404).json({ error: 'Registration not found' });
  }

  deleteRegistrationFromGoogleSheet(regId).catch(() => {});

  res.json({ success: true, message: `Registration ${regId} deleted successfully` });
}));

app.patch('/api/admin/settings/environment', requireAdmin, wrap(async (req, res) => {
  const { appEnv } = req.body;
  if (appEnv !== 'development' && appEnv !== 'production') {
    return res.status(400).json({ error: 'appEnv must be "development" or "production"' });
  }

  const updated = await repository.updateSiteSettings({ appEnv });
  res.json({
    ...updated,
    appEnv,
  });
}));

const handleUpdateSettings = async (req: express.Request, res: express.Response) => {
  const updated = await repository.updateSiteSettings(req.body);
  res.json(updated);
};
app.patch('/api/admin/settings', requireAdmin, wrap(handleUpdateSettings));
app.put('/api/admin/settings', requireAdmin, wrap(handleUpdateSettings));

const handleWorkshopClosure = async (req: express.Request, res: express.Response, defaultAction?: 'close' | 'open') => {
  const action = defaultAction || req.params.action;
  const keys = req.body?.keys;
  if (action !== 'close' && action !== 'open') return res.status(404).json({ error: 'Unknown action' });
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 20 ||
      keys.some((k) => typeof k !== 'string' || !k.trim() || k.length > 100)) {
    return res.status(400).json({ error: 'keys must be a non-empty array of strings.' });
  }
  const events = await repository.getEvents(false).catch(() => []);
  const closedWorkshops = action === 'close' ? await closeWorkshops(keys) : await openWorkshops(keys, events);
  res.json({ success: true, closedWorkshops });
};

app.post('/api/admin/closures/:action', requireAdmin, wrap((req, res) => handleWorkshopClosure(req, res)));
app.post('/api/admin/workshops/close', requireAdmin, wrap((req, res) => handleWorkshopClosure(req, res, 'close')));
app.post('/api/admin/workshops/open', requireAdmin, wrap((req, res) => handleWorkshopClosure(req, res, 'open')));

app.patch('/api/admin/events/:id', requireAdmin, wrap(async (req, res) => {
  const updated = await repository.updateEvent(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json(updated);
}));

app.get('/api/admin/emails', requireAdmin, (_req, res) => {
  res.json(emailAuditLog);
});

app.get('/api/admin/diagnostics/counts', requireAdmin, wrap(async (_req, res) => {
  const registrations = await repository.listRegistrations();
  const stats = repository.calculateStatsFromRegistrations(registrations);
  res.json({
    totalCount: registrations.length,
    stats,
    supabaseConfigured: isSupabaseConfigured(),
    timestamp: formatIsoTimestamp(new Date()),
  });
}));

app.get('/api/admin/export-spreadsheet', requireAdmin, wrap(async (_req, res) => {
  const registrations = await repository.listRegistrations();
  const allEvents = await repository.getEvents(false);

  const headers = [
    'registration_code',
    'created_at',
    'registration_type',
    'registered_events',
    'team_leader_name',
    'team_leader_email',
    'team_leader_phone',
    'college_name',
    'department',
    'year_of_study',
    'total_participants',
    'member_2_details',
    'member_3_details',
    'member_4_details',
    'total_amount',
    'payment_method',
    'payment_status',
    'payment_reference',
    'payment_proof_url',
    'attendance_status',
    'updated_at',
  ];

  const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = registrations.map((r) => {
    const eventTitles: string[] = [];
    if (r.selectedWorkshopId) {
      const w = findEventByAnyKey(allEvents, r.selectedWorkshopId);
      if (w) eventTitles.push(w.title);
    }
    for (const tid of r.selectedTechnicalIds) {
      const t = findEventByAnyKey(allEvents, tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of r.selectedNonTechnicalIds) {
      const n = findEventByAnyKey(allEvents, nid);
      if (n) eventTitles.push(n.title);
    }

    const registeredEvents = eventTitles.length > 0 ? eventTitles.join(', ') : (r.eventsText || '');
    const proofUrl = r.paymentProofUrl && r.paymentProofUrl !== 'HAS_PROOF' && r.paymentProofUrl !== 'N/A' ? r.paymentProofUrl : 'N/A';

    return [
      escapeCsv(r.id),
      escapeCsv(formatIsoTimestamp(r.createdAt)),
      escapeCsv(r.registrationType === 'workshop' ? 'workshop' : 'technical'),
      escapeCsv(registeredEvents),
      escapeCsv(r.teamLeader?.fullName || ''),
      escapeCsv(r.teamLeader?.email || ''),
      escapeCsv(r.teamLeader?.phone || ''),
      escapeCsv(r.teamLeader?.college || ''),
      escapeCsv(r.teamLeader?.department || ''),
      escapeCsv(r.teamLeader?.year || ''),
      escapeCsv(r.participants?.length || 1),
      escapeCsv(r.participants[1] ? `${r.participants[1].fullName} (${r.participants[1].phone || ''})` : 'N/A'),
      escapeCsv(r.participants[2] ? `${r.participants[2].fullName} (${r.participants[2].phone || ''})` : 'N/A'),
      escapeCsv(r.participants[3] ? `${r.participants[3].fullName} (${r.participants[3].phone || ''})` : 'N/A'),
      escapeCsv(r.totalAmount),
      escapeCsv(r.paymentMethod ? r.paymentMethod.toUpperCase() : 'UPI'),
      escapeCsv((r.paymentStatus || 'pending_verification').toUpperCase()),
      escapeCsv(r.upiReference || r.paymentId || 'N/A'),
      escapeCsv(proofUrl),
      escapeCsv(r.attendanceMarked ? 'Present' : 'Absent'),
      escapeCsv(formatIsoTimestamp(r.createdAt)),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="EVITRON_2K26_Registrations.csv"');
  res.status(200).send(csvContent);
}));

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`EVITRON 2K26 backend server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;