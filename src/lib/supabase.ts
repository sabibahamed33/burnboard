import { createClient } from '@supabase/supabase-js';

// In Next.js App Router, env vars are accessed via process.env.NEXT_PUBLIC_*
// import.meta.env is Vite-only and does NOT work in Next.js
// Supabase migrated from legacy anon JWT keys to `sb_publishable_*` keys.
// Accept both names so `.env.local` / Vercel may set either one.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
