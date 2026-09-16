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
  const links = Array.isArray(row.registration_participants)
    ? [...row.registration_participants].sort((a, b) => {
        if (a.role === 'team_leader' || a.role === 'leader') return -1;
        if (b.role === 'team_leader' || b.role === 'leader') return 1;
        return 0;
      })
    : [];

  const participants = links.map((x: any) => participantFromRow(x.participants)).filter(Boolean);
  const leader = participants[0] || { fullName: 'Attendee', email: '', phone: '', college: '' };

  const payment = Array.isArray(row.payments)
    ? row.payments.find((p: any) => p.id) || row.payments[0]
    : row.payments;

  const registrationEvents = Array.isArray(row.registration_events)
    ? row.registration_events
    : [];

  const workshopEvents = registrationEvents.filter(
    (x: any) => String(x.events?.category || '').toLowerCase() === 'workshop'
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
        ? workshopEvents[0]?.event_id
        : undefined,
    selectedTechnicalIds: technicalEvents.map((x: any) => x.event_id),
    selectedNonTechnicalIds: nonTechnicalEvents.map((x: any) => x.event_id),
    participants: participants.length > 0 ? participants : [leader],
    teamLeader: leader,
    totalAmount: Number(row.total_amount || 350),
    paymentMethod: row.payment_method || 'upi',
    paymentStatus: row.payment_status === 'pending' ? 'pending_verification' : (row.payment_status || 'pending_verification'),
    paymentId: payment?.razorpay_payment_id || undefined,
    upiReference: payment?.upi_reference || undefined,
    driveScreenshotSubmitted: Boolean(payment?.payment_proof_url || payment?.upi_reference),
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
        registration_participants(
          role,
          participants(*)
        ),
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
        registration_participants(
          role,
          participants(*)
        ),
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
    return String(data || registrationCode);
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
          registration_participants(
            role,
            participants(*)
          ),
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
  for (const r of registrations) {
    if (r.selectedWorkshopId) {
      eventCounts[r.selectedWorkshopId] = (eventCounts[r.selectedWorkshopId] || 0) + 1;
    }
    for (const tid of r.selectedTechnicalIds) {
      eventCounts[tid] = (eventCounts[tid] || 0) + 1;
    }
    for (const nid of r.selectedNonTechnicalIds) {
      eventCounts[nid] = (eventCounts[nid] || 0) + 1;
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