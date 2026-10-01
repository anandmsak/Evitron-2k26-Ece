// src/utils/eventShortNames.ts

/**
 * Returns clean short event names without lengthy descriptions or taglines:
 * - techpaper
 * - tractron
 * - evolvex
 * - silicon 2gds
 * - Embedded System
 * - Virtual instrument
 * - mind maze
 * - promptify
 * - memix
 * - detective 404
 */
export function getShortEventName(raw: string | undefined | null): string {
  if (!raw) return '';
  const s = String(raw).toLowerCase().trim();

  // Direct UUID and ID mappings
  if (s === '4e91a80e-4baa-4fc2-bf6c-7f95e135fc80' || s === 'silicon-2-gds' || s === 'ws-silicon-2-gds') return 'silicon 2gds';
  if (s === 'd6699fda-e9a5-404d-88e8-bd9e0610988e' || s === 'embedded-system' || s === 'ws-embedded-system') return 'Embedded System';
  if (s === 'ee27539a-2318-44da-9697-bb859ed57a50' || s === 'virtual-instrumentation' || s === 'ws-virtual-instrumentation') return 'Virtual instrument';
  if (s === '46aa179c-ec4a-4d8d-a206-7c4c497a95ce' || s === 'techpaper' || s === 'tech-techpaper') return 'techpaper';
  if (s === 'c2a1bbfc-85fb-49f9-9d9d-39759b6df37f' || s === 'evolvex' || s === 'tech-evolvex') return 'evolvex';
  if (s === '626a494c-0e71-4679-abad-9d5a4d5758e2' || s === 'tracktron' || s === 'tech-tracktron') return 'tractron';
  if (s === '8ebc96bf-893d-4e6b-8976-6f541f2631ff' || s === 'mind-maze' || s === 'non-mind-maze') return 'mind maze';
  if (s === '41b7298f-6401-4409-a000-5cc406e194b8' || s === 'promptify' || s === 'non-promptify') return 'promptify';
  if (s === '0dcd0759-87af-4bce-9757-5e52833c538b' || s === 'memix' || s === 'non-memix') return 'memix';
  if (s === '57d56f8c-99c4-4e78-bb57-4c7a6ec47716' || s === 'detective-404' || s === 'non-detective-404') return 'detective 404';

  if (s.includes('silicon') || s.includes('gds') || s.includes('cadence') || s.includes('vlsi')) {
    return 'silicon 2gds';
  }
  if (s.includes('virtual') || s.includes('labview') || s.includes('instrument')) {
    return 'Virtual instrument';
  }
  if (s.includes('embedded') || s.includes('microcontroller') || s.includes('arm')) {
    return 'Embedded System';
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
    .trim();
}
