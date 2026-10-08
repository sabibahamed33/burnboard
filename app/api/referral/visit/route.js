import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';

/**
 * GET /api/referral/visit?code=xxx
 *
 * Records a REAL referral visit for a visitor arriving on a normal page with
 * ?ref=CODE (the probe calls this only when no attribution cookie exists),
 * sets the first-party attribution cookie, and returns { tracked }.
 * Rate-capped + collision-safe inside the SECURITY DEFINER function.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ tracked: false });
  }

  // Per-IP gate in front of the SQL per-code cap (layered anti-farm).
  const ipLimit = rateLimitMiddleware(ipKey(getClientIp(request), 'referral_visit'), RATE_LIMITS.REFERRAL_VISIT);
  if (ipLimit.blocked) {
    return NextResponse.json({ tracked: false });
  }

  const { searchParams } = new URL(request.url);
  const code = (searchParams.get('code') || '').toLowerCase();
  if (!/^[a-z0-9]{6,12}$/.test(code)) {
    return NextResponse.json({ tracked: false });
  }

  let token = null;
  try {
    const { data, error } = await supabase.rpc('record_referral_visit', { p_code: code });
    if (!error && data) token = data;
  } catch {
    token = null;
  }

  const response = NextResponse.json({ tracked: !!token });
  if (token) {
    response.cookies.set('bb_ref', String(token), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}