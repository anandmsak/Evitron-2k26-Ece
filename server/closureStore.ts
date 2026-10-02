import fs from 'fs';
import path from 'path';
import { supabaseAdmin, isSupabaseConfigured } from './supabase.js';
import { isEventClosedStrict } from '../src/utils/closureUtils.js';
import type { EventItem } from '../src/types.js';

export const CLOSURE_KEY = 'closedWorkshops';
const SETTINGS_FILE = path.resolve(process.cwd(), 'data', 'site_settings.json');
const DB_FILE = path.resolve(process.cwd(), 'data', 'symposium_db.json');

function normalize(list: unknown): string[] {
  if (!Array.isArray(list)) throw new Error('closedWorkshops is not an array');
  return Array.from(new Set(list.map((v) => String(v).trim()).filter(Boolean)));
}

function readJson(file: string): any | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')); // corrupt file -> throws -> fail closed
}

function readFromDisk(): string[] | null {
  const primary = readJson(SETTINGS_FILE);
  if (primary && Array.isArray(primary[CLOSURE_KEY])) return normalize(primary[CLOSURE_KEY]);
  const db = readJson(DB_FILE);
  if (db?.settings && Array.isArray(db.settings[CLOSURE_KEY])) return normalize(db.settings[CLOSURE_KEY]);
  return null;
}

function writeToDisk(list: string[]): { wrote: number; errors: string[] } {
  let wrote = 0;
  const errors: string[] = [];
  for (const file of [SETTINGS_FILE, DB_FILE]) {
    try {
      const isDb = file === DB_FILE;
      if (!fs.existsSync(file)) {
        if (isDb) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
      }
      const json = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
      if (isDb) json.settings = { ...(json.settings || {}), [CLOSURE_KEY]: list };
      else json[CLOSURE_KEY] = list;
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(json, null, 2), 'utf8');
      fs.renameSync(tmp, file);
      wrote++;
    } catch (e: any) {
      errors.push(`${path.basename(file)}: ${e?.message || e}`);
    }
  }
  return { wrote, errors };
}

async function readFromDb(): Promise<string[] | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('key', CLOSURE_KEY)
      .maybeSingle();
    if (error) {
      console.warn(`[CLOSURE] DB read warning: ${error.message}`);
      return null;
    }
    if (!data) return null;
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return normalize(v);
  } catch (err: any) {
    console.warn(`[CLOSURE] DB read exception: ${err?.message || err}`);
    return null;
  }
}

async function writeToDb(list: string[]): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('site_settings')
      .upsert(
        [{ key: CLOSURE_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() }],
        { onConflict: 'key' }
      );
    if (error) {
      if (!error.message.includes('row-level security')) {
        console.warn(`[CLOSURE] DB write notice: ${error.message}`);
      }
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[CLOSURE] DB write exception: ${err?.message || err}`);
    return false;
  }
}

/** Always hits the durable store. Throws if state cannot be determined (callers must fail closed). */
export async function readClosedWorkshops(): Promise<string[]> {
  if (isSupabaseConfigured()) {
    try {
      const fromDb = await readFromDb();
      if (fromDb && fromDb.length > 0) return fromDb;
    } catch {}
  }
  return readFromDisk() ?? [];
}

let lock: Promise<unknown> = Promise.resolve();

function mutate(fn: (current: string[]) => string[]): Promise<string[]> {
  const run = lock.then(async () => {
    const current = await readClosedWorkshops();
    const next = normalize(fn(current));

    let dbWrote = false;
    if (isSupabaseConfigured()) {
      dbWrote = await writeToDb(next);
      if (dbWrote) {
        try {
          const check = await readFromDb();
          if (!check || JSON.stringify(check) !== JSON.stringify(next)) {
            console.warn('[CLOSURE] DB state check mismatch after write');
          }
        } catch {}
      }
    }

    // Always mirror to disk
    const { wrote, errors } = writeToDisk(next);
    if (wrote === 0 && !dbWrote) {
      throw new Error(`Closure state could not be persisted: ${errors.join(' | ')}`);
    }

    const checkDisk = readFromDisk();
    if (!dbWrote && checkDisk && JSON.stringify(checkDisk) !== JSON.stringify(next)) {
      throw new Error('Closure disk verification failed.');
    }

    return next;
  });
  lock = run.catch(() => undefined);
  return run;
}

export const closeWorkshops = (keys: string[]) => mutate((cur) => [...cur, ...keys]);

export const openWorkshops = (keys: string[], events: EventItem[]) =>
  mutate((cur) => cur.filter((id) => !keys.includes(id) && !isEventClosedStrict(id, keys, events)));
