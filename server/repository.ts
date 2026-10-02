import fs from 'fs';
import path from 'path';
import { supabaseAdmin, isSupabaseConfigured } from './supabase.js';
import {
  EventItem,
  Participant,
  RegistrationRecord,
  SiteSettings,
} from '../src/types.js';
import { initialSiteSettings } from '../src/data/defaultSettings.js';
import { initialEvents } from '../src/data/defaultEvents.js';

import { readClosedWorkshops, CLOSURE_KEY } from './closureStore.js';

type DbEvent = Record<string, any>;
type DbParticipant = Record<string, any>;
type DbRegistration = Record<string, any>;

const SETTINGS_FILE_PATH = path.resolve(process.cwd(), 'data', 'site_settings.json');
const SYMPOSIUM_DB_PATH = path.resolve(process.cwd(), 'data', 'symposium_db.json');

const RUNTIME_ONLY_KEYS = [
  CLOSURE_KEY, 'closureStateLoaded', 'razorpayKeyId', 'razorpayConnected', 'razorpayLiveConnected',
  'razorpayTestConnected', 'razorpayStatus', 'razorpayStatusDetails', 'razorpayKeyMode',
];

function stripRuntime<T extends Record<string, any>>(obj: T): T {
  const copy: any = { ...obj };
  for (const k of RUNTIME_ONLY_KEYS) delete copy[k];
  return copy;
}

async function withClosures(base: SiteSettings): Promise<SiteSettings> {
  const rest: any = { ...base };
  delete rest[CLOSURE_KEY];
  try {
    const closedWorkshops = await readClosedWorkshops();
    return { ...rest, closedWorkshops, closureStateLoaded: true };
  } catch (err: any) {
    console.error('[CLOSURE] Could not load closure state:', err?.message || err);
    return { ...rest, closureStateLoaded: false };
  }
}

function loadPersistentSettings(): SiteSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return stripRuntime({ ...initialSiteSettings, ...parsed });
      }
    }
  } catch (err) {
    console.warn('[SETTINGS FILE READ NOTICE]', err);
  }

  try {
    if (fs.existsSync(SYMPOSIUM_DB_PATH)) {
      const raw = fs.readFileSync(SYMPOSIUM_DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.settings && typeof parsed.settings === 'object') {
        return stripRuntime({ ...initialSiteSettings, ...parsed.settings });
      }
    }
  } catch (err) {
    console.warn('[SYMPOSIUM_DB READ NOTICE]', err);
  }

  return stripRuntime({ ...initialSiteSettings });
}

function savePersistentSettings(settings: SiteSettings) {
  try {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const rest = stripRuntime(settings as any);
    let existing: any = null;
    try { existing = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, 'utf8')); } catch {}
    const out = Array.isArray(existing?.[CLOSURE_KEY]) ? { ...rest, [CLOSURE_KEY]: existing[CLOSURE_KEY] } : rest;
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(out, null, 2), 'utf8');

    if (fs.existsSync(SYMPOSIUM_DB_PATH)) {
      try {
        const db = JSON.parse(fs.readFileSync(SYMPOSIUM_DB_PATH, 'utf8')) || {};
        db.settings = { ...(db.settings || {}), ...rest }; // rest has no closedWorkshops, so db's copy is untouched
        fs.writeFileSync(SYMPOSIUM_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
      } catch {}
    }
  } catch (err) {
    console.warn('[SETTINGS FILE WRITE NOTICE]', err);
  }
}

export function cleanWorkshopTitle(raw: string | undefined): string {
  if (!raw) return 'Workshop';
  const s = raw.toLowerCase();
  if (s.includes('silicon') || s.includes('gds') || s.includes('cadence') || s.includes('vlsi') || s === '4e91a80e-4baa-4fc2-bf6c-7f95e135fc80' || s === 'ws-silicon-2-gds' || s === 'silicon-2-gds') {
    return 'SILICON 2 GDS';
  }
  if (s.includes('instrumentation') || s.includes('labview') || s.includes('virtual') || s.includes('daq') || s === 'ee27539a-2318-44da-9697-bb859ed57a50' || s === 'ws-virtual-instrumentation' || s === 'virtual-instrumentation') {
    return 'Virtual Instrumentation';
  }
  if (s.includes('embedded') || s.includes('microcontroller') || s.includes('arm') || s === 'd6699fda-e9a5-404d-88e8-bd9e0610988e' || s === 'ws-embedded-system' || s === 'embedded-system') {
    return 'Embedded System';
  }
  return raw.replace(/ws-/i, '').trim() || 'Workshop';
}

function mapEvent(row: DbEvent): EventItem {
  const metadata = (row.extra_metadata || {}) as Record<string, any>;
  const coordinator = (row.coordinator || {}) as Record<string, any>;

  return {
    id: row.id,
    slug: row.code || metadata.slug || row.id,
    title: row.name,
    tagline: metadata.tagline || '',
    category:
      row.category === 'workshop' || row.category === 'workshops'
        ? 'workshops'
        : row.category === 'non_technical' || row.category === 'non-technical' || row.category === 'nontechnical'
        ? 'non-technical'
        : row.category || 'technical',
    description: row.description || '',
    venue: metadata.venue || '',
    time: metadata.time || '',
    date: metadata.date || '08/10/2026',
    eligibility: metadata.eligibility || '',
    teamSize: row.category === 'technical' ? 4 : row.max_team_size || 1,
    minTeamSize: metadata.minTeamSize || (row.category === 'technical' ? 2 : 1),
    maxTeamSize: metadata.maxTeamSize || (row.category === 'technical' ? 4 : row.max_team_size || 1),
    teamSizeLabel:
      metadata.teamSizeLabel ||
      ((row.max_team_size || 1) === 1
        ? 'Individual (1 Participant)'
        : row.category === 'technical'
        ? 'Team of 2 to 4 Participants'
        : `Team of ${row.max_team_size} Participants`),
    feePerPerson: Number(row.price || 0),
    rules: Array.isArray(row.rules) ? row.rules : [],
    procedure: Array.isArray(row.procedure) ? row.procedure : [],
    perks: Array.isArray(row.perks) ? row.perks : [],
    outcomes: Array.isArray(metadata.outcomes) ? metadata.outcomes : [],
    certificates: metadata.certificates || '',
    importantInstructions: Array.isArray(metadata.importantInstructions)
      ? metadata.importantInstructions
      : [],
    themes: Array.isArray(metadata.themes)
      ? metadata.themes
      : (row.code === 'techpaper' || row.id === 'tech-techpaper' || (row.name && row.name.toLowerCase().includes('techpaper')))
      ? [
          'Emerging Electronics, Embedded Systems & IoT',
          'Next-Generation Semiconductor & VLSI Technologies',
          'Artificial Intelligence, Computing & Cybersecurity',
          'Sustainable Technology, Environmental Innovation & Clean Energy',
        ]
      : undefined,
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
    coordinatorName: coordinator.name || metadata.coordinatorName || '[COORDINATOR NAME]',
    coordinatorPhone: coordinator.phone || metadata.coordinatorPhone || '[COORDINATOR PHONE]',
    coordinatorEmail: coordinator.email || metadata.coordinatorEmail || 'evitron26@gmail.com',
    isActive: Boolean(row.is_active),
  };
}

let cachedSiteSettings: SiteSettings = loadPersistentSettings();

async function getBaseSettings(): Promise<SiteSettings> {
  if (!isSupabaseConfigured()) {
    return cachedSiteSettings;
  }

  try {
    // 1. Try key-value schema (key, value)
    const kvQuery = await supabaseAdmin.from('site_settings').select('key,value');
    if (!kvQuery.error && kvQuery.data && kvQuery.data.length > 0) {
      const settings: Record<string, any> = { ...cachedSiteSettings };
      for (const row of kvQuery.data) {
        if (!row.key || row.key === CLOSURE_KEY) continue;
        try {
          settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        } catch {
          settings[row.key] = row.value;
        }
      }
      cachedSiteSettings = settings as SiteSettings;
      savePersistentSettings(cachedSiteSettings);
      return cachedSiteSettings;
    }
  } catch (err: any) {
    console.warn('[SETTINGS NOTICE] Error reading site_settings:', err?.message || err);
  }

  return cachedSiteSettings;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  return withClosures(await getBaseSettings());
}

export async function updateSiteSettings(
  partial: Partial<SiteSettings>,
  updatedBy?: string
): Promise<SiteSettings> {
  const safe = stripRuntime(partial as any) as Partial<SiteSettings>; // closure list can NEVER be set here
  cachedSiteSettings = { ...cachedSiteSettings, ...safe };
  savePersistentSettings(cachedSiteSettings);

  if (isSupabaseConfigured() && Object.keys(safe).length > 0) {
    const rows = Object.entries(safe).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''),
      ...(updatedBy ? { updated_by: updatedBy } : {}),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin.from('site_settings').upsert(rows, { onConflict: 'key' });
    if (error && !error.message.includes('row-level security')) {
      console.warn('[SETTINGS] Supabase upsert notice:', error.message);
    }
  }
  return withClosures(cachedSiteSettings);
}

export async function getEvents(includeInactive = true): Promise<EventItem[]> {
  if (!isSupabaseConfigured()) {
    return initialEvents;
  }

  let query = supabaseAdmin.from('events').select('*').order('sort_order', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export async function getEventBySlug(slug: string): Promise<EventItem | undefined> {
  if (!isSupabaseConfigured()) {
    return initialEvents.find((e) => e.slug === slug || e.id === slug);
  }

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .or(`code.eq.${slug},id.eq.${slug}`)
    .maybeSingle();

  if (error) throw error;
  if (!data) return undefined;
  return mapEvent(data);
}

async function resolveEventInfo(eventIdentifier: string): Promise<{ id: string; price: number; name: string; category: string } | null> {
  if (!eventIdentifier) return null;
  const clean = eventIdentifier.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);

  const { data: dbEvents } = await supabaseAdmin.from('events').select('id, code, name, category, price');
  if (!dbEvents || dbEvents.length === 0) return null;

  if (isUuid) {
    const foundById = dbEvents.find(e => e.id.toLowerCase() === clean.toLowerCase());
    if (foundById) return { id: foundById.id, price: Number(foundById.price || 0), name: foundById.name, category: foundById.category };
  }

  const cleanLower = clean.toLowerCase();
  const stripped = cleanLower
    .replace(/^tech-/, '')
    .replace(/^ws-/, '')
    .replace(/^non-/, '')
    .replace(/^nontech-/, '');

  const match = dbEvents.find(e => {
    const codeLower = (e.code || '').toLowerCase();
    const nameLower = (e.name || '').toLowerCase();
    return (
      e.id === clean ||
      codeLower === cleanLower ||
      codeLower === stripped ||
      nameLower === cleanLower ||
      nameLower === stripped ||
      nameLower.replace(/\s+/g, '-') === stripped ||
      (stripped.includes('paper') && (codeLower.includes('paper') || nameLower.includes('paper'))) ||
      (stripped.includes('evolvex') && codeLower.includes('evolvex')) ||
      (stripped.includes('project') && (codeLower.includes('evolvex') || nameLower.includes('evolvex'))) ||
      (stripped.includes('tracktron') && codeLower.includes('tracktron')) ||
      ((stripped.includes('line') || stripped.includes('robot')) && codeLower.includes('tracktron')) ||
      (stripped.includes('silicon') && codeLower.includes('silicon')) ||
      (stripped.includes('cadence') && codeLower.includes('silicon')) ||
      (stripped.includes('embedded') && codeLower.includes('embedded')) ||
      ((stripped.includes('virtual') || stripped.includes('instrumentation') || stripped.includes('labview')) && codeLower.includes('virtual')) ||
      ((stripped.includes('mind') || stripped.includes('maze')) && codeLower.includes('mind')) ||
      (stripped.includes('prompt') && codeLower.includes('prompt')) ||
      (stripped.includes('mem') && codeLower.includes('mem')) ||
      (stripped.includes('detective') && codeLower.includes('detective'))
    );
  });

  if (match) {
    return { id: match.id, price: Number(match.price || 0), name: match.name, category: match.category };
  }

  return null;
}

export async function validateRegistrationEvents(
  eventIds: string[]
): Promise<{ valid: boolean; error?: string; events?: Array<{ id: string; code?: string; slug?: string; category: string; price: number; isActive: boolean; name: string }> }> {
  const uniqueIds = [...new Set(eventIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { valid: false, error: 'No events selected.' };
  }

  if (!isSupabaseConfigured()) {
    const matched = initialEvents.filter((e) => uniqueIds.includes(e.id));
    if (matched.length !== uniqueIds.length) {
      return { valid: false, error: 'One or more selected events do not exist.' };
    }
    return {
      valid: true,
      events: matched.map((e) => ({
        id: e.id,
        code: e.slug,
        slug: e.slug,
        name: e.title,
        category: e.category,
        price: e.feePerPerson,
        isActive: e.isActive,
      })),
    };
  }

  const { data: dbEvents, error } = await supabaseAdmin
    .from('events')
    .select('id,code,name,category,price,is_active');

  if (error || !dbEvents || dbEvents.length === 0) {
    throw error || new Error('Failed to fetch events from database');
  }

  const matchedEvents: any[] = [];
  for (const rawId of uniqueIds) {
    const resolved = await resolveEventInfo(rawId);
    if (!resolved) {
      return { valid: false, error: `One or more selected events do not exist (${rawId}).` };
    }
    const full = dbEvents.find(e => e.id === resolved.id);
    if (!full || !full.is_active) {
      return { valid: false, error: `The selected event "${resolved.name}" is currently inactive.` };
    }
    matchedEvents.push({
      id: full.id,
      code: full.code,
      slug: full.code,
      name: full.name,
      category: String(full.category).toLowerCase(),
      price: Number(full.price || 0),
      isActive: Boolean(full.is_active),
    });
  }

  return { valid: true, events: matchedEvents };
}

export async function updateEvent(
  id: string,
  partial: Partial<EventItem>
): Promise<EventItem | null> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const existing = await supabaseAdmin.from('events').select('*').eq('id', id).maybeSingle();
  if (existing.error || !existing.data) {
    throw existing.error || new Error(`Event with ID ${id} not found.`);
  }

  const current = mapEvent(existing.data);
  const merged = { ...current, ...partial };
  const dbCategory = merged.category === 'non-technical' ? 'non_technical' : merged.category;

  const { data, error } = await supabaseAdmin
    .from('events')
    .update({
      name: merged.title,
      description: merged.description,
      category: dbCategory,
      max_team_size: merged.teamSize,
      price: merged.feePerPerson,
      rules: merged.rules,
      procedure: merged.procedure,
      perks: merged.perks,
      faqs: merged.faqs,
      is_active: merged.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data ? mapEvent(data) : null;
}

function participantFromRow(row: DbParticipant): Participant {
  return {
    fullName: row.full_name || 'Attendee',
    email: row.email || '',
    phone: row.phone || '',
    college: row.college || '',
    department: row.department || undefined,
    year: row.year_of_study || undefined,
  };
}

function normalizeRegistrationCode(value: string): string {
  return value.trim().toUpperCase();
}

export function mapRegistration(row: DbRegistration, truncateProof = false): RegistrationRecord {
  const pRows = Array.isArray(row.participants)
    ? [...row.participants].sort((a, b) => {
        const aOrder = Number(a.participant_order || 99);
        const bOrder = Number(b.participant_order || 99);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.full_name || '').localeCompare(b.full_name || '');
      })
    : [];

  const participantsList = pRows.map(participantFromRow);
  const leaderRow = pRows.find((p: any) => p.is_team_leader) || pRows[0];
  const leader = leaderRow
    ? participantFromRow(leaderRow)
    : { fullName: 'Attendee', email: '', phone: '', college: '' };

  const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;

  let regWorkshopId: string | undefined;
  const regTechnicalIds: string[] = [];
  const regNonTechnicalIds: string[] = [];

  const eventsList = Array.isArray(row.registration_events) ? row.registration_events : [];
  const eventNames: string[] = [];
  for (const re of eventsList) {
    if (!re || !re.event_id) continue;
    if (re.events?.name) eventNames.push(re.events.name);
    const cat = String(re.events?.category || '').toLowerCase();
    if (cat === 'workshop' || cat === 'workshops') {
      regWorkshopId = re.event_id;
    } else if (cat === 'non_technical' || cat === 'non-technical' || cat === 'nontechnical') {
      regNonTechnicalIds.push(re.event_id);
    } else {
      regTechnicalIds.push(re.event_id);
    }
  }

  const rawProofUrl = payment?.payment_proof_url || undefined;
  const hasProof = Boolean(rawProofUrl || row.drive_screenshot_submitted);
  const paymentProofUrl = truncateProof && hasProof ? 'HAS_PROOF' : rawProofUrl;

  return {
    id: row.registration_code,
    createdAt: row.created_at,
    registrationType: row.registration_type === 'individual' ? 'workshop' : 'technical',
    selectedWorkshopId: regWorkshopId,
    selectedTechnicalIds: regTechnicalIds,
    selectedNonTechnicalIds: regNonTechnicalIds,
    eventsText: eventNames.length > 0 ? eventNames.join(', ') : undefined,
    participants: participantsList,
    teamLeader: leader,
    totalAmount: Number(row.total_amount || 0),
    paymentMethod: row.payment_method === 'razorpay' ? 'razorpay' : 'upi',
    paymentStatus: row.payment_status === 'pending' ? 'pending_verification' : (row.payment_status || 'pending_verification'),
    paymentId: payment?.razorpay_payment_id || undefined,
    upiReference: payment?.upi_reference || undefined,
    driveScreenshotSubmitted: Boolean(rawProofUrl || payment?.upi_reference),
    paymentProofUrl,
    attendanceMarked: Boolean(row.attendance_marked),
    attendanceTimestamp: row.attendance_marked_at || undefined,
  };
}

async function assembleRegistrations(regsData: any[]): Promise<any[]> {
  if (!regsData || regsData.length === 0) return [];
  const regIds = regsData.map((r) => r.id);

  const [partsRes, paymentsRes, regEventsRes] = await Promise.all([
    supabaseAdmin
      .from('registration_participants')
      .select('registration_id, role, participants(*)')
      .in('registration_id', regIds),
    supabaseAdmin.from('payments').select('*').in('registration_id', regIds),
    supabaseAdmin.from('registration_events').select('*, events(*)').in('registration_id', regIds),
  ]);

  if (partsRes.error) throw partsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (regEventsRes.error) throw regEventsRes.error;

  const participantsMap = new Map<string, any[]>();
  for (const item of (partsRes.data || [])) {
    const p = item.participants;
    if (!p) continue;
    const list = participantsMap.get(item.registration_id) || [];
    list.push({
      ...p,
      is_team_leader: item.role === 'team_leader' || item.role === 'leader',
    });
    participantsMap.set(item.registration_id, list);
  }

  const paymentsMap = new Map<string, any[]>();
  for (const p of (paymentsRes.data || [])) {
    const list = paymentsMap.get(p.registration_id) || [];
    list.push(p);
    paymentsMap.set(p.registration_id, list);
  }

  const regEventsMap = new Map<string, any[]>();
  for (const re of (regEventsRes.data || [])) {
    const list = regEventsMap.get(re.registration_id) || [];
    list.push(re);
    regEventsMap.set(re.registration_id, list);
  }

  return regsData.map((row) => ({
    ...row,
    participants: participantsMap.get(row.id) || [],
    payments: paymentsMap.get(row.id) || [],
    registration_events: regEventsMap.get(row.id) || [],
  }));
}

const localRegistrationsCache = new Map<string, RegistrationRecord>();

export async function getRegistrationById(
  registrationCode: string
): Promise<RegistrationRecord | undefined> {
  const code = normalizeRegistrationCode(registrationCode);
  if (localRegistrationsCache.has(code)) {
    return localRegistrationsCache.get(code);
  }

  if (isSupabaseConfigured()) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
      let query = supabaseAdmin.from('registrations').select('*');
      if (isUuid) {
        query = query.or(`registration_code.eq.${code},id.eq.${code}`);
      } else {
        query = query.eq('registration_code', code);
      }
      const { data, error } = await query.maybeSingle();

      if (!error && data) {
        const assembled = await assembleRegistrations([data]);
        if (assembled[0]) {
          const mapped = mapRegistration(assembled[0]);
          localRegistrationsCache.set(code, mapped);
          return mapped;
        }
      }
    } catch (err: any) {
      console.warn('[REGISTRATION NOTICE] Error loading from Supabase:', err?.message || err);
    }
  }

  const all = await listRegistrations();
  const found = all.find((r) => r.id.toUpperCase() === code.toUpperCase());
  if (found) {
    localRegistrationsCache.set(code, found);
    return found;
  }

  return undefined;
}

export async function getRegistrationByPaymentId(
  paymentId: string
): Promise<RegistrationRecord | undefined> {
  for (const reg of localRegistrationsCache.values()) {
    if (reg.paymentId === paymentId || reg.upiReference === paymentId) {
      return reg;
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabaseAdmin
        .from('payments')
        .select('registration_id')
        .eq('razorpay_payment_id', paymentId)
        .maybeSingle();

      if (!error && data?.registration_id) {
        return getRegistrationByUuid(data.registration_id);
      }
    } catch (err: any) {
      console.warn('[PAYMENT NOTICE] Error finding payment:', err?.message || err);
    }
  }

  return undefined;
}

export async function getRegistrationByUuid(uuid: string): Promise<RegistrationRecord | undefined> {
  if (localRegistrationsCache.has(uuid)) {
    return localRegistrationsCache.get(uuid);
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabaseAdmin
        .from('registrations')
        .select('*')
        .eq('id', uuid)
        .maybeSingle();

      if (!error && data) {
        const assembled = await assembleRegistrations([data]);
        if (assembled[0]) {
          const mapped = mapRegistration(assembled[0]);
          localRegistrationsCache.set(mapped.id, mapped);
          return mapped;
        }
      }
    } catch (err: any) {
      console.warn('[REGISTRATION UUID NOTICE] Error loading by uuid:', err?.message || err);
    }
  }

  return undefined;
}

export async function getRegistrationUuidByRazorpayOrderId(
  razorpayOrderId: string
): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined;
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('registration_id')
    .eq('razorpay_order_id', razorpayOrderId)
    .eq('method', 'razorpay')
    .maybeSingle();

  if (error) return undefined;
  return data?.registration_id;
}

export async function finalizeRazorpayRegistration(
  registrationUuid: string,
  razorpayPaymentId: string,
  signatureVerified: boolean
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabaseAdmin.rpc(
    'finalize_razorpay_registration',
    {
      p_registration_id: registrationUuid,
      p_razorpay_payment_id: razorpayPaymentId,
      p_signature_verified: signatureVerified,
    }
  );
  if (error) throw error;
}

async function selfHealParticipants(registrationUuid: string, inputParticipants: Participant[]): Promise<void> {
  // Query exact old participant IDs first before inserting new ones
  const { data: existingRows } = await supabaseAdmin
    .from('participants')
    .select('id')
    .eq('registration_id', registrationUuid);
  const oldIds = (existingRows || []).map((r) => r.id);

  const newInsertedIds: string[] = [];

  // 1. Insert new participants first
  for (let idx = 0; idx < inputParticipants.length; idx++) {
    const p = inputParticipants[idx];
    const { data: pData, error: pInsertErr } = await supabaseAdmin
      .from('participants')
      .insert({
        registration_id: registrationUuid,
        full_name: p.fullName,
        email: p.email || '',
        phone: p.phone || '',
        college: p.college || '',
        department: p.department || null,
        year_of_study: p.year || null,
        is_team_leader: idx === 0,
        participant_order: idx + 1,
      })
      .select('id')
      .maybeSingle();

    if (pInsertErr || !pData?.id) {
      console.error(`[DB] selfHealParticipants participant [${idx}] insert failed:`, pInsertErr?.message || 'No ID returned');
      continue;
    }
    newInsertedIds.push(pData.id);
  }

  // 2. Delete the old participants by ID
  if (oldIds.length > 0) {
    const { error: pDelErr } = await supabaseAdmin
      .from('participants')
      .delete()
      .in('id', oldIds);

    if (pDelErr) {
      console.warn('[DB] selfHealParticipants participants delete warning:', pDelErr.message);
    }
  }
}

export async function createPendingRazorpayRegistration(input: {
  registrationType: RegistrationRecord['registrationType'];
  participants: Participant[];
  selectedWorkshopId?: string;
  selectedTechnicalIds: string[];
  selectedNonTechnicalIds: string[];
  totalAmount: number;
}): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const registrationCode = `EV26-${code}`;

  const eventIds = [
    ...(input.selectedWorkshopId ? [input.selectedWorkshopId] : []),
    ...input.selectedTechnicalIds,
    ...input.selectedNonTechnicalIds,
  ];
  const dbRegType = input.registrationType === 'workshop' ? 'individual' : 'team';

  // 1. Insert into registrations
  const { data: reg, error: regErr } = await supabaseAdmin
    .from('registrations')
    .insert({
      registration_code: registrationCode,
      registration_type: dbRegType,
      total_amount: input.totalAmount,
      payment_method: 'razorpay',
      payment_status: 'pending',
    })
    .select('id')
    .single();

  if (regErr || !reg?.id) {
    throw regErr || new Error('Failed to create registration record in Supabase');
  }

  const uuid = reg.id;

  // 2. Insert participants with valid check constraint role ('team_leader' and 'member')
  for (let idx = 0; idx < input.participants.length; idx++) {
    const p = input.participants[idx];
    const { data: pData, error: pInsertErr } = await supabaseAdmin
      .from('participants')
      .insert({
        full_name: p.fullName,
        email: p.email || '',
        phone: p.phone || '',
        college: p.college || '',
        department: p.department || null,
        year_of_study: p.year || null,
      })
      .select('id')
      .single();

    if (pInsertErr || !pData?.id) {
      console.error(`[DB] createPendingRazorpayRegistration participant [${idx}] insert failed:`, pInsertErr?.message);
      continue;
    }

    const { error: rpErr } = await supabaseAdmin
      .from('registration_participants')
      .insert({
        registration_id: uuid,
        participant_id: pData.id,
        role: idx === 0 ? 'team_leader' : 'member',
      });

    if (rpErr) {
      console.error(`[DB] createPendingRazorpayRegistration registration_participants [${idx}] insert failed:`, rpErr.message);
    }
  }

  // 3. Insert initial payment record
  await supabaseAdmin
    .from('payments')
    .insert({
      registration_id: uuid,
      amount: input.totalAmount,
      method: 'razorpay',
      status: 'pending',
    });

  // 4. Insert registration_events with resolved UUIDs and prices
  for (const rawId of eventIds) {
    const resolved = await resolveEventInfo(rawId);
    if (resolved) {
      const defaultPrice = resolved.category === 'workshop' ? 300 : 250;
      await supabaseAdmin
        .from('registration_events')
        .insert({
          registration_id: uuid,
          event_id: resolved.id,
          price_at_registration: resolved.price || defaultPrice,
        });
    }
  }

  return uuid;
}

export interface RegistrationCreateInput {
  registrationCode?: string;
  registrationType: 'workshop' | 'technical';
  paymentMethod: 'razorpay' | 'upi';
  paymentStatus: 'paid' | 'pending_verification' | 'failed';
  totalAmount: number;
  selectedWorkshopId?: string;
  selectedTechnicalIds: string[];
  selectedNonTechnicalIds: string[];
  participants: Participant[];
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignatureVerified?: boolean;
  upiReference?: string;
  paymentProofUrl?: string;
}

export async function createRegistration(input: RegistrationCreateInput): Promise<RegistrationRecord> {
  let code = input.registrationCode;
  if (!code) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `EV26-${rand}`;
  }

  const leader = input.participants[0] || {
    fullName: 'Participant',
    email: '',
    phone: '',
    college: '',
  };

  const createdRecord: RegistrationRecord = {
    id: code,
    createdAt: new Date().toISOString(),
    registrationType: input.registrationType,
    selectedWorkshopId: input.selectedWorkshopId,
    selectedTechnicalIds: input.selectedTechnicalIds || [],
    selectedNonTechnicalIds: input.selectedNonTechnicalIds || [],
    participants: input.participants,
    teamLeader: leader,
    totalAmount: input.totalAmount,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    paymentId: input.razorpayPaymentId || input.upiReference,
    upiReference: input.upiReference,
    driveScreenshotSubmitted: Boolean(input.paymentProofUrl && input.paymentProofUrl !== 'N/A'),
    paymentProofUrl: input.paymentProofUrl || '',
    attendanceMarked: false,
  };

  localRegistrationsCache.set(code, createdRecord);

  if (isSupabaseConfigured()) {
    try {
      const dbRegType = input.registrationType === 'workshop' ? 'individual' : 'team';
      const dbStatus = input.paymentStatus === 'pending_verification' ? 'pending_verification' : input.paymentStatus;

      const { data: reg, error: regErr } = await supabaseAdmin
        .from('registrations')
        .insert({
          registration_code: code,
          registration_type: dbRegType,
          total_amount: input.totalAmount,
          payment_method: input.paymentMethod,
          payment_status: dbStatus,
        })
        .select('id')
        .maybeSingle();

      if (!regErr && reg?.id) {
        const uuid = reg.id;
        for (let idx = 0; idx < input.participants.length; idx++) {
          const p = input.participants[idx];
          const { data: pData } = await supabaseAdmin
            .from('participants')
            .insert({
              full_name: p.fullName,
              email: p.email || '',
              phone: p.phone || '',
              college: p.college || '',
              department: p.department || null,
              year_of_study: p.year || null,
            })
            .select('id')
            .maybeSingle();

          if (pData?.id) {
            await supabaseAdmin.from('registration_participants').insert({
              registration_id: uuid,
              participant_id: pData.id,
              role: idx === 0 ? 'team_leader' : 'member',
            });
          }
        }

        await supabaseAdmin.from('payments').insert({
          registration_id: uuid,
          amount: input.totalAmount,
          method: input.paymentMethod,
          status: dbStatus,
          razorpay_order_id: input.razorpayOrderId || null,
          razorpay_payment_id: input.razorpayPaymentId || null,
          upi_reference: input.upiReference || null,
          payment_proof_url: input.paymentProofUrl || null,
        });

        const eventIds = [
          ...(input.selectedWorkshopId ? [input.selectedWorkshopId] : []),
          ...(input.selectedTechnicalIds || []),
          ...(input.selectedNonTechnicalIds || []),
        ];

        for (const rawId of eventIds) {
          if (!rawId) continue;
          const resolved = await resolveEventInfo(rawId);
          if (resolved?.id) {
            const defaultPrice = resolved.category === 'workshop' ? 300 : 250;
            await supabaseAdmin.from('registration_events').insert({
              registration_id: uuid,
              event_id: resolved.id,
              price_at_registration: resolved.price || defaultPrice,
            });
          }
        }
      }
    } catch (dbErr: any) {
      console.warn('[REGISTRATION NOTICE] Supabase persistence notice:', dbErr?.message || dbErr);
    }
  }

  return createdRecord;
}

export async function updateRegistrationPayment(
  registrationCode: string,
  patch: {
    paymentStatus: RegistrationRecord['paymentStatus'];
    paymentId?: string;
    upiReference?: string;
  }
): Promise<RegistrationRecord | undefined> {
  const code = normalizeRegistrationCode(registrationCode);
  let existing = localRegistrationsCache.get(code) || (await getRegistrationById(code));

  if (existing) {
    existing = {
      ...existing,
      paymentStatus: patch.paymentStatus,
      ...(patch.paymentId ? { paymentId: patch.paymentId } : {}),
      ...(patch.upiReference ? { upiReference: patch.upiReference } : {}),
    };
    localRegistrationsCache.set(code, existing);
    localRegistrationsCache.set(existing.id, existing);
  }

  if (isSupabaseConfigured()) {
    try {
      const { data: registration } = await supabaseAdmin
        .from('registrations')
        .select('id')
        .eq('registration_code', code)
        .maybeSingle();

      if (registration?.id) {
        const dbStatus = patch.paymentStatus === 'pending_verification' ? 'pending_verification' : patch.paymentStatus;
        await supabaseAdmin
          .from('registrations')
          .update({ payment_status: dbStatus, updated_at: new Date().toISOString() })
          .eq('id', registration.id);

        const paymentPatch: Record<string, any> = { status: dbStatus, updated_at: new Date().toISOString() };
        if (patch.paymentId) paymentPatch.razorpay_payment_id = patch.paymentId;
        if (patch.upiReference) paymentPatch.upi_reference = patch.upiReference;

        await supabaseAdmin
          .from('payments')
          .update(paymentPatch)
          .eq('registration_id', registration.id);
      }
    } catch (dbErr: any) {
      console.warn('[PAYMENT UPDATE NOTICE] Supabase notice:', dbErr?.message || dbErr);
    }
  }

  return existing || getRegistrationById(code);
}

export async function updatePaymentProofUrl(
  registrationCode: string,
  url: string
): Promise<void> {
  const code = normalizeRegistrationCode(registrationCode);
  const existing = localRegistrationsCache.get(code);
  if (existing) {
    existing.paymentProofUrl = url;
    existing.driveScreenshotSubmitted = Boolean(url && url !== 'N/A');
    localRegistrationsCache.set(code, existing);
  }

  if (isSupabaseConfigured()) {
    try {
      const { data: registration } = await supabaseAdmin
        .from('registrations')
        .select('id')
        .eq('registration_code', code)
        .maybeSingle();

      if (registration?.id) {
        await supabaseAdmin
          .from('payments')
          .update({
            payment_proof_url: url,
            updated_at: new Date().toISOString(),
          })
          .eq('registration_id', registration.id);
      }
    } catch (dbErr: any) {
      console.warn('[PROOF UPDATE NOTICE] Supabase notice:', dbErr?.message || dbErr);
    }
  }
}

export async function deleteRegistration(registrationCode: string): Promise<boolean> {
  const code = normalizeRegistrationCode(registrationCode);
  localRegistrationsCache.delete(code);

  if (isSupabaseConfigured()) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
      let query = supabaseAdmin.from('registrations').select('id');
      if (isUuid) {
        query = query.or(`registration_code.eq.${code},id.eq.${code}`);
      } else {
        query = query.eq('registration_code', code);
      }

      const { data: registration } = await query.maybeSingle();
      if (registration?.id) {
        const { data: juncs } = await supabaseAdmin
          .from('registration_participants')
          .select('participant_id')
          .eq('registration_id', registration.id);

        const partIds = (juncs || []).map((j) => j.participant_id);

        await supabaseAdmin.from('registration_participants').delete().eq('registration_id', registration.id);
        if (partIds.length > 0) {
          await supabaseAdmin.from('participants').delete().in('id', partIds);
        }
        await supabaseAdmin.from('registration_events').delete().eq('registration_id', registration.id);
        await supabaseAdmin.from('payments').delete().eq('registration_id', registration.id);
        await supabaseAdmin.from('registrations').delete().eq('id', registration.id);
      }
    } catch (dbErr: any) {
      console.warn('[DELETE NOTICE] Supabase notice:', dbErr?.message || dbErr);
    }
  }

  return true;
}

export function parseRegistrationTimestamp(val: unknown, regId?: string): number {
  if (!val) return Date.now();
  if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
  let str = String(val).trim();
  if (!str) return Date.now();

  // Universal fix for YYYY-0X-10 where Month 0X and Day 10 were swapped during parsing
  // e.g. 2026-02-10 -> 2026-10-02 (October 2nd)
  // e.g. 2026-01-10 -> 2026-10-01 (October 1st)
  // e.g. 2026-03-10 -> 2026-10-03 (October 3rd)
  const matchSwappedIso = str.match(/^(\d{4})-0([1-9])-10/);
  if (matchSwappedIso) {
    const year = matchSwappedIso[1];
    const day = matchSwappedIso[2];
    str = str.replace(/^(\d{4})-0[1-9]-10/, `${year}-10-0${day}`);
  }

  // Handle DD/MM/YYYY or MM/DD/YYYY formatted strings
  const matchDMY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(am|pm))?)?/i);
  if (matchDMY) {
    const [, firstStr, secondStr, yearStr, hStr = '0', mStr = '0', sStr = '0', ampm] = matchDMY;
    let n1 = parseInt(firstStr, 10);
    let n2 = parseInt(secondStr, 10);
    let year = parseInt(yearStr, 10);
    let hours = parseInt(hStr, 10);
    let minutes = parseInt(mStr, 10);
    let seconds = parseInt(sStr, 10);

    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
    }

    let day = n1;
    let month = n2;

    if (n2 === 10) {
      day = n1;
      month = 10;
    } else if (n1 === 10) {
      day = n2;
      month = 10;
    }

    const parsedD = new Date(year, month - 1, day, hours, minutes, seconds);
    const t = parsedD.getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  const d = new Date(str);
  const t = d.getTime();
  if (!isNaN(t) && t > 0) return t;

  if (regId) {
    const numMatch = String(regId).match(/\d{6,}/);
    if (numMatch) {
      const parsedNum = parseInt(numMatch[0], 10);
      if (!isNaN(parsedNum) && parsedNum > 0) return parsedNum;
    }
  }

  return Date.now();
}

export async function listRegistrations(filters?: {
  registrationType?: 'workshop' | 'technical';
  paymentStatus?: RegistrationRecord['paymentStatus'];
  search?: string;
}): Promise<RegistrationRecord[]> {
  let results: RegistrationRecord[] = [];

  if (isSupabaseConfigured()) {
    try {
      let query = supabaseAdmin
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.registrationType) {
        const dbType = filters.registrationType === 'workshop' ? 'individual' : 'team';
        query = query.eq('registration_type', dbType);
      }
      if (filters?.paymentStatus) {
        const dbStatus = filters.paymentStatus === 'pending_verification' ? 'pending_verification' : filters.paymentStatus;
        query = query.eq('payment_status', dbStatus);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const assembled = await assembleRegistrations(data);
        results = assembled.map((row) => mapRegistration(row, true));
      }
    } catch (e: any) {
      console.warn('[DB] Supabase query notice:', e?.message || e);
    }
  }

  // Merge newly submitted local cache records
  const existingIds = new Set(results.map((r) => r.id));
  for (const localRecord of localRegistrationsCache.values()) {
    if (!existingIds.has(localRecord.id)) {
      results.push(localRecord);
      existingIds.add(localRecord.id);
    }
  }

  // Fallback / merge with Google Sheet data source to guarantee all live registrations display in Admin Console
  if (results.length < 50) {
    try {
      const sheetRes = await fetch(
        'https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec?action=getRegistrations',
        { redirect: 'follow' }
      );
      if (sheetRes.ok) {
        const sheetData = (await sheetRes.json()) as any[];
        if (Array.isArray(sheetData) && sheetData.length > 0) {
          for (const d of sheetData) {
            const regId = d.id || d.regId;
            if (!regId) continue;

            const sheetProof = (d.paymentProofUrl || d.paymentProof || '').trim();
            const existingInResults = results.find((r) => r.id === regId || r.id.toLowerCase() === regId.toLowerCase());

            if (existingInResults) {
              if (sheetProof.startsWith('http')) {
                existingInResults.paymentProofUrl = sheetProof;
                existingInResults.driveScreenshotSubmitted = true;
                localRegistrationsCache.set(regId, existingInResults);
                localRegistrationsCache.set(normalizeRegistrationCode(regId), existingInResults);
              }
              continue;
            }

            const isWs = d.registrationType === 'workshop' || String(d.track || d.eventsText || '').toLowerCase().includes('workshop');
            const leaders = d.participants || [d.teamLeader || { fullName: 'Attendee', email: '', phone: '', college: '' }];

            const rawEvtStr = String(d.events || d.eventsText || d.event || d.selectedWorkshopId || d.track || '').toLowerCase();
            const isSilicon = rawEvtStr.includes('silicon') || rawEvtStr.includes('vlsi') || rawEvtStr.includes('gds') || rawEvtStr.includes('cadence');
            const isVirtual = rawEvtStr.includes('virtual') || rawEvtStr.includes('instrument') || rawEvtStr.includes('labview') || rawEvtStr.includes('daq');
            const canonicalWsId = isSilicon ? 'ws-silicon-2-gds' : isVirtual ? 'ws-virtual-instrumentation' : 'ws-embedded-system';

            const newSheetRecord: RegistrationRecord = {
              id: regId,
              createdAt: d.createdAt || d.timestamp || new Date().toISOString(),
              registrationType: isWs ? 'workshop' : 'technical',
              selectedWorkshopId: isWs ? canonicalWsId : undefined,
              selectedTechnicalIds: d.selectedTechnicalIds || [],
              selectedNonTechnicalIds: d.selectedNonTechnicalIds || [],
              eventsText: d.eventsText || d.events,
              participants: leaders,
              teamLeader: d.teamLeader || leaders[0] || { fullName: 'Attendee', email: '', phone: '', college: '' },
              totalAmount: Number(d.totalAmount || d.amount || 0),
              paymentMethod: String(d.paymentMethod || 'UPI').toLowerCase() === 'razorpay' ? 'razorpay' : 'upi',
              paymentStatus: String(d.paymentStatus || '').toLowerCase() === 'paid' ? 'paid' : 'pending_verification',
              paymentId: d.paymentId || d.paymentRef,
              upiReference: d.upiReference || d.paymentRef,
              driveScreenshotSubmitted: Boolean(sheetProof && sheetProof !== 'N/A'),
              paymentProofUrl: sheetProof || undefined,
              attendanceMarked: Boolean(d.attendanceMarked || d.attendance === 'Present'),
              attendanceTimestamp: d.attendanceTimestamp,
            };

            results.push(newSheetRecord);
            existingIds.add(regId);
            if (sheetProof.startsWith('http')) {
              localRegistrationsCache.set(regId, newSheetRecord);
              localRegistrationsCache.set(normalizeRegistrationCode(regId), newSheetRecord);
            }
          }
        }
      }
    } catch (sheetErr: any) {
      console.warn('[DB] Google Sheet fallback notice:', sheetErr.message);
    }
  }

  // Apply cached local overrides for payment status & verified details
  results = results.map((r) => {
    const cached = localRegistrationsCache.get(r.id) || localRegistrationsCache.get(normalizeRegistrationCode(r.id));
    if (cached) {
      return {
        ...r,
        ...cached,
        paymentStatus: cached.paymentStatus || r.paymentStatus,
      };
    }
    return r;
  });

  // Apply filters
  if (filters?.registrationType) {
    results = results.filter((r) => r.registrationType === filters.registrationType);
  }
  if (filters?.paymentStatus) {
    results = results.filter((r) => r.paymentStatus === filters.paymentStatus);
  }
  if (filters?.search) {
    const needle = filters.search.toLowerCase();
    results = results.filter((r) =>
      [
        r.id,
        r.teamLeader?.fullName,
        r.teamLeader?.email,
        r.teamLeader?.phone,
        r.teamLeader?.college,
        r.upiReference,
        r.eventsText,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }

  return results.sort((a, b) => {
    const timeA = parseRegistrationTimestamp(a.createdAt, a.id);
    const timeB = parseRegistrationTimestamp(b.createdAt, b.id);
    if (timeA !== timeB) {
      return timeB - timeA; // Descending order (newest at the top)
    }
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function calculateStatsFromRegistrations(registrations: RegistrationRecord[]) {
  const workshopCount = registrations.filter((r) => r.registrationType === 'workshop').length;
  const technicalCount = registrations.filter((r) => r.registrationType === 'technical').length;
  const paidCount = registrations.filter((r) => r.paymentStatus === 'paid').length;
  const pendingCount = registrations.filter((r) => r.paymentStatus === 'pending_verification').length;

  const eventCounts: Record<string, number> = {};
  const eventTeamCounts: Record<string, number> = {};
  for (const r of registrations) {
    const pCount = r.participants.length || 1;
    if (r.selectedWorkshopId) {
      eventCounts[r.selectedWorkshopId] = (eventCounts[r.selectedWorkshopId] || 0) + pCount;
      eventTeamCounts[r.selectedWorkshopId] = (eventTeamCounts[r.selectedWorkshopId] || 0) + 1;
    }
    const tIds = r.selectedTechnicalIds || [];
    for (const tid of tIds) {
      eventCounts[tid] = (eventCounts[tid] || 0) + pCount;
      eventTeamCounts[tid] = (eventTeamCounts[tid] || 0) + 1;
    }
    const nIds = r.selectedNonTechnicalIds || [];
    for (const nid of nIds) {
      eventCounts[nid] = (eventCounts[nid] || 0) + pCount;
      eventTeamCounts[nid] = (eventTeamCounts[nid] || 0) + 1;
    }
  }

  return {
    totalRegistrations: registrations.length,
    totalParticipants: registrations.reduce((sum, r) => sum + (r.participants?.length > 0 ? r.participants.length : 1), 0),
    workshopCount,
    technicalCount,
    paidCount,
    pendingCount,
    eventCounts,
    eventTeamCounts,
    recentRegistrations: registrations.slice(0, 10),
  };
}

export async function getRegistrationStats() {
  const registrations = await listRegistrations();
  return calculateStatsFromRegistrations(registrations);
}

export async function markAttendance(
  registrationCode: string
): Promise<{ success: boolean; message: string; registration?: RegistrationRecord }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const registration = await getRegistrationById(registrationCode);
  if (!registration) {
    throw new Error(`Registration with code ${registrationCode} not found`);
  }

  const { data: regRow, error: findErr } = await supabaseAdmin
    .from('registrations')
    .select('id')
    .eq('registration_code', normalizeRegistrationCode(registrationCode))
    .maybeSingle();

  if (findErr || !regRow) {
    throw findErr || new Error(`Registration ${registrationCode} not found`);
  }

  const { error: updateErr } = await supabaseAdmin
    .from('registrations')
    .update({
      attendance_marked: true,
      attendance_marked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', regRow.id);

  if (updateErr) throw updateErr;

  const updated = await getRegistrationById(registrationCode);
  return {
    success: true,
    message: 'Attendance successfully marked.',
    registration: updated || registration,
  };
}

export async function getEmailLogs(registrationId?: string) {
  if (!isSupabaseConfigured()) return [];
  const query = supabaseAdmin.from('email_logs').select('*').order('created_at', { ascending: false });
  if (registrationId) query.eq('registration_id', registrationId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTicketByRegistrationId(registrationId: string) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePaymentRecord(
  registrationUuid: string,
  patch: Record<string, any>
) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabaseAdmin
    .from('payments')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('registration_id', registrationUuid)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}
