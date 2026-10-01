import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://iimyaytfrtydozwrgksu.supabase.co';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
    supabaseSecretKey &&
    !supabaseUrl.includes('placeholder') &&
    supabaseUrl.startsWith('http')
  );
}

export const supabaseAdmin = createClient(
  isSupabaseConfigured() ? supabaseUrl : DEFAULT_SUPABASE_URL,
  isSupabaseConfigured() ? supabaseSecretKey : 'placeholder-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
