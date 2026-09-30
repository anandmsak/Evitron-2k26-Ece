import { EventItem, RegistrationRecord, SiteSettings } from '../types';
import { defaultSettings } from '../data/defaultSettings';
import { defaultEvents } from '../data/defaultEvents';
import QRCode from 'qrcode';

const metaEnv = (import.meta as any).env;
const API_BASE =
  metaEnv && metaEnv.VITE_API_BASE_URL
    ? (metaEnv.VITE_API_BASE_URL as string).replace(/\/$/, '')
    : '';

export const INITIAL_ADMIN_PASSWORD_HASH = 'e366ab6093f497202e56b5232a90968d4a8a12b7b290d6bb4186a591ab777135';
export const INITIAL_ADMIN_ALT_PASSWORD_HASH = '36cc3cb78596db27ab553c7a11f9f7b0c4ce85f42e53b496f2657eec9bf52c77';

const GOOGLE_SHEET_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec';

export function sanitizeWebhookUrl(url: string): string {
  if (!url) return '';
  let trimmed = url.trim();
  
  if ((trimmed.match(/https?:\/\//gi) || []).length > 1) {
    const parts = trimmed.split(/(?=https?:\/\/)/i);
    for (const part of parts) {
      if (part && /https?:\/\//i.test(part)) {
        trimmed = part.trim();
        break;
      }
    }
  }

  trimmed = trimmed.replace(/\/exec(\/exec)+/gi, '/exec');
  return trimmed;
}

function findEventByAnyKey(allEvents: any[], eventKey: string) {
  if (!eventKey) return undefined;
  const keyUpper = eventKey.trim().toUpperCase();
  return allEvents.find((e: any) => {
    const idUpper = (e.id || '').toUpperCase();
    const slugUpper = (e.slug || '').toUpperCase();
    return (
      idUpper === keyUpper ||
      slugUpper === keyUpper ||
      idUpper === `TECH-${keyUpper}` ||
      slugUpper === `TECH-${keyUpper}` ||
      idUpper === `WS-${keyUpper}` ||
      slugUpper === `WS-${keyUpper}` ||
      idUpper.replace('TECH-', '') === keyUpper ||
      slugUpper.replace('TECH-', '') === keyUpper ||
      idUpper.replace('WS-', '') === keyUpper ||
      slugUpper.replace('WS-', '') === keyUpper
    );
  });
}

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

// Safely parse JSON from fetch response without throwing syntax error on HTML (e.g. Vercel 404 pages)
async function parseJsonSafely(res: Response): Promise<{ isJson: boolean; data: any; rawText: string }> {
  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return { isJson: true, data, rawText: text };
    } catch {
      return { isJson: false, data: null, rawText: text };
    }
  } catch {
    return { isJson: false, data: null, rawText: '' };
  }
}

// ----------------------------------------------------
// LOCAL STORAGE PERSISTENCE HELPERS (FOR STANDALONE / VERCEL STATIC MODE)
// ----------------------------------------------------

function getLocalRegistrations(): RegistrationRecord[] {
  try {
    const raw = localStorage.getItem('evitron_registrations');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalRegistrations(regs: RegistrationRecord[]): void {
  try {
    localStorage.setItem('evitron_registrations', JSON.stringify(regs));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

function getLocalSettings(): SiteSettings {
  try {
    const raw = localStorage.getItem('evitron_site_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultSettings, ...parsed };
    }
  } catch {}
  return defaultSettings;
}

function saveLocalSettings(settings: SiteSettings): void {
  try {
    localStorage.setItem('evitron_site_settings', JSON.stringify(settings));
  } catch {}
}

function getLocalEvents(): EventItem[] {
  try {
    const raw = localStorage.getItem('evitron_events');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return defaultEvents;
}

function saveLocalEvents(events: EventItem[]): void {
  try {
    localStorage.setItem('evitron_events', JSON.stringify(events));
  } catch {}
}

// ----------------------------------------------------
// PUBLIC API ENDPOINTS
// ----------------------------------------------------

export async function fetchSiteSettings(): Promise<SiteSettings & { razorpayKeyId?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.isJson && parsed.data?.symposiumTitle) {
      saveLocalSettings(parsed.data);
      return parsed.data;
    }
  } catch (err) {
    console.warn('API /api/settings unreachable, using local configuration:', err);
  }
  return getLocalSettings();
}

export const fetchPublicSettings = fetchSiteSettings;

export async function fetchEvents(): Promise<EventItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/events`);
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.isJson && Array.isArray(parsed.data) && parsed.data.length > 0) {
      saveLocalEvents(parsed.data);
      return parsed.data;
    }
  } catch (err) {
    console.warn('API /api/events unreachable, using local events catalogue:', err);
  }
  return getLocalEvents();
}

export const fetchPublicEvents = fetchEvents;

export async function fetchEventBySlug(slug: string): Promise<EventItem> {
  try {
    const res = await fetch(`${API_BASE}/api/events/${encodeURIComponent(slug)}`);
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.isJson && parsed.data?.id) {
      return parsed.data;
    }
  } catch {}

  const localEvents = getLocalEvents();
  const event = localEvents.find((e) => e.slug === slug);
  if (!event) throw new Error('Event not found');
  return event;
}

export async function createOrder(payload: any): Promise<{
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}> {
  const res = await fetch(`${API_BASE}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const parsed = await parseJsonSafely(res);
  if (res.ok && parsed.isJson) {
    return parsed.data;
  }
  throw new Error(parsed.data?.error || 'Failed to initialize payment gateway order');
}

export async function verifyPayment(payload: any): Promise<{
  success: boolean;
  registrationId: string;
  registration: RegistrationRecord;
}> {
  const res = await fetch(`${API_BASE}/api/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const parsed = await parseJsonSafely(res);
  if (res.ok && parsed.isJson) {
    return parsed.data;
  }
  throw new Error(parsed.data?.error || 'Payment verification failed');
}

export async function submitUpiRegistration(payload: any): Promise<{
  success: boolean;
  registrationId: string;
  registration: RegistrationRecord;
}> {
  const res = await fetch(`${API_BASE}/api/register-upi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const parsed = await parseJsonSafely(res);
  if (res.ok && parsed.isJson && parsed.data?.registrationId) {
    return parsed.data;
  }
  throw new Error(parsed.data?.error || 'Registration submission failed. Please try again.');
}

export async function fetchRegistrationById(id: string): Promise<RegistrationRecord & { qrDataUrl: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/registration/${encodeURIComponent(id)}`);
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.isJson && parsed.data?.id) {
      return parsed.data;
    }
  } catch {}

  // Check local registrations
  const localRegs = getLocalRegistrations();
  const reg = localRegs.find((r) => r.id.toUpperCase() === id.toUpperCase());
  if (reg) {
    const qrDataUrl = await QRCode.toDataURL(`Registration ID: ${reg.id}\nLeader: ${reg.teamLeader.fullName}`, {
      width: 256,
      margin: 1,
    });
    return { ...reg, qrDataUrl };
  }

  throw new Error('Registration record not found.');
}

export async function markAttendanceApi(token: string, id: string): Promise<{
  success: boolean;
  message: string;
  registration?: RegistrationRecord;
}> {
  if (!token.startsWith('evitron_local_')) {
    const res = await fetch(`${API_BASE}/api/attendance/mark`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ registrationId: id }),
    });
    const parsed = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(parsed.data?.error || parsed.data?.message || `Failed to mark attendance (status: ${res.status})`);
    }
    return parsed.data;
  }

  // Local fallback
  const localRegs = getLocalRegistrations();
  const match = String(id).match(/EV26-[A-Z0-9]{6}/i);
  const cleanId = match ? match[0].toUpperCase() : String(id).trim().toUpperCase();
  const idx = localRegs.findIndex((r) => r.id.toUpperCase() === cleanId);

  if (idx !== -1) {
    localRegs[idx].attendanceMarked = true;
    localRegs[idx].attendanceTimestamp = new Date().toISOString();
    saveLocalRegistrations(localRegs);
    return {
      success: true,
      message: `Attendance marked successfully for ${localRegs[idx].teamLeader.fullName} (${cleanId}).`,
      registration: localRegs[idx],
    };
  }

  throw new Error(`Registration ID "${cleanId}" not found in database.`);
}

// ----------------------------------------------------
// ADMIN API CALLS WITH ZERO-CRASH LOCAL FALLBACK
// ----------------------------------------------------

export async function adminLogin(password: string): Promise<{ success: boolean; token: string }> {
  const cleanInput = (password || '').trim();
  if (!cleanInput) {
    throw new Error('Please enter administrator password.');
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cleanInput }),
    });

    const parsed = await parseJsonSafely(res);
    if (parsed.isJson) {
      if (res.ok && parsed.data?.token) {
        return { success: true, token: parsed.data.token };
      }
      if (res.status === 401 || parsed.data?.error) {
        throw new Error(parsed.data.error || 'Incorrect administrator password.');
      }
    }
  } catch (err: any) {
    // If it was an intentional rejection from the API server, rethrow!
    if (err.message && (err.message.includes('Incorrect') || err.message.includes('Password required'))) {
      throw err;
    }
    console.warn('Backend login endpoint unavailable or returned non-JSON. Verifying credentials client-side:', err);
  }

  // Client-side authentication fallback (for Vercel static deployments or offline portal)
  const savedPassword = localStorage.getItem('evitron_admin_password');

  // Compute SHA-256 of the input
  const msgUint8 = new TextEncoder().encode(cleanInput);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const isMatch =
    hashHex === INITIAL_ADMIN_PASSWORD_HASH ||
    hashHex === INITIAL_ADMIN_ALT_PASSWORD_HASH ||
    (savedPassword && cleanInput === savedPassword);

  if (isMatch) {
    const localToken = `evitron_local_${Math.random().toString(36).substring(2)}_${Date.now().toString(36)}`;
    return { success: true, token: localToken };
  }

  throw new Error('Incorrect administrator password. Please check your credentials.');
}

function calculateLocalStats(registrations: RegistrationRecord[]) {
  let totalParticipants = 0;
  let workshopCount = 0;
  let technicalCount = 0;
  let paidCount = 0;
  let pendingCount = 0;
  const eventCounts: Record<string, number> = {};

  for (const r of registrations) {
    totalParticipants += r.participants.length;
    if (r.registrationType === 'workshop') {
      workshopCount++;
      if (r.selectedWorkshopId) {
        eventCounts[r.selectedWorkshopId] = (eventCounts[r.selectedWorkshopId] || 0) + 1;
      }
    } else {
      technicalCount++;
      for (const tid of r.selectedTechnicalIds) {
        eventCounts[tid] = (eventCounts[tid] || 0) + 1;
      }
      for (const nid of r.selectedNonTechnicalIds) {
        eventCounts[nid] = (eventCounts[nid] || 0) + 1;
      }
    }

    if (r.paymentStatus === 'paid') paidCount++;
    else if (r.paymentStatus === 'pending_verification') pendingCount++;
  }

  return {
    totalRegistrations: registrations.length,
    totalParticipants,
    workshopCount,
    technicalCount,
    paidCount,
    pendingCount,
    eventCounts,
    recentRegistrations: registrations.slice(0, 10),
  };
}

export async function fetchAdminStats(token: string, signal?: AbortSignal): Promise<any> {
  if (!token.startsWith('evitron_local_')) {
    const res = await fetch(`${API_BASE}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.isJson) {
      return parsed.data;
    }
    const err = new Error(parsed.data?.error || `Failed to fetch admin stats (status: ${res.status})`) as any;
    err.status = res.status;
    throw err;
  }

  // Calculate stats from local storage
  const registrations = getLocalRegistrations();
  return calculateLocalStats(registrations);
}

export async function fetchAdminRegistrations(
  token: string,
  signalOrQuery?: AbortSignal | string,
  query = ''
): Promise<{ registrations: RegistrationRecord[]; stats: any }> {
  const signal = signalOrQuery instanceof AbortSignal ? signalOrQuery : undefined;
  const q = typeof signalOrQuery === 'string' ? signalOrQuery : query;

  try {
    const res = await fetch(`${API_BASE}/api/admin/registrations${q ? `?${q}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.isJson) {
      return parsed.data;
    }
    if (!token.startsWith('evitron_local_') || res.status === 401) {
      if (res.status === 401) {
        const err = new Error(parsed.data?.error || 'Unauthorized') as any;
        err.status = 401;
        throw err;
      }
    }
  } catch (err: any) {
    if (err?.status === 401) throw err;
    if (!token.startsWith('evitron_local_')) {
      console.warn('Server registrations endpoint unavailable, attempting local fallback:', err);
    }
  }

  // Filter local registrations fallback
  let regs = getLocalRegistrations();
  const params = new URLSearchParams(q);
  const type = params.get('type');
  const status = params.get('status');
  const search = params.get('search')?.toLowerCase();

  if (type) regs = regs.filter((r) => r.registrationType === type);
  if (status) regs = regs.filter((r) => r.paymentStatus === status);
  if (search) {
    regs = regs.filter(
      (r) =>
        r.id.toLowerCase().includes(search) ||
        r.teamLeader.fullName.toLowerCase().includes(search) ||
        r.teamLeader.email.toLowerCase().includes(search) ||
        r.teamLeader.college.toLowerCase().includes(search) ||
        (r.upiReference && r.upiReference.toLowerCase().includes(search))
    );
  }

  const localStats = calculateLocalStats(regs);
  return { registrations: regs, stats: localStats };
}

export async function updateRegistrationStatus(
  token: string,
  id: string,
  status: 'paid' | 'pending_verification' | 'failed'
): Promise<RegistrationRecord> {
  // Update in local store
  const localRegs = getLocalRegistrations();
  const idx = localRegs.findIndex((r) => r.id === id);
  let updatedRecord: RegistrationRecord | null = null;
  if (idx !== -1) {
    localRegs[idx].paymentStatus = status;
    saveLocalRegistrations(localRegs);
    updatedRecord = localRegs[idx];
  }

  if (!token.startsWith('evitron_local_')) {
    const res = await fetch(`${API_BASE}/api/admin/registrations/${id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    const parsed = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(parsed.data?.error || `Failed to update status (status: ${res.status})`);
    }
    return parsed.data;
  }

  if (updatedRecord) return updatedRecord;
  throw new Error('Registration not found to update status.');
}

export async function updateSiteSettings(token: string, updates: Partial<SiteSettings>): Promise<SiteSettings> {
  const current = getLocalSettings();
  const updated = { ...current, ...updates };
  saveLocalSettings(updated);

  if (!token.startsWith('evitron_local_')) {
    const res = await fetch(`${API_BASE}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    const parsed = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(parsed.data?.error || `Failed to update site settings (status: ${res.status})`);
    }
    const merged = { ...updated, ...parsed.data };
    saveLocalSettings(merged);
    return merged;
  }

  return updated;
}

export async function updateEnvironment(
  token: string,
  newEnv: 'development' | 'production'
): Promise<SiteSettings> {
  if (token.startsWith('evitron_local_')) {
    if (newEnv === 'production') {
      throw new Error(
        'Cannot switch to PRODUCTION in offline/local mode — a live backend is required to verify Razorpay credentials.'
      );
    }
    const current = getLocalSettings();
    const updated = { ...current, appEnv: newEnv };
    saveLocalSettings(updated);
    return updated;
  }

  const res = await fetch(`${API_BASE}/api/admin/settings/environment`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ appEnv: newEnv }),
  });

  const parsed = await parseJsonSafely(res);
  if (!res.ok || !parsed.isJson) {
    throw new Error(
      parsed.isJson && parsed.data?.error
        ? parsed.data.error
        : `Environment switch failed (server responded ${res.status}).`
    );
  }

  const updatedSettings = { ...getLocalSettings(), ...parsed.data };
  saveLocalSettings(updatedSettings);
  return updatedSettings;
}
export async function updateEventDetails(
  token: string,
  eventId: string,
  updates: Partial<EventItem>
): Promise<EventItem> {
  const currentEvents = getLocalEvents();
  const idx = currentEvents.findIndex((e) => e.id === eventId);
  let updatedEvent: EventItem | null = null;

  if (idx !== -1) {
    currentEvents[idx] = { ...currentEvents[idx], ...updates };
    saveLocalEvents(currentEvents);
    updatedEvent = currentEvents[idx];
  }

  if (!token.startsWith('evitron_local_')) {
    const res = await fetch(`${API_BASE}/api/admin/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    const parsed = await parseJsonSafely(res);
    if (!res.ok) {
      throw new Error(parsed.data?.error || `Failed to update event details (status: ${res.status})`);
    }
    const serverEvent = parsed.data;
    const fresh = getLocalEvents();
    const fIdx = fresh.findIndex((e) => e.id === eventId);
    if (fIdx !== -1) {
      fresh[fIdx] = { ...fresh[fIdx], ...serverEvent };
      saveLocalEvents(fresh);
    }
    return serverEvent;
  }

  if (updatedEvent) return updatedEvent;
  throw new Error('Event not found.');
}

export async function syncGoogleSheetsApi(token: string): Promise<{ success: boolean; message: string }> {
  if (!token.startsWith('evitron_local_')) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/sync-google-sheet`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = await parseJsonSafely(res);
      if (res.ok && parsed.isJson) {
        return parsed.data;
      }
      if (parsed.data?.error) throw new Error(parsed.data.error);
    } catch (e: any) {
      if (e.message && !e.message.includes('fetch') && !e.message.includes('Unexpected')) {
        throw e;
      }
    }
  }

  // Client-side batch sync to Google Sheet webhook
  const registrations = getLocalRegistrations();
  const allEvents = getLocalEvents();
  let count = 0;

  for (const r of registrations) {
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

    try {
      await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regId: r.id,
          createdAt: r.createdAt,
          track: r.registrationType,
          events: eventTitles.join(', '),
          leaderName: r.teamLeader.fullName,
          leaderEmail: r.teamLeader.email,
          leaderPhone: r.teamLeader.phone,
          college: r.teamLeader.college,
          department: r.teamLeader.department,
          year: r.teamLeader.year,
          participantsCount: r.participants.length,
          member2: r.participants[1] ? `${r.participants[1].fullName} (${r.participants[1].phone})` : '',
          member3: r.participants[2] ? `${r.participants[2].fullName} (${r.participants[2].phone})` : '',
          member4: r.participants[3] ? `${r.participants[3].fullName} (${r.participants[3].phone})` : '',
          amount: r.totalAmount,
          paymentMethod: r.paymentMethod,
          paymentStatus: r.paymentStatus,
          paymentRef: r.paymentId || r.upiReference || '',
          attendance: r.attendanceMarked ? 'Present' : 'Absent',
        }),
      });
      count++;
    } catch {}
  }

  return {
    success: true,
    message: `Synchronized ${count} registration record(s) with Google Sheet webhook.`,
  };
}

export async function fetchPaymentProof(token: string, regId: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/registrations/${regId}/payment-proof`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.data?.paymentProofUrl) {
      return parsed.data.paymentProofUrl;
    }
  } catch (err) {
    if (!token.startsWith('evitron_local_')) {
      console.warn('Failed to fetch payment proof from server:', err);
    }
  }

  const list = getLocalRegistrations();
  const found = list.find((r) => r.id === regId);
  return found?.paymentProofUrl || '';
}

export async function deleteRegistrationApi(token: string, regId: string, deletePassword?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/registrations/${regId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deletePassword }),
    });
    const parsed = await parseJsonSafely(res);
    if (res.ok && parsed.data) {
      return parsed.data;
    }
    if (!token.startsWith('evitron_local_') || res.status === 401 || res.status === 403) {
      throw new Error(parsed.data?.error || 'Failed to delete registration');
    }
  } catch (err: any) {
    if (!token.startsWith('evitron_local_')) throw err;
  }

  const list = getLocalRegistrations();
  const filtered = list.filter((r) => r.id.toUpperCase() !== regId.toUpperCase());
  saveLocalRegistrations(filtered);
  return { success: true, message: `Registration ${regId} deleted successfully` };
}

export async function testEmailApi(
  token: string,
  recipient: string
): Promise<{ sent: boolean; message: string; provider: string }> {
  const res = await fetch(`${API_BASE}/api/admin/test-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient }),
  });
  const parsed = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(parsed.data?.error || parsed.data?.message || 'Failed to trigger test email');
  }
  return parsed.data;
}

