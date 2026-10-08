import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
 * GET /api/search/trending?window=now|today|week
 *
 * Real trending queries only: distinct-user velocity with a minimum
 * participant bar (a lone actor can never trend a term). Empty when quiet —
 * trends are never fabricated. PII-guarded at write time (log_search_query
 * refuses emails, phones, and @handles; 8-day retention).
 */
async function getHandler(req) {
  try {
    const anon = getSupabase();
    if (!anon) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'search_trending'), RATE_LIMITS.API_READ);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const window = (searchParams.get('window') || 'today').toLowerCase();
    if (!['now', 'today', 'week'].includes(window)) {
      return NextResponse.json({ error: 'Invalid window' }, { status: 400 });
    }

    const { data, error } = await anon.rpc('trending_searches', { p_window: window, p_limit: 10 });
    if (error || !data || data.success === false) {
      return NextResponse.json({ success: true, window, trends: [] });
    }
    return NextResponse.json({ success: true, window: data.window || window, trends: data.trends || [] });
  } catch (err) {
    return NextResponse.json({ success: true, window: 'today', trends: [] });
  }
}

export const GET = instrumentHandler('search_trending', getHandler);
