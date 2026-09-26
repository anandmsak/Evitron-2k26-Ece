import { supabaseAdmin, isSupabaseConfigured } from './supabase.js';
import { store } from './store.js';
import {
  EventItem,
  Participant,
  RegistrationRecord,
  SiteSettings,
} from '../src/types.js';
import { initialSiteSettings } from '../src/data/defaultSettings.js';

type DbEvent = Record<string, any>;
type DbParticipant = Record<string, any>;
type DbRegistration = Record<string, any>;

export function cleanWorkshopTitle(raw: string | undefined): string {
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
        : row.category === 'non_technical' || row.category === 'non-technical'
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
    return store.getSettings();
  }

  try {
    const { data, error } = await supabaseAdmin.from('site_settings').select('key,value');
    if (error || !data) {
      return store.getSettings();
    }
    const settings: Record<string, any> = { ...initialSiteSettings, ...store.getSettings() };
    for (const row of data) {
      try {
        settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings as SiteSettings;
  } catch {
    return store.getSettings();
  }
}

export async function updateSiteSettings(
  partial: Partial<SiteSettings>,
  updatedBy?: string
): Promise<SiteSettings> {
  const localUpdated = store.updateSettings(partial);

  if (!isSupabaseConfigured()) {
    return localUpdated;
  }

  try {
    for (const [key, value] of Object.entries(partial)) {
      await supabaseAdmin.from('site_settings').upsert({
        key,
        value,
        ...(updatedBy ? { updated_by: updatedBy } : {}),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('[DB] updateSiteSettings remote sync failed, using local store:', err);
  }

  return getSiteSettings();
}

export async function getEvents(includeInactive = true): Promise<EventItem[]> {
  if (!isSupabaseConfigured()) {
    return store.getEvents();
  }

  try {
    let query = supabaseAdmin.from('events').select('*').order('sort_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      return store.getEvents();
    }
    return data.map(mapEvent);
  } catch {
    return store.getEvents();
  }
}

export async function getEventBySlug(slug: string): Promise<EventItem | undefined> {
  if (!isSupabaseConfigured()) {
    return store.getEventBySlug(slug);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('*')
      .or(`code.eq.${slug},id.eq.${slug}`)
      .maybeSingle();

    if (error || !data) {
      return store.getEventBySlug(slug);
    }
    return mapEvent(data);
  } catch {
    return store.getEventBySlug(slug);
  }
}

export async function validateRegistrationEvents(
  eventIds: string[]
): Promise<{ valid: boolean; error?: string; events?: Array<{ id: string; category: string; price: number; isActive: boolean; name: string }> }> {
  const uniqueIds = [...new Set(eventIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { valid: false, error: 'No events selected.' };
  }

  if (!isSupabaseConfigured()) {
    const localEvents = store.getEvents();
    const matched = localEvents.filter((e) => uniqueIds.includes(e.id));
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

  try {
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('id,name,category,price,is_active')
      .in('id', uniqueIds);

    if (error || !data || data.length !== uniqueIds.length) {
      // Fallback to local store check
      const localEvents = store.getEvents();
      const matched = localEvents.filter((e) => uniqueIds.includes(e.id));
      if (matched.length === uniqueIds.length) {
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
      return { valid: false, error: 'One or more selected events do not exist.' };
    }

    const events = data.map((event: any) => ({
      id: event.id,
      name: event.name,
      category: String(event.category).toLowerCase(),
      price: Number(event.price || 0),
      isActive: Boolean(event.is_active),
    }));

    const inactiveEvent = events.find((event) => !event.isActive);
    if (inactiveEvent) {
      return { valid: false, error: `The selected event "${inactiveEvent.name}" is currently inactive.` };
    }

    return { valid: true, events };
  } catch {
    const localEvents = store.getEvents();
    const matched = localEvents.filter((e) => uniqueIds.includes(e.id));
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
}

export async function updateEvent(
  id: string,
  partial: Partial<EventItem>
): Promise<EventItem | null> {
  const localUpdated = store.updateEvent(id, partial);
  if (!isSupabaseConfigured()) {
    return localUpdated;
  }

  try {
    const existing = await supabaseAdmin.from('events').select('*').eq('id', id).maybeSingle();
    if (existing.error || !existing.data) return localUpdated;

    const current = mapEvent(existing.data);
    const merged = { ...current, ...partial };
    const dbCategory = merged.category === 'non-technical' ? 'non_technical' : merged.category;

    const { data } = await supabaseAdmin
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

    return data ? mapEvent(data) : localUpdated;
  } catch {
    return localUpdated;
  }
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

function mapRegistration(row: DbRegistration): RegistrationRecord {
  const pRows = Array.isArray(row.participants)
    ? [...row.participants].sort((a, b) => {
        const aOrder = Number(a.participant_order || 99);
        const bOrder = Number(b.participant_order || 99);
        if (aOrder !== bOrder) return aOrder - bOrder;

        const aIsLeader = Boolean(a.is_team_leader || a.is_leader);
        const bIsLeader = Boolean(b.is_team_leader || b.is_leader);
        if (aIsLeader && !bIsLeader) return -1;
        if (!aIsLeader && bIsLeader) return 1;

        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        if (aTime !== bTime) return aTime - bTime;

        const aName = String(a.full_name || '').toLowerCase();
        const bName = String(b.full_name || '').toLowerCase();
        return aName.localeCompare(bName);
      })
    : [];

  const participants = pRows.map(participantFromRow).filter(Boolean);
  const leader = participants[0] || { fullName: 'Attendee', email: '', phone: '', college: '' };

  const payment = Array.isArray(row.payments)
    ? row.payments.find((p: any) => p.id) || row.payments[0]
    : row.payments;

  const registrationEvents = Array.isArray(row.registration_events)
    ? row.registration_events
    : [];

  const workshopEvents = registrationEvents.filter(
    (x: any) => {
      const cat = String(x.events?.category || '').toLowerCase();
      return cat === 'workshop' || cat === 'workshops';
    }
  );

  const technicalEvents = registrationEvents.filter(
    (x: any) => String(x.events?.category || '').toLowerCase() === 'technical'
  );

  const nonTechnicalEvents = registrationEvents.filter(
    (x: any) => {
      const category = String(x.events?.category || '').toLowerCase();
      return category === 'nontechnical' || category === 'non-technical' || category === 'non_technical';
    }
  );

  const regType = row.registration_type === 'individual' ? 'workshop' : (row.registration_type || 'technical');

  return {
    id: row.registration_code || row.id,
    createdAt: row.created_at || new Date().toISOString(),
    registrationType: regType === 'workshop' ? 'workshop' : 'technical',
    selectedWorkshopId:
      regType === 'workshop'
        ? (workshopEvents[0]?.event_id || (registrationEvents.length === 1 ? registrationEvents[0]?.event_id : undefined))
        : undefined,
    selectedTechnicalIds: technicalEvents.map((x: any) => x.event_id),
    selectedNonTechnicalIds: nonTechnicalEvents.map((x: any) => x.event_id),
    participants: participants.length > 0 ? participants : [leader],
    teamLeader: leader,
    totalAmount: Number(row.total_amount || (regType === 'workshop' ? 300 : 250)),
    paymentMethod: row.payment_method || 'upi',
    paymentStatus: row.payment_status === 'pending' ? 'pending_verification' : (row.payment_status || 'pending_verification'),
    paymentId: payment?.razorpay_payment_id || undefined,
    upiReference: payment?.upi_reference || undefined,
    driveScreenshotSubmitted: Boolean(payment?.payment_proof_url || payment?.upi_reference),
    paymentProofUrl: payment?.payment_proof_url || undefined,
    attendanceMarked: Boolean(row.attendance_marked),
    attendanceTimestamp: row.attendance_marked_at || undefined,
  };
}

export async function getRegistrationById(
  registrationCode: string
): Promise<RegistrationRecord | undefined> {
  const code = normalizeRegistrationCode(registrationCode);
  const localMatch = store.getRegistrationById(code);

  if (!isSupabaseConfigured()) {
    return localMatch;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('registrations')
      .select(`
        *,
        participants(*),
        registration_events(
          event_id,
          price_at_registration,
          events(
            category
          )
        ),
        payments(*)
      `)
      .eq('registration_code', code)
      .maybeSingle();

    if (error || !data) {
      return localMatch;
    }
    return mapRegistration(data);
  } catch {
    return localMatch;
  }
}

export async function getRegistrationByPaymentId(
  paymentId: string
): Promise<RegistrationRecord | undefined> {
  const localMatch = store.getRegistrationByPaymentId(paymentId);
  if (!isSupabaseConfigured()) return localMatch;

  try {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('registration_id')
      .eq('razorpay_payment_id', paymentId)
      .maybeSingle();

    if (error || !data) return localMatch;
    return getRegistrationByUuid(data.registration_id);
  } catch {
    return localMatch;
  }
}

async function getRegistrationByUuid(uuid: string): Promise<RegistrationRecord | undefined> {
  try {
    const { data, error } = await supabaseAdmin
      .from('registrations')
      .select(`
        *,
        participants(*),
        registration_events(
          event_id,
          price_at_registration,
          events(
            category
          )
        ),
        payments(*)
      `)
      .eq('id', uuid)
      .maybeSingle();

    if (error || !data) return undefined;
    return mapRegistration(data);
  } catch {
    return undefined;
  }
}

export async function getRegistrationUuidByRazorpayOrderId(
  razorpayOrderId: string
): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined;
  try {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('registration_id')
      .eq('razorpay_order_id', razorpayOrderId)
      .eq('method', 'razorpay')
      .maybeSingle();

    if (error) return undefined;
    return data?.registration_id;
  } catch {
    return undefined;
  }
}

export async function finalizeRazorpayRegistration(
  registrationUuid: string,
  razorpayPaymentId: string,
  signatureVerified: boolean
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { error } = await supabaseAdmin.rpc(
      'finalize_razorpay_registration',
      {
        p_registration_id: registrationUuid,
        p_razorpay_payment_id: razorpayPaymentId,
        p_signature_verified: signatureVerified,
      }
    );
    if (error) throw error;
  } catch (err: any) {
    console.warn('[DB] finalizeRazorpayRegistration RPC warning:', err?.message || err);
  }
}

async function selfHealParticipants(registrationUuid: string, inputParticipants: Participant[]): Promise<void> {
  try {
    // 1. Delete old participants directly from the participants table
    const { error: pDelErr } = await supabaseAdmin
      .from('participants')
      .delete()
      .eq('registration_id', registrationUuid);

    if (pDelErr) {
      console.warn('[DB] selfHealParticipants participants delete warning:', pDelErr.message);
    }

    // 2. Also delete from the registration_participants junction table just in case
    const { error: rpDelErr } = await supabaseAdmin
      .from('registration_participants')
      .delete()
      .eq('registration_id', registrationUuid);

    if (rpDelErr) {
      console.warn('[DB] selfHealParticipants junction links delete warning:', rpDelErr.message);
    }

    // 3. Insert new participants
    for (let idx = 0; idx < inputParticipants.length; idx++) {
      const p = inputParticipants[idx];
      const { data: pData, error: pInsertErr } = await supabaseAdmin
        .from('participants')
        .insert({
          registration_id: registrationUuid,
          full_name: p.fullName,
          email: p.email || '', // email is NOT NULL in remote DB!
          phone: p.phone || '', // phone is NOT NULL in remote DB!
          college: p.college || '', // college is NOT NULL in remote DB!
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

      // 4. Also insert into registration_participants junction table for safety and backward-compatibility
      const role = idx === 0 ? 'team_leader' : 'member';
      const { error: rpInsertErr } = await supabaseAdmin
        .from('registration_participants')
        .insert({
          registration_id: registrationUuid,
          participant_id: pData.id,
          role: role,
        });

      if (rpInsertErr) {
        console.warn(`[DB] selfHealParticipants junction link [${idx}] insert warning (non-fatal):`, rpInsertErr.message);
      }
    }
    console.log(`[DB] selfHealParticipants successfully completed for ${registrationUuid}. Syncing ${inputParticipants.length} members.`);
  } catch (err: any) {
    console.error('[DB] selfHealParticipants error:', err?.message || err);
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const registrationCode = `EV26-${code}`;

  if (!isSupabaseConfigured()) {
    const newReg: RegistrationRecord = {
      id: registrationCode,
      createdAt: new Date().toISOString(),
      registrationType: input.registrationType,
      selectedWorkshopId: input.selectedWorkshopId,
      selectedTechnicalIds: input.selectedTechnicalIds || [],
      selectedNonTechnicalIds: input.selectedNonTechnicalIds || [],
      participants: input.participants,
      teamLeader: input.participants[0],
      totalAmount: input.totalAmount,
      paymentMethod: 'razorpay',
      paymentStatus: 'pending_verification',
      attendanceMarked: false,
    };
    store.addRegistration(newReg);
    return registrationCode;
  }

  try {
    const eventIds = [
      ...(input.selectedWorkshopId ? [input.selectedWorkshopId] : []),
      ...input.selectedTechnicalIds,
      ...input.selectedNonTechnicalIds,
    ];
    const dbRegType = input.registrationType === 'workshop' ? 'individual' : 'team';

    const { data, error } = await supabaseAdmin.rpc(
      'create_pending_razorpay_registration',
      {
        p_registration_code: registrationCode,
        p_registration_type: dbRegType,
        p_total_amount: input.totalAmount,
        p_participants: input.participants,
        p_event_ids: eventIds,
      }
    );

    if (error) throw error;
    const uuid = String(data || registrationCode);

    // Self-healing: Manually clear and insert all participant details directly to both
    // participants and registration_participants tables to support 100% of 4-member teams
    await selfHealParticipants(uuid, input.participants);

    return uuid;
  } catch (err) {
    console.warn('[DB] createPendingRazorpayRegistration RPC failed, falling back to local store:', err);
    const newReg: RegistrationRecord = {
      id: registrationCode,
      createdAt: new Date().toISOString(),
      registrationType: input.registrationType,
      selectedWorkshopId: input.selectedWorkshopId,
      selectedTechnicalIds: input.selectedTechnicalIds || [],
      selectedNonTechnicalIds: input.selectedNonTechnicalIds || [],
      participants: input.participants,
      teamLeader: input.participants[0],
      totalAmount: input.totalAmount,
      paymentMethod: 'razorpay',
      paymentStatus: 'pending_verification',
      attendanceMarked: false,
    };
    store.addRegistration(newReg);
    return registrationCode;
  }
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
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
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

  const newReg: RegistrationRecord = {
    id: code,
    createdAt: new Date().toISOString(),
    registrationType: input.registrationType,
    selectedWorkshopId: input.selectedWorkshopId,
    selectedTechnicalIds: input.selectedTechnicalIds || [],
    selectedNonTechnicalIds: input.selectedNonTechnicalIds || [],
    participants: input.participants,
    teamLeader: input.participants[0] || { fullName: 'Attendee', email: '', phone: '', college: '' },
    totalAmount: input.totalAmount,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    paymentId: input.razorpayPaymentId,
    upiReference: input.upiReference,
    driveScreenshotSubmitted: Boolean(input.paymentProofUrl || input.upiReference),
    paymentProofUrl: input.paymentProofUrl,
    attendanceMarked: false,
  };

  store.addRegistration(newReg);

  if (!isSupabaseConfigured()) {
    return newReg;
  }

  try {
    const dbRegType = input.registrationType === 'workshop' ? 'individual' : 'team';
    const payload = {
      p_registration_code: code,
      p_registration_type: dbRegType,
      p_payment_method: input.paymentMethod,
      p_payment_status: input.paymentStatus === 'pending_verification' ? 'pending_verification' : input.paymentStatus,
      p_total_amount: input.totalAmount,
      p_participants: input.participants,
      p_event_ids: [
        ...(input.selectedWorkshopId ? [input.selectedWorkshopId] : []),
        ...input.selectedTechnicalIds,
        ...input.selectedNonTechnicalIds,
      ],
      p_razorpay_order_id: input.razorpayOrderId || null,
      p_razorpay_payment_id: input.razorpayPaymentId || null,
      p_razorpay_signature_verified: Boolean(input.razorpaySignatureVerified),
      p_upi_reference: input.upiReference || null,
      p_payment_proof_url: input.paymentProofUrl || null,
    };

    const { data, error } = await supabaseAdmin.rpc('create_registration_transaction', payload);
    if (!error && data) {
      const uuid = typeof data === 'string' ? data : data?.registration_id || data?.id;

      // Self-healing: Manually clear and insert all participant details directly to both
      // participants and registration_participants tables to support 100% of 4-member teams
      await selfHealParticipants(uuid, input.participants);

      const reloaded = await getRegistrationByUuid(uuid);
      if (reloaded) return reloaded;
    }
  } catch (err) {
    console.warn('[DB] createRegistration remote RPC failed, saved to local store:', err);
  }

  return newReg;
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
  const localUpdated = store.updateRegistration(code, { paymentStatus: patch.paymentStatus });

  if (!isSupabaseConfigured()) {
    return localUpdated || store.getRegistrationById(code);
  }

  try {
    const { data: registration } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .eq('registration_code', code)
      .maybeSingle();

    if (registration) {
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

      const reloaded = await getRegistrationByUuid(registration.id);
      if (reloaded) return reloaded;
    }
  } catch (err) {
    console.warn('[DB] updateRegistrationPayment remote sync failed:', err);
  }

  return localUpdated || store.getRegistrationById(code);
}

export async function updatePaymentProofUrl(
  registrationCode: string,
  url: string
): Promise<void> {
  const code = normalizeRegistrationCode(registrationCode);
  store.updateRegistration(code, { paymentProofUrl: url });

  if (!isSupabaseConfigured()) return;

  try {
    const { data: registration } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .eq('registration_code', code)
      .maybeSingle();

    if (registration) {
      await supabaseAdmin
        .from('payments')
        .update({
          payment_proof_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq('registration_id', registration.id);
    }
  } catch (err) {
    console.warn('[DB] updatePaymentProofUrl remote sync failed:', err);
  }
}

export async function deleteRegistration(registrationCode: string): Promise<boolean> {
  const code = normalizeRegistrationCode(registrationCode);
  const localDeleted = store.deleteRegistration(code);

  if (!isSupabaseConfigured()) {
    return localDeleted;
  }

  try {
    const { data: registration } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .or(`registration_code.eq.${code},id.eq.${code}`)
      .maybeSingle();

    if (registration) {
      await supabaseAdmin.from('participants').delete().eq('registration_id', registration.id);
      await supabaseAdmin.from('registration_participants').delete().eq('registration_id', registration.id);
      await supabaseAdmin.from('registration_events').delete().eq('registration_id', registration.id);
      await supabaseAdmin.from('payments').delete().eq('registration_id', registration.id);
      await supabaseAdmin.from('registrations').delete().eq('id', registration.id);
      return true;
    }
  } catch (err) {
    console.warn('[DB] deleteRegistration remote sync failed:', err);
  }

  return localDeleted;
}

export async function listRegistrations(filters?: {
  registrationType?: 'workshop' | 'technical';
  paymentStatus?: RegistrationRecord['paymentStatus'];
  search?: string;
}): Promise<RegistrationRecord[]> {
  const localRegs = store.getRegistrations();
  let results = localRegs;

  if (isSupabaseConfigured()) {
    try {
      let query = supabaseAdmin
        .from('registrations')
        .select(`
          *,
          participants(*),
          registration_events(
            event_id,
            price_at_registration,
            events(
              category
            )
          ),
          payments(*)
        `)
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
      if (!error && data) {
        const remoteRegs = data.map(mapRegistration);
        const map = new Map<string, RegistrationRecord>();
        for (const r of localRegs) {
          map.set(r.id.toUpperCase(), r);
        }
        for (const r of remoteRegs) {
          map.set(r.id.toUpperCase(), r);
        }
        results = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    } catch {
      results = localRegs;
    }
  }

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
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }

  return results;
}

export async function getRegistrationStats() {
  const registrations = await listRegistrations();

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
    totalParticipants: registrations.reduce((sum, r) => sum + r.participants.length, 0),
    workshopCount,
    technicalCount,
    paidCount,
    pendingCount,
    eventCounts,
    eventTeamCounts,
    recentRegistrations: registrations.slice(0, 10),
  };
}

export async function markAttendance(
  registrationCode: string
): Promise<{ success: boolean; message: string; registration?: RegistrationRecord }> {
  const localRes = store.markAttendance(registrationCode);
  const registration = await getRegistrationById(registrationCode);

  if (!isSupabaseConfigured() || !registration) {
    return localRes;
  }

  try {
    const { data: regRow } = await supabaseAdmin
      .from('registrations')
      .select('id')
      .eq('registration_code', normalizeRegistrationCode(registrationCode))
      .maybeSingle();

    if (regRow) {
      await supabaseAdmin
        .from('registrations')
        .update({
          attendance_marked: true,
          attendance_marked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', regRow.id);

      const updated = await getRegistrationById(registrationCode);
      return {
        success: true,
        message: 'Attendance successfully marked.',
        registration: updated || registration,
      };
    }
  } catch {}

  return localRes;
}

export async function getEmailLogs(registrationId?: string) {
  if (!isSupabaseConfigured()) return [];
  try {
    let query = supabaseAdmin.from('email_logs').select('*').order('created_at', { ascending: false });
    if (registrationId) query = query.eq('registration_id', registrationId);
    const { data } = await query;
    return data || [];
  } catch {
    return [];
  }
}

export async function getTicketByRegistrationId(registrationId: string) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('registration_id', registrationId)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function updatePaymentRecord(
  registrationUuid: string,
  patch: Record<string, any>
) {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await supabaseAdmin
      .from('payments')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('registration_id', registrationUuid)
      .select('*')
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function importRegistrations(registrations: RegistrationRecord[]): Promise<void> {
  // Clear existing local memory database records first to avoid leftover test registrations
  store.clearAllRegistrations();

  const allEvents = store.getEvents();

  // Always import into local store fallback
  for (const reg of registrations) {
    if (!reg.id) continue;

    const eventTextLower = String(reg.eventsText || '').toLowerCase();
    const selectedTechnicalIds: string[] = Array.isArray(reg.selectedTechnicalIds) ? [...reg.selectedTechnicalIds] : [];
    const selectedNonTechnicalIds: string[] = Array.isArray(reg.selectedNonTechnicalIds) ? [...reg.selectedNonTechnicalIds] : [];
    let selectedWorkshopId: string | undefined = reg.selectedWorkshopId;

    // Scan through all available events to match by name or slug from eventsText string
    for (const event of allEvents) {
      const titleLower = event.title.toLowerCase();
      const slugLower = event.slug.toLowerCase();

      if (
        eventTextLower.includes(titleLower) ||
        eventTextLower.includes(slugLower) ||
        eventTextLower.includes(event.id.toLowerCase())
      ) {
        if (event.category === 'workshops') {
          selectedWorkshopId = event.id;
        } else if (event.category === 'technical') {
          if (!selectedTechnicalIds.includes(event.id)) {
            selectedTechnicalIds.push(event.id);
          }
        } else if (event.category === 'non-technical') {
          if (!selectedNonTechnicalIds.includes(event.id)) {
            selectedNonTechnicalIds.push(event.id);
          }
        }
      }
    }

    // Keyword based workshop matching fallback
    if (!selectedWorkshopId) {
      const siliconWs = allEvents.find((e) => e.category === 'workshops' && (e.slug.includes('silicon') || e.id.includes('silicon')));
      const embeddedWs = allEvents.find((e) => e.category === 'workshops' && (e.slug.includes('embedded') || e.id.includes('embedded')));
      const instWs = allEvents.find((e) => e.category === 'workshops' && (e.slug.includes('instrumentation') || e.slug.includes('virtual') || e.id.includes('instrumentation')));

      if (eventTextLower.includes('silicon') || eventTextLower.includes('gds') || eventTextLower.includes('cadence') || eventTextLower.includes('vlsi')) {
        selectedWorkshopId = siliconWs?.id || 'ws-silicon-2-gds';
      } else if (eventTextLower.includes('embedded') || eventTextLower.includes('microcontroller') || eventTextLower.includes('arm')) {
        selectedWorkshopId = embeddedWs?.id || 'ws-embedded-system';
      } else if (eventTextLower.includes('instrumentation') || eventTextLower.includes('labview') || eventTextLower.includes('virtual') || eventTextLower.includes('daq')) {
        selectedWorkshopId = instWs?.id || 'ws-virtual-instrumentation';
      }
    }

    // Force workshop registration category type synchronization if workshop ID was matched
    let regType = String(reg.registrationType || '').toLowerCase();
    if (regType === 'symposium' || regType === 'technical') {
      regType = 'technical';
    }
    if (selectedWorkshopId) {
      regType = 'workshop';
    } else if (regType !== 'workshop') {
      regType = 'technical';
    }

    // Clean workshop title to ensure strict concise naming (e.g. SILICON 2 GDS, Embedded System, Virtual Instrumentation)
    let cleanEventsText = reg.eventsText;
    if (regType === 'workshop') {
      if (selectedWorkshopId) {
        const matched = allEvents.find((e) => e.id === selectedWorkshopId);
        cleanEventsText = matched ? matched.title : cleanWorkshopTitle(reg.eventsText);
      } else {
        cleanEventsText = cleanWorkshopTitle(reg.eventsText);
      }
    }

    // Normalize properties to prevent missing field crashes
    const normalizedReg: RegistrationRecord = {
      ...reg,
      registrationType: regType as 'workshop' | 'technical',
      eventsText: cleanEventsText,
      selectedWorkshopId,
      selectedTechnicalIds,
      selectedNonTechnicalIds,
      participants: reg.participants || [],
    };

    store.addRegistration(normalizedReg);

    // If Supabase is active, also upsert records into Supabase to sync them permanently
    if (isSupabaseConfigured()) {
      try {
        // Find existing or insert
        const { data: existingReg } = await supabaseAdmin
          .from('registrations')
          .select('id')
          .eq('registration_code', normalizedReg.id)
          .maybeSingle();

        const dbRegType = normalizedReg.registrationType === 'workshop' ? 'individual' : 'team';
        const dbPayload = {
          registration_code: normalizedReg.id,
          registration_type: dbRegType,
          total_amount: normalizedReg.totalAmount,
          payment_method: normalizedReg.paymentMethod,
          payment_status: normalizedReg.paymentStatus,
          payment_id: normalizedReg.paymentId || normalizedReg.upiReference || null,
          attendance_marked: normalizedReg.attendanceMarked,
          attendance_timestamp: normalizedReg.attendanceTimestamp || null,
          created_at: normalizedReg.createdAt,
        };

        let dbRegId = '';
        if (existingReg) {
          dbRegId = existingReg.id;
          await supabaseAdmin.from('registrations').update(dbPayload).eq('id', dbRegId);
        } else {
          const { data: newDbReg } = await supabaseAdmin
            .from('registrations')
            .insert({ ...dbPayload, uuid: crypto.randomUUID ? crypto.randomUUID() : undefined })
            .select('id')
            .maybeSingle();
          if (newDbReg) dbRegId = newDbReg.id;
        }

        if (dbRegId && normalizedReg.participants && normalizedReg.participants.length > 0) {
          // Clear current participants and junction links for this registration and re-insert
          await supabaseAdmin.from('participants').delete().eq('registration_id', dbRegId);
          await supabaseAdmin.from('registration_participants').delete().eq('registration_id', dbRegId);

          const participantRows = normalizedReg.participants.map((p, idx) => ({
            registration_id: dbRegId,
            full_name: p.fullName,
            email: p.email || '',
            phone: p.phone || '',
            college: p.college || '',
            department: p.department || null,
            year_of_study: p.year || null,
            is_team_leader: idx === 0,
            participant_order: idx + 1,
          }));

          const { data: insertedParticipants, error: pInsertErr } = await supabaseAdmin
            .from('participants')
            .insert(participantRows)
            .select('id');

          if (!pInsertErr && insertedParticipants && insertedParticipants.length > 0) {
            const rpRows = insertedParticipants.map((pRow: any, idx: number) => ({
              registration_id: dbRegId,
              participant_id: pRow.id,
              role: idx === 0 ? 'team_leader' : 'member',
            }));
            await supabaseAdmin.from('registration_participants').insert(rpRows);
          }
        }

        if (dbRegId) {
          // Clear current event links and re-insert
          await supabaseAdmin.from('registration_events').delete().eq('registration_id', dbRegId);

          const eventIds = [
            ...(normalizedReg.selectedWorkshopId ? [normalizedReg.selectedWorkshopId] : []),
            ...normalizedReg.selectedTechnicalIds,
            ...normalizedReg.selectedNonTechnicalIds,
          ];

          if (eventIds.length > 0) {
            const eventRows = eventIds.map(eventId => ({
              registration_id: dbRegId,
              event_id: eventId,
              price_at_registration: 0,
            }));
            await supabaseAdmin.from('registration_events').insert(eventRows);
          }
        }
      } catch (err) {
        console.warn('[DB_IMPORT] Supabase sync issue for record:', normalizedReg.id, err);
      }
    }
  }
}