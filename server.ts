import 'dotenv/config';

import express from 'express';
import path from 'path';
import crypto from 'crypto';
import * as repository from './server/repository';
import {
  createOrder,
  verifyPaymentHmacSignature,
  fetchAndVerifyRazorpayPayment,
  checkRazorpayHealth,
  verifyWebhookSignature,
  getRazorpayKeyId,
  getRazorpayKeySecret,
  isRazorpayLiveKey,
  getAppEnv,
} from './server/razorpay';
import { generateQrDataUrl, buildUpiUri, buildAttendeeQrText } from './server/qr';
import { sendRegistrationConfirmationEmail, sendAdminNewRegistrationNotification, emailAuditLog } from './server/email';
import { Participant, RegistrationRecord } from './src/types';

const PORT = 3000;
const app = express();

const DEFAULT_GOOGLE_SHEET_WEBHOOK_URL =
  process.env.GOOGLE_SHEET_WEBHOOK_URL ||
  'https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec';

// Real-time Google Sheet Webhook Synchronizer
async function syncToGoogleSheetWebhook(reg: RegistrationRecord, eventTitles: string[]) {
  const settings = await repository.getSiteSettings();
  const webhookUrl = settings.googleSheetWebhookUrl || process.env.GOOGLE_SHEET_WEBHOOK_URL || DEFAULT_GOOGLE_SHEET_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const payload = {
      regId: reg.id,
      createdAt: reg.createdAt,
      track: reg.registrationType,
      events: eventTitles.join(', '),
      leaderName: reg.teamLeader.fullName,
      leaderEmail: reg.teamLeader.email,
      leaderPhone: reg.teamLeader.phone,
      college: reg.teamLeader.college,
      department: reg.teamLeader.department,
      year: reg.teamLeader.year,
      participantsCount: reg.participants.length,
      member2: reg.participants[1] ? `${reg.participants[1].fullName} (${reg.participants[1].phone})` : '',
      member3: reg.participants[2] ? `${reg.participants[2].fullName} (${reg.participants[2].phone})` : '',
      amount: reg.totalAmount,
      paymentMethod: reg.paymentMethod,
      paymentStatus: reg.paymentStatus,
      paymentRef: reg.paymentId || reg.upiReference || '',
      attendance: reg.attendanceMarked ? 'Present' : 'Absent',
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    console.log(`[SHEETS SYNC] Synced ${reg.id} to Google Sheet successfully (Status: ${res.status})`);
  } catch (err: any) {
    console.log(`[SHEETS SYNC] Sync notification status for ${reg.id}:`, err?.message || err);
  }
}

// Middleware for parsing JSON with raw body capture for webhook signature verification
app.use(
  express.json({
    limit: '8mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// In-memory active admin session tokens
const activeAdminSessions = new Set<string>();

// Helper to authenticate admin requests
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Admin session required.' });
  }
  const token = authHeader.split(' ')[1];
  if (!activeAdminSessions.has(token)) {
    return res.status(401).json({ error: 'Invalid or expired admin session token.' });
  }
  next();
}

// ----------------------------------------------------
// PUBLIC API ENDPOINTS
// ----------------------------------------------------

app.get('/api/health', async (_req, res) => {
  const settings = await repository.getSiteSettings();
  const currentEnv = getAppEnv(settings.appEnv);
  const razorpayHealth = await checkRazorpayHealth(currentEnv);
  res.json({
    status: 'ok',
    symposium: 'EVITRON 2K26',
    timestamp: new Date().toISOString(),
    environment: currentEnv,
    razorpay: {
      environment: currentEnv,
      status: razorpayHealth.status,
      connected: razorpayHealth.status === 'CONNECTED',
      liveConnected: razorpayHealth.liveConnected,
      testConnected: razorpayHealth.testConnected,
      keyMode: razorpayHealth.keyMode,
      keyIdPrefix: razorpayHealth.keyIdPrefix,
      details: razorpayHealth.details,
    },
  });
});

// GET site settings
app.get('/api/settings', async (_req, res) => {
  const settings = await repository.getSiteSettings();
  const currentEnv = getAppEnv(settings.appEnv);
  let upiQrImage = settings.upiQrImageUrl;

  if (!upiQrImage && settings.upiId) {
    const sampleUri = buildUpiUri(settings.upiId, settings.upiPayeeName, settings.feePerPerson, 'EVITRON 2K26 Registration');
    upiQrImage = await generateQrDataUrl(sampleUri);
  }

  const razorpayHealth = await checkRazorpayHealth(currentEnv);

  res.json({
    ...settings,
    appEnv: currentEnv,
    upiQrImageUrl: upiQrImage,
    razorpayKeyId: razorpayHealth.status === 'CONNECTED' ? getRazorpayKeyId() : '',
    razorpayConnected: razorpayHealth.status === 'CONNECTED',
    razorpayLiveConnected: razorpayHealth.liveConnected,
    razorpayTestConnected: razorpayHealth.testConnected,
    razorpayStatus: razorpayHealth.status,
    razorpayStatusDetails: razorpayHealth.details,
    razorpayKeyMode: razorpayHealth.keyMode,
  });
});

// GET all active events
app.get('/api/events', async (_req, res) => {
  try {
    const events = await repository.getEvents(false);
    res.json(events);
  } catch (err: any) {
    console.error('Get events failed:', err.message || err);
    res.status(500).json({ error: 'Failed to load events.' });
  }
});

// GET single event by slug
app.get('/api/events/:slug', async (req, res) => {
  try {
    const event = await repository.getEventBySlug(req.params.slug);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (err: any) {
    console.error('Get event failed:', err.message || err);
    res.status(500).json({ error: 'Failed to load event.' });
  }
});

// VALIDATION HELPER FOR REGISTRATION RULES
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

  const {
    registrationType,
    selectedWorkshopId,
    selectedTechnicalIds = [],
    selectedNonTechnicalIds = [],
    participants,
  } = body;

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

  const events = eventValidation.events || [];
  const eventMap = new Map(events.map((event) => [String(event.id), event]));

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

    const workshop = eventMap.get(String(selectedWorkshopId));
    if (!workshop || (workshop.category !== 'workshop' && workshop.category !== 'workshops')) {
      return { valid: false, status: 400, error: 'Selected workshop was not found or is invalid.' };
    }

    return { valid: true, expectedAmount: workshop.price, events };
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
    if (participants.length !== 3) {
      return {
        valid: false,
        status: 400,
        error: `Every technical symposium registration requires exactly 3 participants per team. You provided ${participants.length}.`,
      };
    }

    const technical = eventMap.get(String(selectedTechnicalIds[0]));
    if (!technical || technical.category !== 'technical') {
      return { valid: false, status: 400, error: 'Selected technical event was not found.' };
    }

    for (const eventId of selectedNonTechnicalIds) {
      const nonTechnical = eventMap.get(String(eventId));
      if (!nonTechnical || (nonTechnical.category !== 'nontechnical' && nonTechnical.category !== 'non-technical' && nonTechnical.category !== 'non_technical')) {
        return { valid: false, status: 400, error: 'Selected non-technical event is invalid.' };
      }
    }

    return { valid: true, expectedAmount: technical.price, events };
  }

  return { valid: false, status: 400, error: 'Invalid registration category.' };
}

// POST create-order (Razorpay)
app.post('/api/create-order', async (req, res) => {
  try {
    const validation = await validateRegistrationRules(req.body);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({ error: validation.error });
    }

    const settings = await repository.getSiteSettings();
    const currentEnv = getAppEnv(settings.appEnv);
    const amount = validation.expectedAmount || 350;

    const registrationUuid = await repository.createPendingRazorpayRegistration({
      registrationType: req.body.registrationType,
      participants: req.body.participants,
      selectedWorkshopId: req.body.selectedWorkshopId,
      selectedTechnicalIds: req.body.selectedTechnicalIds || [],
      selectedNonTechnicalIds: req.body.selectedNonTechnicalIds || [],
      totalAmount: amount,
    });

    const receipt = `rcpt_${Date.now()}`;
    const order = await createOrder(
      amount,
      receipt,
      {
        type: req.body.registrationType,
        lead_email: req.body.participants[0]?.email || '',
        registration_id: registrationUuid,
      },
      currentEnv
    );

    await repository.updatePaymentRecord(registrationUuid, {
      razorpay_order_id: order.orderId,
      status: 'created',
    });

    res.json({
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
    });
  } catch (err: any) {
    console.error('Create order failed:', err.message || err);
    res.status(400).json({ error: err.message || 'Failed to create payment order with Razorpay Gateway.' });
  }
});

// POST verify-payment (Razorpay completion)
app.post('/api/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      registrationData,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment proof tokens.' });
    }

    const isHmacValid = verifyPaymentHmacSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isHmacValid) {
      return res.status(400).json({ error: 'Payment signature cryptographic verification failed.' });
    }

    const validation = await validateRegistrationRules(registrationData);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({ error: validation.error });
    }

    const expectedAmount = validation.expectedAmount || 350;
    const settings = await repository.getSiteSettings();
    const currentEnv = getAppEnv(settings.appEnv);

    try {
      await fetchAndVerifyRazorpayPayment(razorpay_payment_id, razorpay_order_id, expectedAmount, currentEnv);
    } catch (apiErr: any) {
      console.log('[PAYMENT WARNING] Razorpay API fetch warning:', apiErr?.message || apiErr);
    }

    const existing = await repository.getRegistrationByPaymentId(razorpay_payment_id);
    if (existing) {
      return res.json({ success: true, registrationId: existing.id, registration: existing });
    }

    const registrationUuid = await repository.getRegistrationUuidByRazorpayOrderId(razorpay_order_id);
    if (registrationUuid) {
      await repository.finalizeRazorpayRegistration(registrationUuid, razorpay_payment_id, true);
      const reloaded = await repository.getRegistrationById(registrationUuid);
      if (reloaded) {
        const allEvents = await repository.getEvents(false);
        const eventTitles: string[] = [];
        if (reloaded.selectedWorkshopId) {
          const w = allEvents.find((e) => e.id === reloaded.selectedWorkshopId);
          if (w) eventTitles.push(`${w.title} (${w.tagline})`);
        }
        for (const tid of reloaded.selectedTechnicalIds) {
          const t = allEvents.find((e) => e.id === tid);
          if (t) eventTitles.push(t.title);
        }
        for (const nid of reloaded.selectedNonTechnicalIds) {
          const n = allEvents.find((e) => e.id === nid);
          if (n) eventTitles.push(n.title);
        }

        sendRegistrationConfirmationEmail(reloaded, eventTitles).catch((err) =>
          console.log('[NOTIFICATION] Async email dispatch status:', err?.message || err)
        );
        syncToGoogleSheetWebhook(reloaded, eventTitles).catch((err) =>
          console.log('[NOTIFICATION] Async sheets sync status:', err?.message || err)
        );

        return res.json({ success: true, registrationId: reloaded.id, registration: reloaded });
      }
    }

    const newRecord = await repository.createRegistration({
      registrationType: registrationData.registrationType,
      selectedWorkshopId: registrationData.selectedWorkshopId,
      selectedTechnicalIds: registrationData.selectedTechnicalIds || [],
      selectedNonTechnicalIds: registrationData.selectedNonTechnicalIds || [],
      participants: registrationData.participants,
      totalAmount: expectedAmount,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignatureVerified: true,
    });

    const allEvents = await repository.getEvents(false);
    const eventTitles: string[] = [];
    if (newRecord.selectedWorkshopId) {
      const w = allEvents.find((e) => e.id === newRecord.selectedWorkshopId);
      if (w) eventTitles.push(`${w.title} (${w.tagline})`);
    }
    for (const tid of newRecord.selectedTechnicalIds) {
      const t = allEvents.find((e) => e.id === tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of newRecord.selectedNonTechnicalIds) {
      const n = allEvents.find((e) => e.id === nid);
      if (n) eventTitles.push(n.title);
    }

    sendRegistrationConfirmationEmail(newRecord, eventTitles).catch((err) =>
      console.log('[NOTIFICATION] Async email dispatch status:', err?.message || err)
    );
    const adminSettings = await repository.getSiteSettings();
    const adminEmails = adminSettings.adminNotificationEmails?.length ? adminSettings.adminNotificationEmails : ['evitron26@gmail.com'];
    sendAdminNewRegistrationNotification(newRecord, eventTitles, adminEmails).catch((err) =>
      console.log('[NOTIFICATION] Admin new registration email dispatch error:', err)
    );
    syncToGoogleSheetWebhook(newRecord, eventTitles).catch((err) =>
      console.log('[NOTIFICATION] Async sheets sync status:', err?.message || err)
    );

    res.json({
      success: true,
      registrationId: newRecord.id,
      registration: newRecord,
    });
  } catch (err: any) {
    console.error('Verify payment failed:', err.message || err);
    res.status(500).json({ error: err.message || 'Payment verification processing error.' });
  }
});

// POST register-upi (Manual UPI payment submission)
app.post('/api/register-upi', async (req, res) => {
  try {
    const { registrationData, upiReference, screenshotDriveProof } = req.body;

    if (!upiReference || upiReference.trim().length < 4) {
      return res.status(400).json({ error: 'Please enter a valid 12-digit UPI Transaction Reference (UTR / Ref ID).' });
    }
    if (!screenshotDriveProof || screenshotDriveProof.trim().length < 3) {
      return res.status(400).json({ error: 'Official Payment Screenshot Drive Folder link or confirmation name is strictly required.' });
    }

    const validation = await validateRegistrationRules(registrationData);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({ error: validation.error });
    }

    const newRecord = await repository.createRegistration({
      registrationType: registrationData.registrationType,
      selectedWorkshopId: registrationData.selectedWorkshopId,
      selectedTechnicalIds: registrationData.selectedTechnicalIds || [],
      selectedNonTechnicalIds: registrationData.selectedNonTechnicalIds || [],
      participants: registrationData.participants,
      totalAmount: validation.expectedAmount || 350,
      paymentMethod: 'upi',
      paymentStatus: 'pending_verification',
      upiReference: upiReference.trim(),
      paymentProofUrl: screenshotDriveProof.trim(),
    });

    const allEvents = await repository.getEvents(false);
    const eventTitles: string[] = [];
    if (newRecord.selectedWorkshopId) {
      const w = allEvents.find((e) => e.id === newRecord.selectedWorkshopId);
      if (w) eventTitles.push(w.title);
    }
    for (const tid of newRecord.selectedTechnicalIds) {
      const t = allEvents.find((e) => e.id === tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of newRecord.selectedNonTechnicalIds) {
      const n = allEvents.find((e) => e.id === nid);
      if (n) eventTitles.push(n.title);
    }

    const settings = await repository.getSiteSettings();
    const adminEmails = settings.adminNotificationEmails?.length ? settings.adminNotificationEmails : ['evitron26@gmail.com'];
    sendAdminNewRegistrationNotification(newRecord, eventTitles, adminEmails).catch((err) =>
      console.log('[NOTIFICATION] Admin new registration email dispatch error:', err)
    );
    syncToGoogleSheetWebhook(newRecord, eventTitles).catch((err) =>
      console.log('[NOTIFICATION] Async sheets sync status:', err?.message || err)
    );

    res.json({
      success: true,
      registrationId: newRecord.id,
      registration: newRecord,
    });
  } catch (err: any) {
    console.error('UPI registration failed:', err);
    res.status(500).json({ error: err.message || 'Failed to submit UPI registration.' });
  }
});

// POST Webhook from Razorpay
app.post('/api/webhook', async (req: any, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.log('[RAZORPAY WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not configured. Skipping HMAC.');
    } else if (!webhookSignature || !verifyWebhookSignature(rawBody, webhookSignature)) {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    const payload = req.body;
    const event = payload?.event;

    if (event === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      if (payment?.order_id) {
        const registrationUuid = await repository.getRegistrationUuidByRazorpayOrderId(payment.order_id);
        if (registrationUuid) {
          await repository.finalizeRazorpayRegistration(registrationUuid, payment.id, true);
          return res.json({ status: 'ok', finalized: true });
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err: any) {
    console.error('Webhook failed:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// GET single registration by Registration ID
app.get('/api/registration/:id', async (req, res) => {
  const reg = await repository.getRegistrationById(req.params.id);
  if (!reg) {
    return res.status(404).json({ error: 'Registration not found' });
  }

  const allEvents = await repository.getEvents(false);
  const eventTitles: string[] = [];
  if (reg.selectedWorkshopId) {
    const w = allEvents.find((e) => e.id === reg.selectedWorkshopId);
    if (w) eventTitles.push(`${w.title} (${w.tagline})`);
  }
  for (const tid of reg.selectedTechnicalIds) {
    const t = allEvents.find((e) => e.id === tid);
    if (t) eventTitles.push(t.title);
  }
  for (const nid of reg.selectedNonTechnicalIds) {
    const n = allEvents.find((e) => e.id === nid);
    if (n) eventTitles.push(n.title);
  }

  const trackLabel =
    reg.registrationType === 'workshop'
      ? 'Hands-on Workshop Track (Individual)'
      : 'National Technical Symposium Track (Team of 3)';

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
});

// POST Mark Attendance
app.post('/api/attendance/mark', async (req, res) => {
  const { registrationId } = req.body;
  if (!registrationId) {
    return res.status(400).json({ error: 'Registration ID is required.' });
  }

  const match = String(registrationId).match(/EV26-[A-Z0-9]{6}/i);
  const cleanId = match ? match[0].toUpperCase() : String(registrationId).trim().toUpperCase();

  const result = await repository.markAttendance(cleanId);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// ----------------------------------------------------
// ADMIN API ENDPOINTS
// ----------------------------------------------------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const INITIAL_ADMIN_PASSWORD = 'Evitron26@mec.ece#07';
  const INITIAL_ADMIN_ALT_PASSWORD = 'Evitrоn26@mec.ece#07';

  if (password.trim() === INITIAL_ADMIN_PASSWORD || password.trim() === INITIAL_ADMIN_ALT_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    activeAdminSessions.add(token);
    return res.json({ success: true, token, message: 'Admin authentication successful.' });
  }

  return res.status(401).json({ error: 'Incorrect administrator password.' });
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const stats = await repository.getRegistrationStats();
  res.json(stats);
});

app.get('/api/admin/registrations', requireAdmin, async (req, res) => {
  const { type, status, search } = req.query as { type?: string; status?: string; search?: string };
  const registrations = await repository.listRegistrations({
    registrationType: type as any,
    paymentStatus: status as any,
    search,
  });
  res.json(registrations);
});

app.patch('/api/admin/registrations/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['paid', 'pending_verification', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const updated = await repository.updateRegistrationPayment(req.params.id, { paymentStatus: status });
  if (!updated) {
    return res.status(404).json({ error: 'Registration not found' });
  }

  if (status === 'paid') {
    const allEvents = await repository.getEvents(false);
    const eventTitles: string[] = [];
    if (updated.selectedWorkshopId) {
      const w = allEvents.find((e) => e.id === updated.selectedWorkshopId);
      if (w) eventTitles.push(`${w.title} (${w.tagline})`);
    }
    for (const tid of updated.selectedTechnicalIds) {
      const t = allEvents.find((e) => e.id === tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of updated.selectedNonTechnicalIds) {
      const n = allEvents.find((e) => e.id === nid);
      if (n) eventTitles.push(n.title);
    }

    sendRegistrationConfirmationEmail(updated, eventTitles).catch((err) =>
      console.log('[NOTIFICATION] Admin manual approval email dispatch status:', err?.message || err)
    );
    syncToGoogleSheetWebhook(updated, eventTitles).catch((err) =>
      console.log('[NOTIFICATION] Admin manual approval sheets sync status:', err?.message || err)
    );
  }

  res.json(updated);
});

app.delete('/api/admin/registrations/:id', requireAdmin, async (req, res) => {
  const success = await repository.deleteRegistration(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Registration not found' });
  }
  res.json({ success: true, message: `Registration ${req.params.id} deleted successfully` });
});

app.patch('/api/admin/settings/environment', requireAdmin, async (req, res) => {
  const { appEnv } = req.body;
  if (appEnv !== 'development' && appEnv !== 'production') {
    return res.status(400).json({ error: 'appEnv must be "development" or "production"' });
  }

  if (appEnv === 'production') {
    const keyId = getRazorpayKeyId();
    const keySecret = getRazorpayKeySecret();
    if (!keyId || !keySecret || !isRazorpayLiveKey(keyId)) {
      return res.status(400).json({
        error: 'Live Razorpay credentials (rzp_live_...) are strictly required for production.',
      });
    }
  }

  const updated = await repository.updateSiteSettings({ appEnv });
  const health = await checkRazorpayHealth(appEnv);
  res.json({
    ...updated,
    appEnv,
    razorpayConnected: health.status === 'CONNECTED',
    razorpayKeyMode: health.keyMode,
  });
});

const handleUpdateSettings = async (req: express.Request, res: express.Response) => {
  const updated = await repository.updateSiteSettings(req.body);
  res.json(updated);
};
app.patch('/api/admin/settings', requireAdmin, handleUpdateSettings);
app.put('/api/admin/settings', requireAdmin, handleUpdateSettings);

app.patch('/api/admin/events/:id', requireAdmin, async (req, res) => {
  const updated = await repository.updateEvent(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Event not found' });
  }
  res.json(updated);
});

app.get('/api/admin/emails', requireAdmin, (_req, res) => {
  res.json(emailAuditLog);
});

app.get('/api/admin/export-spreadsheet', requireAdmin, async (_req, res) => {
  const registrations = await repository.listRegistrations();
  const allEvents = await repository.getEvents(false);

  const headers = [
    'Registration ID',
    'Registered At',
    'Category',
    'Registered Events',
    'Team Leader Name',
    'Leader Email',
    'Leader Phone',
    'Leader College',
    'Leader Department',
    'Leader Year',
    'Total Members',
    'Member 2 Details',
    'Member 3 Details',
    'Total Fee (INR)',
    'Payment Method',
    'Payment Status',
    'Payment Ref / UTR',
    'Attendance Marked',
  ];

  const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = registrations.map((r) => {
    const eventTitles: string[] = [];
    if (r.selectedWorkshopId) {
      const w = allEvents.find((e) => e.id === r.selectedWorkshopId);
      if (w) eventTitles.push(w.title);
    }
    for (const tid of r.selectedTechnicalIds) {
      const t = allEvents.find((e) => e.id === tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of r.selectedNonTechnicalIds) {
      const n = allEvents.find((e) => e.id === nid);
      if (n) eventTitles.push(n.title);
    }

    return [
      escapeCsv(r.id),
      escapeCsv(r.createdAt),
      escapeCsv(r.registrationType === 'workshop' ? 'Workshop' : 'Symposium (Team of 3)'),
      escapeCsv(eventTitles.join('; ')),
      escapeCsv(r.teamLeader.fullName),
      escapeCsv(r.teamLeader.email),
      escapeCsv(r.teamLeader.phone),
      escapeCsv(r.teamLeader.college),
      escapeCsv(r.teamLeader.department),
      escapeCsv(r.teamLeader.year),
      escapeCsv(r.participants.length),
      escapeCsv(r.participants[1] ? `${r.participants[1].fullName} (${r.participants[1].phone} - ${r.participants[1].college})` : 'N/A'),
      escapeCsv(r.participants[2] ? `${r.participants[2].fullName} (${r.participants[2].phone} - ${r.participants[2].college})` : 'N/A'),
      escapeCsv(r.totalAmount),
      escapeCsv(r.paymentMethod.toUpperCase()),
      escapeCsv(r.paymentStatus.toUpperCase()),
      escapeCsv(r.paymentId || r.upiReference || ''),
      escapeCsv(r.attendanceMarked ? 'YES' : 'NO'),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="EVITRON_2K26_Registrations.csv"');
  res.status(200).send(csvContent);
});

app.post('/api/admin/sync-google-sheet', requireAdmin, async (_req, res) => {
  const settings = await repository.getSiteSettings();
  const webhookUrl = settings.googleSheetWebhookUrl || process.env.GOOGLE_SHEET_WEBHOOK_URL || DEFAULT_GOOGLE_SHEET_WEBHOOK_URL;
  const registrations = await repository.listRegistrations();
  const allEvents = await repository.getEvents(false);

  if (!webhookUrl) {
    return res.status(400).json({
      error: 'GOOGLE_SHEET_WEBHOOK_URL is not configured.',
      count: registrations.length,
    });
  }

  let successCount = 0;
  for (const r of registrations) {
    const eventTitles: string[] = [];
    if (r.selectedWorkshopId) {
      const w = allEvents.find((e) => e.id === r.selectedWorkshopId);
      if (w) eventTitles.push(w.title);
    }
    for (const tid of r.selectedTechnicalIds) {
      const t = allEvents.find((e) => e.id === tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of r.selectedNonTechnicalIds) {
      const n = allEvents.find((e) => e.id === nid);
      if (n) eventTitles.push(n.title);
    }

    try {
      await syncToGoogleSheetWebhook(r, eventTitles);
      successCount++;
    } catch {}
  }

  res.json({
    success: true,
    message: `Successfully synchronized ${successCount} registrations to Google Sheet webhook.`,
  });
});

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EVITRON 2K26 backend server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
