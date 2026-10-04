import fs from 'fs';
import path from 'path';
import { supabaseAdmin, isSupabaseConfigured, uploadPaymentScreenshotToSupabase } from './supabase.js';
import { formatIsoTimestamp, safeParseRegistrationDate, fetchRegistrationsFromGoogleSheet } from './googleSheet.js';
import { loadCsvRegistrations } from './liveDataset.js';
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
  CLOSURE_KEY, 'closureStateLoaded',
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
      ((stripped.includes('tracktron') || stripped.includes('tractron')) && codeLower.includes('tracktron')) ||
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

function parseMemberDetailString(str?: string, defaultCollege = '', defaultDept = '', defaultYear = ''): Participant | null {
  if (!str || str === 'N/A' || str.trim() === '') return null;
  const match = str.match(/^(.*?)(?:\s*\((.*?)\))?$/);
  if (!match) return { fullName: str, phone: '', email: '', college: defaultCollege, department: defaultDept, year: defaultYear };
  return {
    fullName: match[1].trim(),
    phone: (match[2] || '').trim(),
    email: '',
    college: defaultCollege,
    department: defaultDept,
    year: defaultYear,
  };
}

export function mapRegistration(row: DbRegistration, truncateProof = false): RegistrationRecord {
  const anyRow = row as any;
  let pRows = Array.isArray(row.participants)
    ? [...row.participants].sort((a, b) => {
        const aOrder = Number(a.participant_order || 99);
        const bOrder = Number(b.participant_order || 99);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.full_name || '').localeCompare(b.full_name || '');
      })
    : [];

  let participantsList = pRows.map(participantFromRow);
  let leaderRow = pRows.find((p: any) => p.is_team_leader) || pRows[0];
  let leader = leaderRow
    ? participantFromRow(leaderRow)
    : { fullName: anyRow.team_leader_name || 'Attendee', email: anyRow.team_leader_email || '', phone: anyRow.team_leader_phone || '', college: anyRow.college_name || '', department: anyRow.department, year: anyRow.year_of_study };

  // If no relational participant rows, extract directly from CSV columns
  if (participantsList.length === 0 && anyRow.team_leader_name) {
    participantsList.push(leader);
    for (const memKey of ['member_2_details', 'member_3_details', 'member_4_details']) {
      const parsedMem = parseMemberDetailString(anyRow[memKey], anyRow.college_name, anyRow.department, anyRow.year_of_study);
      if (parsedMem && parsedMem.fullName && parsedMem.fullName !== 'N/A') {
        participantsList.push(parsedMem);
      }
    }
  }

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

  const rawProofUrl = payment?.payment_proof_url || anyRow.payment_proof_url || row.payment_proof_url || undefined;
  const paymentProofUrl = rawProofUrl && rawProofUrl !== 'N/A' && rawProofUrl !== 'HAS_PROOF' ? String(rawProofUrl).trim() : undefined;

  const codeKey = (row.registration_code || row.id || '').toUpperCase();
  let csvRecord: any;
  try {
    const csvRows = loadCsvRegistrations();
    csvRecord = csvRows.find((c) => (c.registration_code || c.id || '').toUpperCase() === codeKey);
  } catch {}

  const rawEventsText =
    csvRecord?.registered_events ||
    (typeof anyRow.registered_events === 'string' && anyRow.registered_events ? anyRow.registered_events : undefined) ||
    (typeof anyRow.registration_events === 'string' && anyRow.registration_events ? anyRow.registration_events : undefined) ||
    (eventNames.length > 0 ? eventNames.join(', ') : undefined) ||
    '';

  if (rawEventsText) {
    const parts = rawEventsText.split(',').map((s: string) => s.trim().toLowerCase());
    for (const p of parts) {
      if (p.includes('silicon')) regWorkshopId = 'silicon 2 gds';
      else if (p.includes('embedded')) regWorkshopId = 'embedded system';
      else if (p.includes('virtual')) regWorkshopId = 'virtual instrument';
      else if (p.includes('tractron') || p.includes('tracktron')) {
        if (!regTechnicalIds.includes('tractron')) regTechnicalIds.push('tractron');
      } else if (p.includes('techpaper') || p.includes('paper')) {
        if (!regTechnicalIds.includes('techpaper')) regTechnicalIds.push('techpaper');
      } else if (p.includes('evolvex') || p.includes('project')) {
        if (!regTechnicalIds.includes('evolvex')) regTechnicalIds.push('evolvex');
      } else if (p.includes('mind') || p.includes('maze')) {
        if (!regNonTechnicalIds.includes('mind maze')) regNonTechnicalIds.push('mind maze');
      } else if (p.includes('prompt')) {
        if (!regNonTechnicalIds.includes('promptify')) regNonTechnicalIds.push('promptify');
      } else if (p.includes('mem')) {
        if (!regNonTechnicalIds.includes('memix')) regNonTechnicalIds.push('memix');
      } else if (p.includes('detective') || p.includes('404')) {
        if (!regNonTechnicalIds.includes('detective 404')) regNonTechnicalIds.push('detective 404');
      }
    }
  }

  return {
    id: row.registration_code || row.id,
    createdAt: formatIsoTimestamp(csvRecord?.created_at || row.created_at),
    registrationType: row.registration_type === 'individual' || row.registration_type === 'workshop' ? 'workshop' : 'technical',
    selectedWorkshopId: regWorkshopId,
    selectedTechnicalIds: regTechnicalIds,
    selectedNonTechnicalIds: regNonTechnicalIds,
    eventsText: rawEventsText,
    participants: participantsList,
    teamLeader: leader,
    totalAmount: Number(row.total_amount || 0),
    paymentMethod: 'upi',
    paymentStatus: row.payment_status === 'pending' ? 'pending_verification' : (row.payment_status || 'pending_verification'),
    paymentId: payment?.upi_reference || anyRow.payment_reference || anyRow.payment_id || undefined,
    upiReference: payment?.upi_reference || anyRow.payment_reference || anyRow.upi_reference || undefined,
    driveScreenshotSubmitted: Boolean(paymentProofUrl || payment?.upi_reference || anyRow.payment_reference),
    paymentProofUrl,
    attendanceMarked: Boolean(row.attendance_marked || anyRow.attendance_status?.toLowerCase() === 'present'),
    attendanceTimestamp: row.attendance_marked_at ? formatIsoTimestamp(row.attendance_marked_at) : undefined,
  };
}

async function assembleRegistrations(regsData: any[]): Promise<any[]> {
  if (!regsData || regsData.length === 0) return [];
  const regIds = regsData.map((r) => r.id);
  const uuidRegIds = regIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id)));

  let partsData: any[] = [];
  let paymentsData: any[] = [];
  let regEventsData: any[] = [];

  if (uuidRegIds.length > 0) {
    try {
      const [partsRes, paymentsRes, regEventsRes] = await Promise.all([
        supabaseAdmin
          .from('registration_participants')
          .select('registration_id, role, participants(*)')
          .in('registration_id', uuidRegIds),
        supabaseAdmin.from('payments').select('*').in('registration_id', uuidRegIds),
        supabaseAdmin.from('registration_events').select('*, events(*)').in('registration_id', uuidRegIds),
      ]);
      partsData = partsRes.data || [];
      paymentsData = paymentsRes.data || [];
      regEventsData = regEventsRes.data || [];
    } catch (e: any) {
      console.warn('[DB] assembleRegistrations junction notice:', e?.message || e);
    }
  }

  const participantsMap = new Map<string, any[]>();
  for (const item of partsData) {
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
  for (const p of paymentsData) {
    const list = paymentsMap.get(p.registration_id) || [];
    list.push(p);
    paymentsMap.set(p.registration_id, list);
  }

  const regEventsMap = new Map<string, any[]>();
  for (const re of regEventsData) {
    const list = regEventsMap.get(re.registration_id) || [];
    list.push(re);
    regEventsMap.set(re.registration_id, list);
  }

  return regsData.map((row) => ({
    ...row,
    participants: participantsMap.get(row.id) || row.participants || [],
    payments: paymentsMap.get(row.id) || row.payments || [],
    registration_events: regEventsMap.get(row.id) || row.registration_events || [],
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

  // Final fallback: sync from Google Sheet in case it was newly added
  try {
    await syncRegistrationsFromGoogleSheet(true);
    if (localRegistrationsCache.has(code)) {
      return localRegistrationsCache.get(code);
    }
  } catch {}

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

export interface RegistrationCreateInput {
  registrationCode?: string;
  registrationType: 'workshop' | 'technical';
  paymentMethod: 'upi';
  paymentStatus: 'paid' | 'pending_verification' | 'failed';
  totalAmount: number;
  selectedWorkshopId?: string;
  selectedTechnicalIds: string[];
  selectedNonTechnicalIds: string[];
  participants: Participant[];
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

  const isoTime = formatIsoTimestamp(new Date());

  // Upload screenshot to Supabase Storage if base64/data URL provided
  let uploadedProofUrl = input.paymentProofUrl || '';
  if (uploadedProofUrl && uploadedProofUrl.startsWith('data:')) {
    uploadedProofUrl = await uploadPaymentScreenshotToSupabase(code, uploadedProofUrl);
  }

  const createdRecord: RegistrationRecord = {
    id: code,
    createdAt: isoTime,
    registrationType: input.registrationType,
    selectedWorkshopId: input.selectedWorkshopId,
    selectedTechnicalIds: input.selectedTechnicalIds || [],
    selectedNonTechnicalIds: input.selectedNonTechnicalIds || [],
    participants: input.participants,
    teamLeader: leader,
    totalAmount: input.totalAmount,
    paymentMethod: 'upi',
    paymentStatus: input.paymentStatus,
    paymentId: input.upiReference,
    upiReference: input.upiReference,
    driveScreenshotSubmitted: Boolean(uploadedProofUrl && uploadedProofUrl !== 'N/A'),
    paymentProofUrl: uploadedProofUrl,
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
          payment_method: 'upi',
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
          method: 'upi',
          status: dbStatus,
          upi_reference: input.upiReference || null,
          payment_proof_url: uploadedProofUrl || null,
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
  const d = safeParseRegistrationDate(val);
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

/**
 * Ingests a complete registration record into Supabase PostgreSQL tables
 * (registrations, participants, registration_participants, payments, registration_events)
 */
export async function ingestRegistrationIntoSupabase(record: RegistrationRecord): Promise<boolean> {
  const code = normalizeRegistrationCode(record.id);
  localRegistrationsCache.set(code, record);
  localRegistrationsCache.set(record.id, record);

  if (!isSupabaseConfigured()) return true;

  try {
    // Check if registration already exists in Supabase
    const { data: existing } = await supabaseAdmin
      .from('registrations')
      .select('id, payment_status, attendance_marked')
      .eq('registration_code', code)
      .maybeSingle();

    const dbRegType = record.registrationType === 'workshop' ? 'individual' : 'team';
    const dbStatus = record.paymentStatus === 'pending_verification' ? 'pending_verification' : record.paymentStatus;
    const isAttended = Boolean(record.attendanceMarked);

    if (existing?.id) {
      // Sync any status/attendance updates if changed
      const patch: Record<string, any> = {};
      if (existing.payment_status !== dbStatus) patch.payment_status = dbStatus;
      if (Boolean(existing.attendance_marked) !== isAttended) patch.attendance_marked = isAttended;
      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        await supabaseAdmin.from('registrations').update(patch).eq('id', existing.id);
      }
      return true;
    }

    // Insert new registration
    const { data: reg, error: regErr } = await supabaseAdmin
      .from('registrations')
      .insert({
        registration_code: code,
        registration_type: dbRegType,
        total_amount: record.totalAmount,
        payment_method: (record.paymentMethod || 'upi').toLowerCase(),
        payment_status: dbStatus,
        attendance_marked: isAttended,
        created_at: new Date(record.createdAt).toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (regErr || !reg?.id) {
      console.warn('[INGEST SUPABASE ERROR] Registration insert:', regErr?.message);
      return false;
    }

    const uuid = reg.id;
    const parts = record.participants?.length > 0 ? record.participants : [record.teamLeader];

    for (let idx = 0; idx < parts.length; idx++) {
      const p = parts[idx];
      if (!p || !p.fullName) continue;

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

    const proofUrl =
      record.paymentProofUrl && record.paymentProofUrl !== 'N/A' && record.paymentProofUrl !== 'HAS_PROOF'
        ? record.paymentProofUrl
        : null;

    await supabaseAdmin.from('payments').insert({
      registration_id: uuid,
      amount: record.totalAmount,
      method: (record.paymentMethod || 'upi').toLowerCase(),
      status: dbStatus,
      upi_reference: record.upiReference || record.paymentId || null,
      payment_proof_url: proofUrl,
    });

    const eventIds = [
      ...(record.selectedWorkshopId ? [record.selectedWorkshopId] : []),
      ...(record.selectedTechnicalIds || []),
      ...(record.selectedNonTechnicalIds || []),
    ];

    if (eventIds.length === 0 && record.eventsText) {
      const text = record.eventsText.toLowerCase();
      if (text.includes('silicon')) eventIds.push('silicon 2 gds');
      if (text.includes('embedded')) eventIds.push('embedded system');
      if (text.includes('virtual')) eventIds.push('virtual instrument');
      if (text.includes('techpaper') || text.includes('paper')) eventIds.push('techpaper');
      if (text.includes('evolvex') || text.includes('project')) eventIds.push('evolvex');
      if (text.includes('tractron') || text.includes('tracktron')) eventIds.push('tractron');
      if (text.includes('mind') || text.includes('maze')) eventIds.push('mind maze');
      if (text.includes('prompt')) eventIds.push('promptify');
      if (text.includes('mem')) eventIds.push('memix');
      if (text.includes('detective') || text.includes('404')) eventIds.push('detective 404');
    }

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

    return true;
  } catch (err: any) {
    console.warn('[INGEST SUPABASE EXCEPTION]', err?.message || err);
    return false;
  }
}

let lastSheetSyncTime = 0;

/**
 * Automatically syncs registrations from Google Sheet into Supabase.
 * Any registration in Google Sheet that is not yet in Supabase will be ingested.
 */
export async function syncRegistrationsFromGoogleSheet(
  force = false
): Promise<{ synced: number; total: number }> {
  const now = Date.now();
  if (!force && now - lastSheetSyncTime < 20000) {
    return { synced: 0, total: 0 };
  }
  lastSheetSyncTime = now;

  try {
    const sheetRows = await fetchRegistrationsFromGoogleSheet();
    if (!sheetRows || sheetRows.length === 0) return { synced: 0, total: 0 };

    let existingCodes = new Set<string>();
    if (isSupabaseConfigured()) {
      const { data: existingRegs } = await supabaseAdmin
        .from('registrations')
        .select('registration_code');
      existingCodes = new Set((existingRegs || []).map((r) => String(r.registration_code).trim().toUpperCase()));
    }

    let syncedCount = 0;
    for (const row of sheetRows) {
      if (!row || !row.id || !String(row.id).startsWith('EV26-')) continue;

      const code = String(row.id).trim().toUpperCase();
      // Skip if already in database
      if (existingCodes.has(code)) {
        continue;
      }

      const recordCreatedAt = formatIsoTimestamp(row.createdAt || row.timestamp || new Date());
      const record: RegistrationRecord = {
        id: code,
        createdAt: recordCreatedAt,
        registrationType: String(row.registrationType || '').toLowerCase().includes('workshop') ? 'workshop' : 'technical',
        selectedWorkshopId: row.selectedWorkshopId,
        selectedTechnicalIds: row.selectedTechnicalIds || [],
        selectedNonTechnicalIds: row.selectedNonTechnicalIds || [],
        eventsText: row.eventsText || '',
        teamLeader: row.teamLeader || { fullName: 'Attendee', email: '', phone: '', college: '' },
        participants: row.participants || [row.teamLeader || { fullName: 'Attendee', email: '', phone: '', college: '' }],
        totalAmount: Number(row.totalAmount || (String(row.registrationType || '').toLowerCase().includes('workshop') ? 300 : 500)),
        paymentMethod: (row.paymentMethod || 'upi').toLowerCase(),
        paymentStatus: String(row.paymentStatus || '').toLowerCase() === 'paid' ? 'paid' : 'pending_verification',
        paymentId: row.paymentId || row.upiReference,
        upiReference: row.upiReference || row.paymentId,
        driveScreenshotSubmitted: Boolean(row.paymentProofUrl && row.paymentProofUrl !== 'N/A'),
        paymentProofUrl: row.paymentProofUrl && row.paymentProofUrl !== 'N/A' ? row.paymentProofUrl : undefined,
        attendanceMarked: Boolean(row.attendanceMarked || String(row.attendance || '').toLowerCase() === 'present'),
      };

      localRegistrationsCache.set(code, record);
      const success = await ingestRegistrationIntoSupabase(record);
      if (success) {
        syncedCount++;
        existingCodes.add(code);
      }
    }

    return { synced: syncedCount, total: sheetRows.length };
  } catch (err: any) {
    console.warn('[SHEET SYNC EXCEPTION]', err?.message || err);
    return { synced: 0, total: 0 };
  }
}

export async function listRegistrations(filters?: {
  registrationType?: 'workshop' | 'technical';
  paymentStatus?: RegistrationRecord['paymentStatus'];
  search?: string;
}): Promise<RegistrationRecord[]> {
  // Trigger background sync with Google Sheet if interval passed
  syncRegistrationsFromGoogleSheet(false).catch(() => {});

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
        results = assembled.map((row) => mapRegistration(row, false));
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

  // Enrich any records missing event metadata from CSV/Sheet dataset
  try {
    const csvRows = loadCsvRegistrations();
    const csvMap = new Map<string, any>();
    for (const c of csvRows) {
      if (c.registration_code) csvMap.set(c.registration_code.toUpperCase(), c);
      if (c.id) csvMap.set(c.id.toUpperCase(), c);
    }

    results = results.map((r) => {
      const csv = csvMap.get((r.id || '').toUpperCase());
      if (csv && csv.registered_events) {
        const eventsText = r.eventsText || csv.registered_events;
        const lowerEv = eventsText.toLowerCase();
        let selectedWorkshopId = r.selectedWorkshopId;
        const selectedTech = [...(r.selectedTechnicalIds || [])];

        if (r.registrationType === 'workshop' || lowerEv.includes('silicon') || lowerEv.includes('embedded') || lowerEv.includes('virtual')) {
          if (!selectedWorkshopId) {
            if (lowerEv.includes('silicon')) selectedWorkshopId = 'silicon 2gds';
            else if (lowerEv.includes('embedded')) selectedWorkshopId = 'embedded system';
            else if (lowerEv.includes('virtual')) selectedWorkshopId = 'virtual instrument';
          }
        }

        if (lowerEv.includes('tractron') || lowerEv.includes('tracktron')) {
          if (!selectedTech.includes('tracktron')) selectedTech.push('tracktron');
        }

        return {
          ...r,
          eventsText,
          selectedWorkshopId: selectedWorkshopId || r.selectedWorkshopId,
          selectedTechnicalIds: selectedTech.length > 0 ? selectedTech : r.selectedTechnicalIds,
        };
      }
      return r;
    });
  } catch (err: any) {
    console.warn('[DB] CSV enrichment notice:', err?.message || err);
  }

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
    const seenEvents = new Set<string>();
    const allEventKeys: string[] = [];

    if (r.selectedWorkshopId) allEventKeys.push(r.selectedWorkshopId);
    (r.selectedTechnicalIds || []).forEach((id) => allEventKeys.push(id));
    (r.selectedNonTechnicalIds || []).forEach((id) => allEventKeys.push(id));
    if (r.eventsText) {
      r.eventsText.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((ev) => allEventKeys.push(ev));
    }

    for (const key of allEventKeys) {
      if (!seenEvents.has(key)) {
        seenEvents.add(key);
        eventCounts[key] = (eventCounts[key] || 0) + pCount;
        eventTeamCounts[key] = (eventTeamCounts[key] || 0) + 1;
      }
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
