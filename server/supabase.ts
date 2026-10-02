import { createClient } from '@supabase/supabase-js';
import { handleRegistrationsPostgrest } from './liveDataset.js';

const DEFAULT_SUPABASE_URL = 'https://iimyaytfrtydozwrgksu.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbXlheXRmcnR5ZG96d3Jna3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTk4NjQsImV4cCI6MjEwNDc3NTg2NH0.Of3xlCbXyhS_-kuVXcg_OrpMHHNutrAmD3dWYiz6OLY';

export function sanitizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) return DEFAULT_SUPABASE_URL;
  let cleaned = rawUrl.trim().replace(/\/+$/, '');
  // Strip accidental /rest/v1 or similar paths
  cleaned = cleaned.replace(/\/rest\/v1\/?.*$/i, '');
  return cleaned || DEFAULT_SUPABASE_URL;
}

const rawUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

export const supabaseUrl = sanitizeSupabaseUrl(rawUrl);

export const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  DEFAULT_SUPABASE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes('placeholder') &&
    supabaseUrl.startsWith('http')
  );
}

// Custom Fetch for Supabase Admin to provide full column alignment and accurate event queries
const adminCustomFetch: typeof fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  const method = (init.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();

  // If this is a read query on registrations (select, filter, count)
  if ((method === 'GET' || method === 'HEAD') && urlStr.includes('/rest/v1/registrations')) {
    const postgrestResult = handleRegistrationsPostgrest(urlStr, method, init.headers);
    if (postgrestResult.handled) {
      return new Response(JSON.stringify(postgrestResult.body), {
        status: postgrestResult.status,
        headers: postgrestResult.headers,
      });
    }
  }

  // Pass-through to live Supabase server for all other tables or mutations (insert, update, delete)
  const headers = new Headers(init.headers || (typeof input === 'object' && 'headers' in input ? (input as Request).headers : {}));
  if (supabaseKey) {
    headers.set('apikey', supabaseKey);
    headers.set('Authorization', `Bearer ${supabaseKey}`);
  }
  return fetch(input, { ...init, headers });
};

export const supabaseAdmin = createClient(
  isSupabaseConfigured() ? supabaseUrl : DEFAULT_SUPABASE_URL,
  isSupabaseConfigured() ? supabaseKey : DEFAULT_SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: adminCustomFetch,
    },
  }
);

export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  count: number | null;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { connected: false, count: null, error: 'Supabase URL or Key not configured' };
  }

  try {
    const { count, error } = await supabaseAdmin
      .from('registrations')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[SUPABASE TEST ERROR]', error.message);
      return { connected: false, count: null, error: error.message };
    }

    console.log(`[SUPABASE TEST SUCCESS] Connected to ${supabaseUrl}. Total registrations row count: ${count}`);
    return { connected: true, count: count ?? 0 };
  } catch (err: any) {
    console.error('[SUPABASE TEST EXCEPTION]', err?.message || err);
    return { connected: false, count: null, error: err?.message || String(err) };
  }
}

export async function uploadPaymentScreenshotToSupabase(
  registrationCode: string,
  base64OrUrl: string
): Promise<string> {
  if (!base64OrUrl || !base64OrUrl.trim()) return '';
  const raw = base64OrUrl.trim();

  // If already a valid public HTTP(S) URL, return it
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  if (!isSupabaseConfigured()) {
    return raw;
  }

  try {
    const match = raw.match(/^data:(image\/[a-zA-Z0-9\+\-]+|application\/pdf);base64,(.+)$/i);
    if (!match) {
      return raw;
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    let ext = 'jpg';
    if (mimeType.includes('pdf')) ext = 'pdf';
    else if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';

    const BUCKET_NAME = 'payment-proofs';
    const filePath = `screenshots/${registrationCode}_${Date.now()}.${ext}`;

    // Ensure bucket exists with public access
    try {
      await supabaseAdmin.storage.createBucket(BUCKET_NAME, { public: true });
    } catch {}

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.warn('[SUPABASE STORAGE NOTICE] Upload warning:', uploadError.message);
      return raw;
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (publicUrlData?.publicUrl) {
      console.log(`[SUPABASE STORAGE] Screenshot successfully uploaded for ${registrationCode}: ${publicUrlData.publicUrl}`);
      return publicUrlData.publicUrl;
    }
    return raw;
  } catch (err: any) {
    console.warn('[SUPABASE STORAGE EXCEPTION]', err?.message || err);
    return raw;
  }
}

