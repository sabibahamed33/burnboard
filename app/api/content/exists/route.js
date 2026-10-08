import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { instrumentHandler } from '@/lib/metrics';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET /api/content/exists?type=social_post|roast|hot_seat|comment|community|challenge|battle&id=...
 *
 * Public existence check using the SAME RLS-scoped reads as the destination
 * pages. Private/removed/moderated content the viewer cannot see returns
 * { exists: false } — identical to what the destination renders. Used by
 * the Activity Center to tombstone notifications pointing at gone content
 * instead of leaving broken links.
 */
const READERS = {
  social_post: (db, id) => db.from('social_posts').select('id').eq('id', id).maybeSingle(),
  roast: (db, id) => db.from('roasts').select('id').eq('id', id).eq('is_hidden', false).maybeSingle(),
  hot_seat: (db, id) => db.from('hot_seats').select('id').eq('id', id).eq('moderation_state', 'visible').maybeSingle(),
  comment: (db, id) => db.from('comments').select('id').eq('id', id).eq('moderation_state', 'visible').maybeSingle(),
  community: (db, id) => db.from('communities').select('id').eq('id', id).eq('visibility', 'public').eq('status', 'active').maybeSingle(),
  challenge: (db, id) => db.from('challenges').select('id').eq('id', id).eq('visibility', 'public').neq('status', 'cancelled').maybeSingle(),
  battle: (db, id) => db.from('battles').select('id').eq('id', id).maybeSingle(),
};

async function getHandler(req) {
  try {
    const anon = getSupabase();
    if (!anon) {
      return NextResponse.json({ exists: false }, { status: 503 });
    }

    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'content_exists'), RATE_LIMITS.API_READ);
    if (ipLimit.blocked) {
      return NextResponse.json({ exists: false }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') || '').toLowerCase();
    const id = (searchParams.get('id') || '').slice(0, 120);
    const reader = READERS[type];
    if (!reader || !id) {
      return NextResponse.json({ exists: false }, { status: 400 });
    }

    // Session client when signed in (sees own + followers content, exactly
    // like the destination page); anon otherwise.
    const { client: sessionClient } = await getRequestContext(req);
    const db = sessionClient || anon;
    try {
      const { data } = await reader(db, id);
      return NextResponse.json({ exists: !!data });
    } catch {
      return NextResponse.json({ exists: false });
    }
  } catch {
    return NextResponse.json({ exists: false }, { status: 500 });
  }
}

export const GET = instrumentHandler('content_exists', getHandler);
