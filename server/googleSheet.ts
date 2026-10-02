// server/googleSheet.ts
import { RegistrationRecord } from '../src/types';

export const REAL_GOOGLE_SHEET_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec';

export function getWebhookUrl(customUrl?: string): string {
  if (customUrl && !customUrl.includes('PLACEHOLDER') && customUrl.startsWith('http')) {
    return customUrl.trim();
  }
  const envUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL?.trim();
  if (envUrl && !envUrl.includes('PLACEHOLDER') && envUrl.startsWith('http')) {
    return envUrl;
  }
  return REAL_GOOGLE_SHEET_WEBHOOK_URL;
}

export const GOOGLE_SHEET_WEBHOOK_URL = getWebhookUrl();

/**
 * Returns strictly clean short event names including UUID resolution
 */
export function formatShortEventName(raw: string | undefined | null): string {
  if (!raw) return '';
  const s = String(raw).toLowerCase().trim();

  // Direct UUID and ID mappings
  if (s === '4e91a80e-4baa-4fc2-bf6c-7f95e135fc80' || s === 'silicon-2-gds' || s === 'ws-silicon-2-gds' || s === 'silicon 2gds' || s === 'silicon 2 gds') return 'silicon 2 gds';
  if (s === 'd6699fda-e9a5-404d-88e8-bd9e0610988e' || s === 'embedded-system' || s === 'ws-embedded-system' || s === 'embedded system') return 'embedded system';
  if (s === 'ee27539a-2318-44da-9697-bb859ed57a50' || s === 'virtual-instrumentation' || s === 'ws-virtual-instrumentation' || s === 'virtual instrument') return 'virtual instrument';
  if (s === '46aa179c-ec4a-4d8d-a206-7c4c497a95ce' || s === 'techpaper' || s === 'tech-techpaper') return 'techpaper';
  if (s === 'c2a1bbfc-85fb-49f9-9d9d-39759b6df37f' || s === 'evolvex' || s === 'tech-evolvex') return 'evolvex';
  if (s === '626a494c-0e71-4679-abad-9d5a4d5758e2' || s === 'tracktron' || s === 'tech-tracktron' || s === 'tractron') return 'tractron';
  if (s === '8ebc96bf-893d-4e6b-8976-6f541f2631ff' || s === 'mind-maze' || s === 'non-mind-maze' || s === 'mind maze') return 'mind maze';
  if (s === '41b7298f-6401-4409-a000-5cc406e194b8' || s === 'promptify' || s === 'non-promptify') return 'promptify';
  if (s === '0dcd0759-87af-4bce-9757-5e52833c538b' || s === 'memix' || s === 'non-memix') return 'memix';
  if (s === '57d56f8c-99c4-4e78-bb57-4c7a6ec47716' || s === 'detective-404' || s === 'non-detective-404' || s === 'detective 404') return 'detective 404';

  if (s.includes('silicon') || s.includes('gds') || s.includes('cadence') || s.includes('vlsi')) {
    return 'silicon 2 gds';
  }
  if (s.includes('virtual') || s.includes('labview') || s.includes('instrument')) {
    return 'virtual instrument';
  }
  if (s.includes('embedded') || s.includes('microcontroller') || s.includes('arm')) {
    return 'embedded system';
  }
  if (s.includes('techpaper') || s.includes('paper presentation') || s.includes('paper')) {
    return 'techpaper';
  }
  if (s.includes('tracktron') || s.includes('tractron') || s.includes('line follower') || s.includes('robot')) {
    return 'tractron';
  }
  if (s.includes('evolvex') || s.includes('project')) {
    return 'evolvex';
  }
  if (s.includes('mind') || s.includes('maze')) {
    return 'mind maze';
  }
  if (s.includes('prompt')) {
    return 'promptify';
  }
  if (s.includes('mem')) {
    return 'memix';
  }
  if (s.includes('detective') || s.includes('404')) {
    return 'detective 404';
  }

  return String(raw)
    .replace(/^(tech|ws|non|nontech)-/i, '')
    .trim()
    .toLowerCase();
}

export function formatIsoTimestamp(val: any): string {
  if (!val) {
    const d = new Date();
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
  }

  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val.trim())) {
    return val.trim();
  }

  const d = new Date(val);
  if (isNaN(d.getTime())) {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
  }

  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
}

export function formatGoogleSheetPayload(reg: RegistrationRecord, eventTitles?: string[]): Record<string, any> {
  const isWorkshop = reg.registrationType === 'workshop';
  const trackLabel = isWorkshop
    ? 'Workshop'
    : `Technical Symposium (${reg.participants?.length || 1})`;

  // Extract clean short event names
  let eventList: string[] = [];
  if (eventTitles && eventTitles.length > 0) {
    eventList = eventTitles;
  } else if (reg.eventsText) {
    eventList = reg.eventsText.split(',').map((s) => s.trim());
  } else if (isWorkshop) {
    eventList = [reg.selectedWorkshopId || 'Embedded System'];
  } else {
    const list = [...(reg.selectedTechnicalIds || []), ...(reg.selectedNonTechnicalIds || [])];
    eventList = list.length > 0 ? list : ['techpaper'];
  }

  const cleanEvents =
    Array.from(new Set(eventList.map((e) => formatShortEventName(e)).filter(Boolean))).join(', ') ||
    (isWorkshop ? 'embedded system' : 'techpaper');

  const formattedDate = formatIsoTimestamp(reg.createdAt);

  const p2 = reg.participants?.[1];
  const p3 = reg.participants?.[2];
  const p4 = reg.participants?.[3];

  let proofDisplay = 'N/A';
  if (reg.paymentProofUrl && reg.paymentProofUrl !== 'N/A' && reg.paymentProofUrl !== 'HAS_PROOF' && reg.paymentProofUrl.trim().length > 0) {
    proofDisplay = reg.paymentProofUrl.trim();
  }

  const payload: Record<string, any> = {
    regId: reg.id,
    createdAt: formattedDate,
    timestamp: formattedDate,
    track: trackLabel,
    events: cleanEvents,
    leaderName: reg.teamLeader?.fullName || 'N/A',
    leaderEmail: reg.teamLeader?.email || 'N/A',
    leaderPhone: reg.teamLeader?.phone || 'N/A',
    college: reg.teamLeader?.college || 'N/A',
    department: reg.teamLeader?.department || 'N/A',
    year: reg.teamLeader?.year || 'N/A',
    participantsCount: reg.participants?.length || 1,
    member2: p2 ? `${p2.fullName} (${p2.phone || 'N/A'})` : 'N/A',
    member3: p3 ? `${p3.fullName} (${p3.phone || 'N/A'})` : 'N/A',
    member4: p4 ? `${p4.fullName} (${p4.phone || 'N/A'})` : 'N/A',
    amount: reg.totalAmount,
    paymentMethod: 'UPI',
    paymentStatus: (reg.paymentStatus === 'paid' ? 'PAID' : 'PENDING').toUpperCase(),
    paymentRef: reg.upiReference || reg.paymentId || 'N/A',
    paymentProof: proofDisplay,
    paymentProofUrl: proofDisplay,
    attendance: reg.attendanceMarked ? 'Present' : 'Absent',
  };

  return payload;
}

export async function syncRegistrationToGoogleSheet(
  reg: RegistrationRecord,
  eventTitles?: string[],
  customWebhookUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = getWebhookUrl(customWebhookUrl);
  if (!webhookUrl) {
    return { success: false, error: 'No Google Sheet webhook URL configured' };
  }

  const payload = formatGoogleSheetPayload(reg, eventTitles);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[GOOGLE SHEET SYNC] Attempt ${attempt} HTTP ${res.status} for ${reg.id}:`, errText);
        if (attempt === 2) return { success: false, error: `HTTP ${res.status}` };
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }

      const json = (await res.json().catch(() => null)) as any;
      if (json && json.status === 'success') {
        console.log(`[GOOGLE SHEET SYNC] Successfully updated live row for ${reg.id} (${payload.events})`);
        return { success: true };
      }
      return { success: true };
    } catch (err: any) {
      console.warn(`[GOOGLE SHEET SYNC] Attempt ${attempt} network error syncing ${reg.id}:`, err.message);
      if (attempt === 2) return { success: false, error: err.message };
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return { success: false, error: 'Unknown sync failure' };
}

export async function deleteRegistrationFromGoogleSheet(
  regId: string,
  customWebhookUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = getWebhookUrl(customWebhookUrl);
  if (!webhookUrl) return { success: false, error: 'No webhook URL' };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', regId }),
      redirect: 'follow',
    });
    if (res.ok) {
      console.log(`[GOOGLE SHEET SYNC] Sent delete command for ${regId}`);
      return { success: true };
    }
  } catch (err: any) {
    console.warn(`[GOOGLE SHEET SYNC] Deletion failed for ${regId}:`, err.message);
  }
  return { success: false };
}

export async function syncAllRegistrationsToGoogleSheet(
  registrations: RegistrationRecord[],
  customWebhookUrl?: string,
  onProgress?: (synced: number, total: number) => void
): Promise<{ success: boolean; syncedCount: number; errorCount: number }> {
  let syncedCount = 0;
  let errorCount = 0;

  // Fetch existing rows from Google Sheet to avoid redundant network calls
  let existingSheetMap = new Map<string, any>();
  try {
    const existing = await fetchRegistrationsFromGoogleSheet(customWebhookUrl);
    for (const item of existing) {
      if (item && item.id) {
        existingSheetMap.set(String(item.id).trim().toUpperCase(), item);
      }
    }
  } catch {}

  const pending = registrations.filter((r) => {
    const code = String(r.id).trim().toUpperCase();
    const inSheet = existingSheetMap.get(code);
    if (!inSheet) return true; // not in sheet -> must sync
    // Check if status changed
    const sheetStatus = String(inSheet.paymentStatus || '').toLowerCase();
    const localStatus = String(r.paymentStatus || '').toLowerCase();
    if (sheetStatus !== localStatus) return true;
    return false;
  });

  const total = pending.length;
  if (total === 0) {
    return { success: true, syncedCount: registrations.length, errorCount: 0 };
  }

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    const res = await syncRegistrationToGoogleSheet(r, undefined, customWebhookUrl);
    if (res.success) {
      syncedCount++;
    } else {
      errorCount++;
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
    if (i < pending.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return { success: true, syncedCount: registrations.length, errorCount };
}

export async function fetchRegistrationsFromGoogleSheet(
  customWebhookUrl?: string
): Promise<any[]> {
  const webhookUrl = getWebhookUrl(customWebhookUrl);
  if (!webhookUrl) return [];

  try {
    const url = `${webhookUrl}?action=getRegistrations`;
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err: any) {
    console.warn('[GOOGLE SHEET PULL EXCEPTION]', err?.message || err);
  }
  return [];
}

