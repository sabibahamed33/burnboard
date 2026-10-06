import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/stats — authentic public platform stats (MP23)
 *
 * Serves REAL aggregate numbers only (no fabricated social proof anywhere):
 * visible content + community counts, plus today's / 7-day roasts.
 * Aggregate-only — no user-level rows ever leave this endpoint.
 *
 * Cache: 60s public — cheap to hit from the /stats page and safe to serve
 * from the edge.
 */

// Never prerender: stats must reflect live data (CDN caching still applies
// via the response Cache-Control header).
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// Exact-count head query (never fetches rows). Returns null on error.
async function count(client, table, filters = []) {
  let query = client.from(table).select('id', { count: 'exact', head: true });
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { count: n, error } = await query;
  return error ? null : (n || 0);
}

// Exact-count with a created_at lower bound. Returns null on error.
async function countSince(client, table, sinceIso, filters = []) {
  let query = client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceIso);
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { count: n, error } = await query;
  return error ? null : (n || 0);
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ configured: false, stats: null }, { status: 503 });
  }

  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Visible content only — the same moderation rules that govern public feeds.
  const [
    roasts, roastsToday, roasts7d, hotSeats, profiles,
    communities, battles, challenges, posts, members,
  ] = await Promise.all([
    count(supabase, 'roasts', [['is_hidden', false]]),
    countSince(supabase, 'roasts', todayStart, [['is_hidden', false]]),
    countSince(supabase, 'roasts', sevenDaysAgo, [['is_hidden', false]]),
    count(supabase, 'hot_seats'),
    count(supabase, 'profiles'),
    count(supabase, 'communities'),
    count(supabase, 'battles'),
    count(supabase, 'challenges'),
    count(supabase, 'social_posts'),
    count(supabase, 'user_profiles'),
  ]);

  const stats = {
    roasts,
    roastsToday,
    roasts7d,
    hotSeats,
    profiles,
    communities,
    battles,
    challenges,
    posts,
    members,
  };

  return NextResponse.json(
    { configured: true, generatedAt: new Date().toISOString(), stats },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}