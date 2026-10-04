import fs from 'fs';
import path from 'path';
import { safeParseRegistrationDate, formatIsoTimestamp } from './googleSheet.js';

export interface CsvRegistrationRow {
  id: string;
  registration_code: string;
  created_at: string;
  registration_type: string;
  registered_events: string;
  registration_events: string;
  team_leader_name: string;
  team_leader_email: string;
  team_leader_phone: string;
  college_name: string;
  department: string;
  year_of_study: string;
  total_participants: number;
  team_size: number;
  member_2_details: string;
  member_3_details: string;
  member_4_details: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  payment_reference: string;
  payment_id: string;
  upi_reference: string;
  payment_proof_url: string;
  attendance_status: string;
  attendance_marked: boolean;
  updated_at: string;
  currency: string;
}

export function formatToIsoStandard(str: string): string {
  if (!str) return '2026-10-02 00:00:00';
  return formatIsoTimestamp(str);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
}

export function normalizeStandardEventName(raw: string): string {
  const lower = (raw || '').toLowerCase().trim();
  if (lower.includes('silicon')) return 'silicon 2 gds';
  if (lower.includes('tractron') || lower.includes('tracktron')) return 'tractron';
  if (lower.includes('embedded')) return 'embedded system';
  if (lower.includes('virtual')) return 'virtual instrument';
  if (lower.includes('techpaper') || lower.includes('paper')) return 'techpaper';
  if (lower.includes('evolvex')) return 'evolvex';
  if (lower.includes('detective')) return 'detective 404';
  if (lower.includes('prompt')) return 'promptify';
  if (lower.includes('mind') || lower.includes('maze')) return 'mind maze';
  if (lower.includes('mem')) return 'memix';
  return lower;
}

export function parseStandardEventsFromText(raw: string): string[] {
  const parts = (raw || '').split(',').map(s => normalizeStandardEventName(s)).filter(Boolean);
  return Array.from(new Set(parts));
}

let cachedRows: CsvRegistrationRow[] | null = null;

export function loadCsvRegistrations(): CsvRegistrationRow[] {
  if (cachedRows) return cachedRows;

  const csvPath = path.resolve(process.cwd(), 'data/live_registrations.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn('[CSV DATASET] File not found at', csvPath);
    return [];
  }

  const csvText = fs.readFileSync(csvPath, 'utf8');
  const lines = csvText.split('\n').filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const rows = lines.slice(1).map(parseCSVLine);
  const result: CsvRegistrationRow[] = [];

  for (const r of rows) {
    const regCode = r[0];
    if (!regCode || !regCode.startsWith('EV26-')) continue;

    const rawTimestamp = r[1] || '';
    const trackCategory = r[2] || 'workshop';
    const rawEvents = r[3] || '';
    const leaderName = r[4] || '';
    const leaderEmail = r[5] || '';
    const leaderMobile = r[6] || '';
    const collegeName = r[7] || '';
    const department = r[8] || '';
    const year = r[9] || '';
    const teamSize = parseInt(r[10] || '1', 10) || 1;
    const member2 = r[11] || 'N/A';
    const member3 = r[12] || 'N/A';
    const member4 = r[13] || 'N/A';
    const totalFee = parseFloat(r[14]) || (trackCategory.toLowerCase().includes('workshop') ? 300 : 500);
    const paymentMethod = r[15] || 'upi';
    const paymentStatus = (r[16] || 'PAID').toLowerCase() === 'paid' ? 'paid' : 'pending_verification';
    const paymentRef = r[17] || 'N/A';
    const paymentProof = r[18] && r[18] !== 'N/A' && r[18] !== 'HAS_PROOF' ? r[18].trim() : 'N/A';
    const attendanceStatus = (r[19] || 'Absent').trim();
    const lastUpdated = r[20] || rawTimestamp;

    const createdAt = formatIsoTimestamp(rawTimestamp);
    const updatedAt = formatIsoTimestamp(lastUpdated);

    const eventList = parseStandardEventsFromText(rawEvents);
    const standardEventStr = eventList.join(', ');

    result.push({
      id: regCode,
      registration_code: regCode,
      created_at: createdAt,
      registration_type: trackCategory.toLowerCase().includes('workshop') ? 'workshop' : 'technical',
      registered_events: standardEventStr || rawEvents,
      registration_events: standardEventStr || rawEvents,
      team_leader_name: leaderName,
      team_leader_email: leaderEmail,
      team_leader_phone: leaderMobile,
      college_name: collegeName,
      department: department,
      year_of_study: year,
      total_participants: teamSize,
      team_size: teamSize,
      member_2_details: member2,
      member_3_details: member3,
      member_4_details: member4,
      total_amount: totalFee,
      payment_method: paymentMethod.toLowerCase(),
      payment_status: paymentStatus,
      payment_reference: paymentRef,
      payment_id: paymentRef,
      upi_reference: paymentRef,
      payment_proof_url: paymentProof,
      attendance_status: attendanceStatus,
      attendance_marked: attendanceStatus.toLowerCase() === 'present',
      updated_at: updatedAt,
      currency: 'INR',
    });
  }

  cachedRows = result;
  return result;
}

export function reloadCsvRegistrations(): CsvRegistrationRow[] {
  cachedRows = null;
  return loadCsvRegistrations();
}

export function handleRegistrationsPostgrest(
  urlStr: string,
  method: string = 'GET',
  headersInit?: HeadersInit
): { handled: boolean; status: number; headers: Record<string, string>; body: any } {
  try {
    const url = new URL(urlStr, 'https://iimyaytfrtydozwrgksu.supabase.co');
    if (!url.pathname.includes('/rest/v1/registrations')) {
      return { handled: false, status: 404, headers: {}, body: null };
    }

    const rows = loadCsvRegistrations();
    let filtered = [...rows];

    let preferCount = false;
    let head = method.toUpperCase() === 'HEAD';

    if (headersInit) {
      let preferHeader = '';
      if (typeof headersInit === 'object' && headersInit !== null) {
        if ('get' in headersInit && typeof (headersInit as any).get === 'function') {
          preferHeader = (headersInit as any).get('prefer') || (headersInit as any).get('Prefer') || '';
        } else {
          preferHeader = (headersInit as any)['prefer'] || (headersInit as any)['Prefer'] || '';
        }
      }
      if (preferHeader.includes('count=exact') || preferHeader.includes('count=')) {
        preferCount = true;
      }
    }

    const select = url.searchParams.get('select');
    if (url.searchParams.get('head') === 'true') {
      head = true;
      preferCount = true;
    }

    const eventEq = url.searchParams.get('registration_events') || url.searchParams.get('registered_events');
    if (eventEq) {
      const cleanEq = eventEq.replace(/^eq\./i, '').trim().toLowerCase();
      filtered = filtered.filter(r => {
        const evs = parseStandardEventsFromText(r.registration_events);
        return evs.some(e => e.toLowerCase() === cleanEq || cleanEq.includes(e.toLowerCase()) || e.toLowerCase().includes(cleanEq));
      });
    }

    const codeEq = url.searchParams.get('registration_code') || url.searchParams.get('id');
    if (codeEq) {
      const cleanCode = codeEq.replace(/^eq\./i, '').trim().toUpperCase();
      filtered = filtered.filter(r => r.registration_code.toUpperCase() === cleanCode || r.id.toUpperCase() === cleanCode);
    }

    const statusEq = url.searchParams.get('payment_status');
    if (statusEq) {
      const cleanStatus = statusEq.replace(/^eq\./i, '').trim().toLowerCase();
      filtered = filtered.filter(r => r.payment_status.toLowerCase() === cleanStatus);
    }

    const typeEq = url.searchParams.get('registration_type');
    if (typeEq) {
      const cleanType = typeEq.replace(/^eq\./i, '').trim().toLowerCase();
      filtered = filtered.filter(r => r.registration_type.toLowerCase() === cleanType);
    }

    const totalCount = filtered.length;
    let resultData: any[] = filtered;

    if (select && select !== '*' && !select.includes('(*)')) {
      const fields = select.split(',').map(s => s.trim()).filter(Boolean);
      resultData = filtered.map(row => {
        const projected: Record<string, any> = {};
        for (const f of fields) {
          if (f in row) {
            projected[f] = (row as any)[f];
          } else if (f === 'events') {
            projected[f] = row.registration_events;
          }
        }
        return projected;
      });
    }

    const respHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Range': totalCount > 0 ? `0-${totalCount - 1}/${totalCount}` : `*/0`,
    };

    if (head) {
      return { handled: true, status: 200, headers: respHeaders, body: [] };
    }

    return { handled: true, status: 200, headers: respHeaders, body: resultData };
  } catch (err: any) {
    console.error('[HANDLE REGISTRATIONS POSTGREST ERROR]', err);
    return { handled: false, status: 500, headers: {}, body: null };
  }
}