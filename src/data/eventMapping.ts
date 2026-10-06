export const EVENT_CANONICAL_NAMES: Record<string, string> = {
  // WORKSHOPS
  'silicon 2gds': 'silicon 2 gds',
  'silicon 2 gds': 'silicon 2 gds',
  'ws-silicon-2-gds': 'silicon 2 gds',
  'silicon-2-gds': 'silicon 2 gds',
  '4e91a80e-4baa-4fc2-bf6c-7f95e135fc80': 'silicon 2 gds',

  'embedded system': 'embedded system',
  'embedded-system': 'embedded system',
  'ws-embedded-system': 'embedded system',
  'embedded': 'embedded system',
  'd6699fda-e9a5-404d-88e8-bd9e0610988e': 'embedded system',

  'virtual instrument': 'virtual instrument',
  'virtual-instrument': 'virtual instrument',
  'virtual instrumentation': 'virtual instrument',
  'virtual-instrumentation': 'virtual instrument',
  'ws-virtual-instrumentation': 'virtual instrument',
  'ee27539a-2318-44da-9697-bb859ed57a50': 'virtual instrument',

  // TECHNICAL EVENTS
  'techpaper': 'techpaper',
  'tech-techpaper': 'techpaper',
  'paper': 'techpaper',
  '46aa179c-ec4a-4d8d-a206-7c4c497a95ce': 'techpaper',

  'evolvex': 'evolvex',
  'tech-evolvex': 'evolvex',
  'project': 'evolvex',
  'c2a1bbfc-85fb-49f9-9d9d-39759b6df37f': 'evolvex',

  'tractron': 'tracktron',
  'tracktron': 'tracktron',
  'tech-tractron': 'tracktron',
  'tech-tracktron': 'tracktron',
  '626a494c-0e71-4679-abad-9d5a4d5758e2': 'tracktron',

  // NON-TECHNICAL EVENTS
  'mind maze': 'mind maze',
  'mind-maze': 'mind maze',
  'non-mind-maze': 'mind maze',
  'mind': 'mind maze',
  'maze': 'mind maze',
  '8ebc96bf-893d-4e6b-8976-6f541f2631ff': 'mind maze',

  'promptify': 'promptify',
  'non-promptify': 'promptify',
  'prompt': 'promptify',
  '41b7298f-6401-4409-a000-5cc406e194b8': 'promptify',

  'memix': 'memix',
  'non-memix': 'memix',
  'mem': 'memix',
  'meme': 'memix',
  '0dcd0759-87af-4bce-9757-5e52833c538b': 'memix',

  'detective 404': 'detective 404',
  'detective-404': 'detective 404',
  'non-detective-404': 'detective 404',
  'detective': 'detective 404',
  '404': 'detective 404',
  '57d56f8c-99c4-4e78-bb57-4c7a6ec47716': 'detective 404',
};

export function normalizeEventName(raw: string | undefined | null): string {
  if (!raw) return '';
  const clean = String(raw).toLowerCase().trim();
  if (EVENT_CANONICAL_NAMES[clean]) {
    return EVENT_CANONICAL_NAMES[clean];
  }

  const stripped = clean
    .replace(/^(ws|tech|non|nontech)[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (EVENT_CANONICAL_NAMES[stripped]) {
    return EVENT_CANONICAL_NAMES[stripped];
  }

  if (stripped.includes('silicon') || stripped.includes('2gds') || stripped.includes('vlsi') || stripped.includes('cadence')) {
    return 'silicon 2 gds';
  }
  if (stripped.includes('embedded') || stripped.includes('microcontroller')) {
    return 'embedded system';
  }
  if (stripped.includes('virtual') || stripped.includes('instrument') || stripped.includes('labview')) {
    return 'virtual instrument';
  }
  if (stripped.includes('paper') || stripped.includes('techpaper')) {
    return 'techpaper';
  }
  if (stripped.includes('evolvex')) {
    return 'evolvex';
  }
  if (stripped.includes('tractron') || stripped.includes('tracktron') || stripped.includes('robot')) {
    return 'tracktron';
  }
  if (stripped.includes('mind') || stripped.includes('maze')) {
    return 'mind maze';
  }
  if (stripped.includes('prompt')) {
    return 'promptify';
  }
  if (stripped.includes('mem')) {
    return 'memix';
  }
  if (stripped.includes('detective') || stripped.includes('404')) {
    return 'detective 404';
  }

  return stripped;
}

