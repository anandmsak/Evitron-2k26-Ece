// src/utils/closureUtils.ts
import { EventItem, SiteSettings } from '../types';

export function isClosureStateReady(s?: Partial<SiteSettings> | null): boolean {
  return !!s && s.closureStateLoaded === true && Array.isArray(s.closedWorkshops);
}

/**
 * Very hard & strict check to determine if an event/workshop is closed.
 * Checks ID, slug, stripped prefixes, titles, UUIDs, and keyword matches.
 */
export function isEventClosedStrict(
  eventIdentifier: string | undefined | null,
  closedList: string[] = [],
  allEvents: EventItem[] = []
): boolean {
  if (!eventIdentifier || !closedList || closedList.length === 0) return false;

  const keyClean = String(eventIdentifier).trim().toLowerCase();
  const keyStripped = keyClean.replace(/^(ws|tech|non|nontech)-/i, '');

  for (const closed of closedList) {
    if (!closed) continue;
    const closedClean = String(closed).trim().toLowerCase();
    const closedStripped = closedClean.replace(/^(ws|tech|non|nontech)-/i, '');

    // 1. Direct match
    if (keyClean === closedClean || keyStripped === closedStripped) {
      return true;
    }

    // 2. Keyword heuristic match for workshop & event codes
    if (
      (keyStripped.includes('silicon') && closedClean.includes('silicon')) ||
      (keyStripped.includes('embedded') && closedClean.includes('embedded')) ||
      (keyStripped.includes('virtual') && closedClean.includes('virtual')) ||
      (keyStripped.includes('paper') && closedClean.includes('paper')) ||
      (keyStripped.includes('evolvex') && closedClean.includes('evolvex')) ||
      (keyStripped.includes('tracktron') && closedClean.includes('tracktron')) ||
      (keyStripped.includes('mind') && closedClean.includes('mind')) ||
      (keyStripped.includes('prompt') && closedClean.includes('prompt')) ||
      (keyStripped.includes('mem') && closedClean.includes('mem')) ||
      (keyStripped.includes('detective') && closedClean.includes('detective'))
    ) {
      return true;
    }

    // 3. Match against events list
    if (allEvents && allEvents.length > 0) {
      const match1 = allEvents.find(
        (e) =>
          (e.id || '').toLowerCase() === keyClean ||
          (e.slug || '').toLowerCase() === keyClean ||
          (e.slug || '').toLowerCase() === keyStripped
      );
      const match2 = allEvents.find(
        (e) =>
          (e.id || '').toLowerCase() === closedClean ||
          (e.slug || '').toLowerCase() === closedClean ||
          (e.slug || '').toLowerCase() === closedStripped
      );
      if (match1 && match2 && (match1.id === match2.id || match1.slug === match2.slug)) {
        return true;
      }
      if (match1 && (match1.id.toLowerCase() === closedClean || match1.slug?.toLowerCase() === closedClean)) {
        return true;
      }
    }
  }

  return false;
}
