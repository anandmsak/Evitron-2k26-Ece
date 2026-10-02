import { createClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as any)?.env || {};

const rawUrl =
  metaEnv.VITE_SUPABASE_URL ||
  metaEnv.NEXT_PUBLIC_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL : undefined) ||
  'https://iimyaytfrtydozwrgksu.supabase.co';

export function sanitizeSupabaseUrl(url?: string): string {
  if (!url || !url.trim()) return 'https://iimyaytfrtydozwrgksu.supabase.co';
  let cleaned = url.trim().replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/rest\/v1\/?.*$/i, '');
  return cleaned || 'https://iimyaytfrtydozwrgksu.supabase.co';
}

export const supabaseUrl = sanitizeSupabaseUrl(rawUrl);

export const supabaseAnonKey =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  metaEnv.SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SECRET_KEY : undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbXlheXRmcnR5ZG96d3Jna3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxOTk4NjQsImV4cCI6MjEwNDc3NTg2NH0.Of3xlCbXyhS_-kuVXcg_OrpMHHNutrAmD3dWYiz6OLY';

// Client-side & Test-compatible Fetch Handler (Strips 'apikey' header so Google Cloud ESP/Gateway doesn't trigger 403 "unregistered API key")
const customFetch: typeof fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

  const headers = new Headers(init?.headers || (typeof input === 'object' && 'headers' in input ? (input as Request).headers : {}));
  // Strip any 'apikey' header so Google Cloud ESP / Cloud Run proxy does NOT interpret it as an unregistered GCP API Key
  headers.delete('apikey');
  headers.delete('ApiKey');
  headers.delete('APIKEY');

  // In Node.js server test environment
  if (typeof window === 'undefined') {
    const key = (typeof process !== 'undefined' && process.env?.SUPABASE_SECRET_KEY) ? process.env.SUPABASE_SECRET_KEY : supabaseAnonKey;
    headers.set('Authorization', `Bearer ${key}`);
    return fetch(input, { ...init, headers });
  }

  // In Browser environment: Proxy through /api/supabase-proxy to bypass RLS 0-count issue
  if (typeof window !== 'undefined' && urlStr.includes('/rest/v1/')) {
    const proxyUrl = urlStr.replace(supabaseUrl, '/api/supabase-proxy');
    return fetch(proxyUrl, { ...init, headers });
  }

  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: customFetch,
  },
});

export async function testFrontendSupabaseQuery() {
  try {
    const { data, count, error } = await supabase
      .from('registrations')
      .select('*', { count: 'exact' });

    if (error) {
      console.warn('[FRONTEND SUPABASE QUERY WARN]', error.message);
      return { success: false, error: error.message, data: [], count: 0 };
    }

    return { success: true, data: data || [], count: count ?? (data?.length || 0) };
  } catch (err: any) {
    console.warn('[FRONTEND SUPABASE QUERY EXCEPTION]', err?.message || err);
    return { success: false, error: err?.message || String(err), data: [], count: 0 };
  }
}
