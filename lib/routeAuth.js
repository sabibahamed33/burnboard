/**
 * BURNBOARD — Route-level authentication helper
 *
 * Resolves the authenticated Supabase user for API route handlers by reading
 * the session from the request cookies, using @supabase/ssr (same pattern as
 * lib/supabase/server.js and middleware.ts).
 *
 * getRequestClient(req) returns a request-scoped SSR client whose requests
 * carry the user's JWT, so RLS policies like `auth.uid() = user_id` evaluate
 * correctly for authenticated writes.
 */

import { createServerClient } from '@supabase/ssr';

function parseCookies(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const cookieMap = {};
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name) {
      try {
        cookieMap[name] = decodeURIComponent(value);
      } catch {
        cookieMap[name] = value;
      }
    }
  }
  return cookieMap;
}

function buildRequestClient(req) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const cookieMap = parseCookies(req);

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return Object.entries(cookieMap).map(([name, value]) => ({ name, value }));
      },
      setAll() {
        // Read-only: API routes never need to set cookies.
      },
    },
  });
}

/**
 * Get the authenticated user id from the request, or null.
 */
export async function getAuthUserId(req) {
  try {
    const supabase = buildRequestClient(req);
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch (err) {
    console.error('[RouteAuth] Error:', err);
    return null;
  }
}

/**
 * Get a request-scoped SSR client plus the authenticated user id.
 * Returns { client, userId } (client may be null if Supabase is unconfigured).
 */
export async function getRequestContext(req) {
  try {
    const client = buildRequestClient(req);
    if (!client) return { client: null, userId: null };

    const { data: { user } } = await client.auth.getUser();
    return { client, userId: user?.id || null };
  } catch (err) {
    console.error('[RouteAuth] Error:', err);
    return { client: null, userId: null };
  }
}