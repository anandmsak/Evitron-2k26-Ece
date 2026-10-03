export const EVENT_CANONICAL_NAMES: Record<string, string> = {
  'silicon 2gds': 'silicon 2gds',
  'silicon 2 gds': 'silicon 2gds',
  'ws-silicon-2-gds': 'silicon 2gds',
  'silicon-2-gds': 'silicon 2gds',
  'tractron': 'tractron',
  'tracktron': 'tractron',
  'embedded system': 'embedded system',
  'embedded': 'embedded system',
  'virtual instrument': 'virtual instrument',
  'virtual instrumentation': 'virtual instrument',
  'techpaper': 'techpaper',
  'paper': 'techpaper',
  'evolvex': 'evolvex',
  'detective 404': 'detective 404',
  'detective-404': 'detective 404',
  'promptify': 'promptify',
  'prompt': 'promptify',
  'mind maze': 'mind maze',
  'mind': 'mind maze',
  'maze': 'mind maze',
  'memix': 'memix',
  'mem': 'memix',
};

export function normalizeEventName(raw: string | undefined | null): string {
  const lower = String(raw || '').toLowerCase().trim();
  return EVENT_CANONICAL_NAMES[lower] || lower;
}
