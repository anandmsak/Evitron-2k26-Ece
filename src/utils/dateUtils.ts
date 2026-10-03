export function safeParseRegistrationDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? new Date() : val;
  }

  const str = String(val).trim();
  if (!str) return new Date();

  // If ISO 8601 string or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
      let [, yStr, mStr, dStr, hStr = '00', minStr = '00', sStr = '00'] = isoMatch;
      let year = parseInt(yStr, 10);
      let month = parseInt(mStr, 10);
      let day = parseInt(dStr, 10);

      // Fix inverted March vs October dates for 2026 EVITRON registrations
      if (year === 2026 && month === 3 && (day === 10 || day === 2 || day === 3 || day === 1 || day === 4)) {
        month = 10;
        day = day === 10 ? 3 : day;
      }

      return new Date(
        Date.UTC(
          year,
          month - 1,
          day,
          parseInt(hStr, 10),
          parseInt(minStr, 10),
          parseInt(sStr, 10)
        )
      );
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
 
  // Handle DD/MM/YYYY or MM/DD/YYYY slash/dash patterns (e.g. "10/03/2026", "03/10/2026", "3/10/2026", "10/3/2026")
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:,\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?)?/i);
  if (match) {
    let [, p1, p2, yStr, hStr = '0', minStr = '0', sStr = '0', ampm] = match;
    let n1 = parseInt(p1, 10);
    let n2 = parseInt(p2, 10);
    let year = parseInt(yStr, 10);
    let hours = parseInt(hStr, 10);
    let minutes = parseInt(minStr, 10);
    let seconds = parseInt(sStr, 10);

    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
    }

    let month = 10;
    let day = 3;

    if (year === 2026) {
      // In EVITRON 2K26 symposium context, registrations occur in October (Month 10)
      if (n1 === 10 || n2 === 10) {
        month = 10;
        day = n1 === 10 ? n2 : n1;
      } else if (n1 === 9 || n2 === 9) {
        month = 9;
        day = n1 === 9 ? n2 : n1;
      } else if (n1 === 3 || n2 === 3) {
        month = 10;
        day = n1 === 3 ? n2 : n1;
      } else {
        month = Math.min(n1, n2) > 0 && Math.min(n1, n2) <= 12 ? Math.min(n1, n2) : 10;
        day = Math.max(n1, n2);
      }
    } else {
      month = n2;
      day = n1;
    }

    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function formatDisplayDate(val: any): string {
  const d = safeParseRegistrationDate(val);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function formatDisplayTime(val: any): string {
  const d = safeParseRegistrationDate(val);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export function formatIsoTimestamp(val: any): string {
  const d = safeParseRegistrationDate(val);
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
}

export function normalizeStandardEventName(raw: string | undefined | null): string {
  const lower = String(raw || '').toLowerCase().trim();
  if (lower.includes('silicon') || lower.includes('2gds') || lower.includes('2 gds')) return 'silicon 2 gds';
  if (lower.includes('tractron') || lower.includes('tracktron')) return 'tractron';
  if (lower.includes('embedded')) return 'embedded system';
  if (lower.includes('virtual') || lower.includes('instrument')) return 'virtual instrument';
  if (lower.includes('techpaper') || lower.includes('paper presentation') || lower.includes('paper')) return 'techpaper';
  if (lower.includes('evolvex') || lower.includes('project')) return 'evolvex';
  if (lower.includes('detective') || lower.includes('404')) return 'detective 404';
  if (lower.includes('prompt')) return 'promptify';
  if (lower.includes('mind') || lower.includes('maze')) return 'mind maze';
  if (lower.includes('mem')) return 'memix';
  return lower;
}
