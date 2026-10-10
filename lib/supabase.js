import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';

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

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// ── Singleton SSR-compatible browser client ─────────────────────
// ROOT CAUSE FIX (signup auto-refresh loop):
// The previous singleton used `@supabase/supabase-js` createClient, which
// persists the session ONLY in localStorage and never writes the
// `sb-*-auth-token` cookies that server components/routes read via
// `@supabase/ssr` (e.g. /welcome guard, /auth/callback).
// Result: after signup the client had a session but the server saw none —
// /welcome (server) bounced to /auth, /auth (client) saw a session and
// bounced back to /welcome, forever (repeated refresh/redirect loop).
// `createBrowserClient` from `@supabase/ssr` keeps localStorage state AND
// syncs it to cookies, so client and server agree on the session.
let _browserClient = null;
let _serverAnonClient = null;

function getBrowserClient() {
  if (!isSupabaseConfigured) return null;
  // Server-side (sitemap, prerender, API public reads): use a plain anon
  // client. Cookie sync is a browser concern; server components/routes that
  // need the SESSION must use lib/supabase/server.js or lib/routeAuth.js.
  if (typeof window === 'undefined') {
    if (_serverAnonClient) return _serverAnonClient;
    _serverAnonClient = createSupabaseJsClient(supabaseUrl, supabaseAnonKey);
    return _serverAnonClient;
  }
  if (_browserClient) return _browserClient;
  _browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return _browserClient;
}

export const supabase = getBrowserClient();
