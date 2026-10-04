// src/utils/dateUtils.ts
import { normalizeEventName } from '../data/eventMapping';

export const IST_OFFSET_MIN = 330; // UTC+05:30 (India has no daylight saving time)

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function istToDate(y: number, mo: number, d: number, h: number, mi: number, s: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi, s) - IST_OFFSET_MIN * 60_000;
  const out = new Date(utc);
  return isNaN(out.getTime()) ? null : out;
}

/**
 * Normalizes inverted dates caused by Google Apps Script / US date parsers
 * turning Indian format "3/10/2026" (03 Oct 2026) into "2026-03-10" (10 Mar 2026).
 */
function fixInvertedSymposiumDate(d: Date): Date {
  if (isNaN(d.getTime())) return d;
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + 1; // 1-12
  const day = ist.getUTCDate();
  const h = ist.getUTCHours();
  const min = ist.getUTCMinutes();
  const s = ist.getUTCSeconds();

  // EVITRON 2K26 is held in Sep/Oct 2026. Any March 2026 date is an inverted October registration.
  if (y === 2026 && m === 3) {
    if (day === 10 || day === 9) {
      // "3/10/2026" (3rd October) was parsed as Month 3, Day 10
      const correctedUtc = Date.UTC(2026, 9, 3, h, min, s) - IST_OFFSET_MIN * 60_000;
      return new Date(correctedUtc);
    }
    if (day === 2 || day === 1) {
      const correctedUtc = Date.UTC(2026, 9, day, h, min, s) - IST_OFFSET_MIN * 60_000;
      return new Date(correctedUtc);
    }
  }
  return d;
}

/**
 * Parse registration timestamps strictly into a UTC Date object.
 * Returns a valid Date, or a fallback Invalid Date if unparseable.
 */
export function safeParseRegistrationDate(raw: unknown): Date {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? new Date(NaN) : fixInvertedSymposiumDate(raw);
  if (typeof raw !== 'string' && typeof raw !== 'number') return new Date(NaN);
  const s = String(raw).trim();
  if (!s) return new Date(NaN);

  // 1. Indian locale Sheets / CSV: "D/M/YYYY[, h:mm[:ss] [AM|PM]]" -> strictly Day-first, IST
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
  if (m) {
    let h = +(m[4] ?? 0);
    const ap = m[7]?.toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    // Strictly day = m[1], month = m[2], year = m[3]
    const parsed = istToDate(+m[3], +m[2], +m[1], h, +(m[5] ?? 0), +(m[6] ?? 0));
    if (parsed) return fixInvertedSymposiumDate(parsed);
  }

  // 2. ISO 8601 with explicit zone (e.g. Supabase timestamptz "2026-10-03T15:00:00Z" or "+05:30")
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(NaN) : fixInvertedSymposiumDate(d);
  }

  // 3. ISO format without zone ("YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss") -> treat as IST
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const parsed = istToDate(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    if (parsed) return fixInvertedSymposiumDate(parsed);
  }

  // 4. Standard Date fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(NaN) : fixInvertedSymposiumDate(d);
}

/**
 * Format any instant as standard ISO string "YYYY-MM-DD HH:mm:ss" in IST (24h, no AM/PM drift).
 */
export function formatIsoTimestamp(input: Date | string | number | unknown): string {
  if (!input) return '';
  const d = input instanceof Date ? input : safeParseRegistrationDate(input);
  if (isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return (
    `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`
  );
}

/**
 * Display date in IST: "03 Oct 2026"
 */
export function formatDisplayDate(val: any): string {
  const d = safeParseRegistrationDate(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Display time in 24h IST: "14:30"
 */
export function formatDisplayTime(val: any): string {
  const d = safeParseRegistrationDate(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Kolkata',
  });
}

export function normalizeStandardEventName(raw: string | undefined | null): string {
  return normalizeEventName(raw);
}
