import { supabaseAdmin, isSupabaseConfigured } from './supabase.js';
import {
  EventItem,
  Participant,
  RegistrationRecord,
  SiteSettings,
} from '../src/types.js';
import { initialSiteSettings } from '../src/data/defaultSettings.js';
import { initialEvents } from '../src/data/defaultEvents.js';

type DbEvent = Record<string, any>;
type DbParticipant = Record<string, any>;
type DbRegistration = Record<string, any>;

export function cleanWorkshopTitle(raw: string | undefined): string {
  if (!raw) return 'Workshop';
  const s = raw.toLowerCase();
  if (s.includes('silicon') || s.includes('gds') || s.includes('cadence') || s.includes('vlsi')) {
    return 'silicon 2gds';
  }
  if (s.includes('embedded') || s.includes('microcontroller') || s.includes('arm')) {
    return 'Embedded System';
  }
  if (s.includes('instrumentation') || s.includes('labview') || s.includes('virtual') || s.includes('daq')) {
    return 'Virtual instrument';
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

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!isSupabaseConfigured()) {
    return initialSiteSettings as SiteSettings;
  }

  // 1. Try key-value schema
  const kvQuery = await supabaseAdmin.from('site_settings').select('key,value');
  if (!kvQuery.error && kvQuery.data && kvQuery.data.length > 0 && 'key' in kvQuery.data[0]) {
    const settings: Record<string, any> = { ...initialSiteSettings };
    for (const row of kvQuery.data) {
      try {
        settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings as SiteSettings;
  }

  // 2. Try flat schema (columns like symposium_title, etc.)
  const flatQuery = await supabaseAdmin.from('site_settings').select('*');
  if (flatQuery.error) {
    throw flatQuery.error || new Error('Failed to load site settings from Supabase.');
  }

  if (flatQuery.data && flatQuery.data.length > 0) {
    const row = flatQuery.data[0];
    const settings: Record<string, any> = { ...initialSiteSettings };
    
    // Map database snake_case columns to settings camelCase keys
    const mappings: Record<string, string> = {
      symposium_title: 'symposiumTitle',
      sub_title: 'subTitle',
      department: 'department',
      college: 'college',
      associations: 'associations',
      event_date: 'eventDate',
      countdown_target: 'countdownTarget',
      registration_deadline: 'registrationDeadline',
      paper_submission_deadline: 'paperSubmissionDeadline',
      is_registration_open: 'isRegistrationOpen',
      closed_reason: 'closedReason',
      upi_id: 'upiId',
      upi_payee_name: 'upiPayeeName',
      upi_qr_image_url: 'upiQrImageUrl',
      workshop_upi_id: 'workshopUpiId',
      workshop_upi_payee_name: 'workshopUpiPayeeName',
      workshop_upi_qr_image_url: 'workshopUpiQrImageUrl',
      tech_upi_id: 'techUpiId',
      tech_upi_payee_name: 'techUpiPayeeName',
      tech_upi_qr_image_url: 'techUpiQrImageUrl',
      razorpay_enabled: 'razorpayEnabled',
      drive_upload_url: 'driveUploadUrl',
      participant_form_url: 'participantFormUrl',
      contact_email: 'contactEmail',
      instagram_handle: 'instagramHandle',
      venue: 'venue',
      announcement_text: 'announcementText',
      announcement_active: 'announcementActive',
      fee_per_person: 'feePerPerson',
      closed_workshops: 'closedWorkshops',
      app_env: 'appEnv',
      admin_notification_emails: 'adminNotificationEmails',
      force_early_bird: 'forceEarlyBird',
      early_bird_deadline: 'earlyBirdDeadline',
      google_sheet_webhook_url: 'googleSheetWebhookUrl',
    };

    for (const [dbCol, stateKey] of Object.entries(mappings)) {
      if (row[dbCol] !== undefined && row[dbCol] !== null) {
        settings[stateKey] = row[dbCol];
      }
    }
    return settings as SiteSettings;
  }

  return initialSiteSettings as SiteSettings;
}

export async function updateSiteSettings(
  partial: Partial<SiteSettings>,
  updatedBy?: string
): Promise<SiteSettings> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  // 1. Check if key-value schema exists
  const kvQuery = await supabaseAdmin.from('site_settings').select('key,value').limit(1);
  const isKeyValue = !kvQuery.error && kvQuery.data && kvQuery.data.length > 0 && 'key' in kvQuery.data[0];

  if (isKeyValue) {
    for (const [key, value] of Object.entries(partial)) {
      const { error } = await supabaseAdmin.from('site_settings').upsert({
        key,
        value,
        ...(updatedBy ? { updated_by: updatedBy } : {}),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
  } else {
    // 2. Try flat schema
    const mappings: Record<string, string> = {
      symposiumTitle: 'symposium_title',
      subTitle: 'sub_title',
      department: 'department',
      college: 'college',
      associations: 'associations',
      eventDate: 'event_date',
      countdownTarget: 'countdown_target',
      registrationDeadline: 'registration_deadline',
      paperSubmissionDeadline: 'paper_submission_deadline',
      isRegistrationOpen: 'is_registration_open',
      closedReason: 'closed_reason',
      upiId: 'upi_id',
      upiPayeeName: 'upi_payee_name',
      upiQrImageUrl: 'upi_qr_image_url',
      workshopUpiId: 'workshop_upi_id',
      workshopUpiPayeeName: 'workshop_upi_payee_name',
      workshopUpiQrImageUrl: 'workshop_upi_qr_image_url',
      techUpiId: 'tech_upi_id',
      techUpiPayeeName: 'tech_upi_payee_name',
      techUpiQrImageUrl: 'tech_upi_qr_image_url',
      razorpayEnabled: 'razorpay_enabled',
      driveUploadUrl: 'drive_upload_url',
      participantFormUrl: 'participant_form_url',
      contactEmail: 'contact_email',
      instagramHandle: 'instagram_handle',
      venue: 'venue',
      announcementText: 'announcement_text',
      announcementActive: 'announcement_active',
      feePerPerson: 'fee_per_person',
      closedWorkshops: 'closed_workshops',
      appEnv: 'app_env',
      adminNotificationEmails: 'admin_notification_emails',
      forceEarlyBird: 'force_early_bird',
      earlyBirdDeadline: 'early_bird_deadline',
      googleSheetWebhookUrl: 'google_sheet_webhook_url',
    };

    const dbPayload: Record<string, any> = {
      id: 'current',
      updated_at: new Date().toISOString(),
    };

    for (const [stateKey, dbCol] of Object.entries(mappings)) {
      if (partial[stateKey as keyof SiteSettings] !== undefined) {
        dbPayload[dbCol] = partial[stateKey as keyof SiteSettings];
      }
    }

    const { error } = await supabaseAdmin.from('site_settings').upsert(dbPayload);
    if (error) throw error;
  }

  return getSiteSettings();
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
): Promise<{ valid: boolean; error?: string; events?: Array<{ id: string; category: string; price: number; isActive: boolean; name: string }> }> {
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

export async function getRegistrationById(
  registrationCode: string
): Promise<RegistrationRecord | undefined> {
  const code = normalizeRegistrationCode(registrationCode);
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('registrations')
    .select('*')
    .eq('registration_code', code)
    .maybeSingle();

  if (error) throw error;
  if (!data) return undefined;

  const assembled = await assembleRegistrations([data]);
  return mapRegistration(assembled[0]);
}

export async function getRegistrationByPaymentId(
  paymentId: string
): Promise<RegistrationRecord | undefined> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured');

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('registration_id')
    .eq('razorpay_payment_id', paymentId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return undefined;
  return getRegistrationByUuid(data.registration_id);
}

export async function getRegistrationByUuid(uuid: string): Promise<RegistrationRecord | undefined> {
  const { data, error } = await supabaseAdmin
    .from('registrations')
    .select('*')
    .eq('id', uuid)
    .maybeSingle();

  if (error) throw error;
  if (!data) return undefined;

  const assembled = await assembleRegistrations([data]);
  return mapRegistration(assembled[0]);
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
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  let code = input.registrationCode;
  if (!code) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `EV26-${rand}`;
  }

  const dbRegType = input.registrationType === 'workshop' ? 'individual' : 'team';
  const dbStatus = input.paymentStatus === 'pending_verification' ? 'pending_verification' : input.paymentStatus;

  // 1. Insert into registrations
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
      console.error(`[DB] createRegistration participant [${idx}] insert failed:`, pInsertErr?.message);
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
      console.error(`[DB] createRegistration registration_participants [${idx}] insert failed:`, rpErr.message);
    }
  }

  // 3. Insert payment
  const { error: payErr } = await supabaseAdmin
    .from('payments')
    .insert({
      registration_id: uuid,
      amount: input.totalAmount,
      method: input.paymentMethod,
      status: dbStatus,
      razorpay_order_id: input.razorpayOrderId || null,
      razorpay_payment_id: input.razorpayPaymentId || null,
      upi_reference: input.upiReference || null,
      payment_proof_url: input.paymentProofUrl || null,
    });

  if (payErr) {
    console.error(`[DB] createRegistration payments insert failed:`, payErr.message);
  }

  // 4. Insert registration_events with resolved UUIDs and prices
  const eventIds = [
    ...(input.selectedWorkshopId ? [input.selectedWorkshopId] : []),
    ...(input.selectedTechnicalIds || []),
    ...(input.selectedNonTechnicalIds || []),
  ];

  for (const rawId of eventIds) {
    if (!rawId) continue;
    const resolved = await resolveEventInfo(rawId);
    if (resolved) {
      const defaultPrice = resolved.category === 'workshop' ? 300 : 250;
      const { error: reErr } = await supabaseAdmin
        .from('registration_events')
        .insert({
          registration_id: uuid,
          event_id: resolved.id,
          price_at_registration: resolved.price || defaultPrice,
        });
      if (reErr) {
        console.error(`[DB] Failed to insert registration_events for ${rawId}:`, reErr.message);
      }
    } else {
      console.warn(`[DB] Could not resolveEventInfo for rawId: "${rawId}"`);
    }
  }

  const reloaded = await getRegistrationByUuid(uuid);
  if (!reloaded) throw new Error('Failed to reload newly created registration.');
  return reloaded;
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
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const { data: registration, error: findErr } = await supabaseAdmin
    .from('registrations')
    .select('id')
    .eq('registration_code', code)
    .maybeSingle();

  if (findErr || !registration) {
    throw findErr || new Error(`Registration ${code} not found`);
  }

  const dbStatus = patch.paymentStatus === 'pending_verification' ? 'pending_verification' : patch.paymentStatus;
  const { error: updateErr } = await supabaseAdmin
    .from('registrations')
    .update({ payment_status: dbStatus, updated_at: new Date().toISOString() })
    .eq('id', registration.id);

  if (updateErr) throw updateErr;

  const paymentPatch: Record<string, any> = { status: dbStatus, updated_at: new Date().toISOString() };
  if (patch.paymentId) paymentPatch.razorpay_payment_id = patch.paymentId;
  if (patch.upiReference) paymentPatch.upi_reference = patch.upiReference;

  const { error: pUpdateErr } = await supabaseAdmin
    .from('payments')
    .update(paymentPatch)
    .eq('registration_id', registration.id);

  if (pUpdateErr) throw pUpdateErr;

  return getRegistrationByUuid(registration.id);
}

export async function updatePaymentProofUrl(
  registrationCode: string,
  url: string
): Promise<void> {
  const code = normalizeRegistrationCode(registrationCode);
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const { data: registration, error: findErr } = await supabaseAdmin
    .from('registrations')
    .select('id')
    .eq('registration_code', code)
    .maybeSingle();

  if (findErr || !registration) {
    throw findErr || new Error(`Registration ${code} not found`);
  }

  const { error: updateErr } = await supabaseAdmin
    .from('payments')
    .update({
      payment_proof_url: url,
      updated_at: new Date().toISOString(),
    })
    .eq('registration_id', registration.id);

  if (updateErr) throw updateErr;
}

export async function deleteRegistration(registrationCode: string): Promise<boolean> {
  const code = normalizeRegistrationCode(registrationCode);
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
  let query = supabaseAdmin.from('registrations').select('id');
  if (isUuid) {
    query = query.or(`registration_code.eq.${code},id.eq.${code}`);
  } else {
    query = query.eq('registration_code', code);
  }

  const { data: registration, error: findErr } = await query.maybeSingle();

  if (findErr || !registration) {
    throw findErr || new Error(`Registration ${code} not found`);
  }

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
  const { error: deleteErr } = await supabaseAdmin.from('registrations').delete().eq('id', registration.id);

  if (deleteErr) throw deleteErr;
  return true;
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

  // Fallback / merge with Google Sheet data source to guarantee all 79 live registrations display in Admin Console
  if (results.length < 50) {
    try {
      const sheetRes = await fetch(
        'https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec?action=getRegistrations',
        { redirect: 'follow' }
      );
      if (sheetRes.ok) {
        const sheetData = (await sheetRes.json()) as any[];
        if (Array.isArray(sheetData) && sheetData.length > 0) {
          const existingIds = new Set(results.map((r) => r.id));
          for (const d of sheetData) {
            const regId = d.id || d.regId;
            if (!regId || existingIds.has(regId)) continue;

            const isWs = d.registrationType === 'workshop' || String(d.track || d.eventsText || '').toLowerCase().includes('workshop');
            const leaders = d.participants || [d.teamLeader || { fullName: 'Attendee', email: '', phone: '', college: '' }];

            results.push({
              id: regId,
              createdAt: d.createdAt || d.timestamp || new Date().toISOString(),
              registrationType: isWs ? 'workshop' : 'technical',
              selectedWorkshopId: d.selectedWorkshopId || (isWs ? (d.eventsText?.toLowerCase().includes('silicon') ? '4e91a80e-4baa-4fc2-bf6c-7f95e135fc80' : d.eventsText?.toLowerCase().includes('virtual') ? 'ee27539a-2318-44da-9697-bb859ed57a50' : 'd6699fda-e9a5-404d-88e8-bd9e0610988e') : undefined),
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
              driveScreenshotSubmitted: Boolean(d.paymentProofUrl && d.paymentProofUrl !== 'N/A'),
              paymentProofUrl: d.paymentProofUrl,
              attendanceMarked: Boolean(d.attendanceMarked || d.attendance === 'Present'),
              attendanceTimestamp: d.attendanceTimestamp,
            });
            existingIds.add(regId);
          }
        }
      }
    } catch (sheetErr: any) {
      console.warn('[DB] Google Sheet fallback notice:', sheetErr.message);
    }
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

  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
