import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { recordGrowthEvent } from '@/lib/experimentService';

/**
 * GET /api/referral (authenticated)
 *
 * Returns the viewer's durable invite code (+ shareable link), creating the
 * opaque code on first request (server-side, collision-safe, owner-scoped).
 */
export async function GET(request) {
  const { client, userId } = await getRequestContext(request);
  if (!client || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const codeLimit = rateLimitMiddleware(ipKey(userId, 'invite_code'), RATE_LIMITS.INVITE_CODE);
  if (codeLimit.blocked) {
    return NextResponse.json({ error: codeLimit.response.error }, { status: 429 });
  }

  try {
    // Detect first-ever code creation so invite_created fires exactly once
    // per user (server-side, never client-claimed).
    let isNew = false;
    try {
      const { data: existing } = await client
        .from('referral_codes')
        .select('code')
        .eq('user_id', userId)
        .eq('active', true)
        .maybeSingle();
      isNew = !existing;
    } catch {}
    const { data, error } = await client.rpc('create_referral_code', { p_user: userId });
    if (error || !data) {
      return NextResponse.json({ error: 'Referral code unavailable' }, { status: 500 });
    }
    if (isNew) {
      recordGrowthEvent('invite_created', userId, {}).catch(() => {});
    }
    return NextResponse.json({
      code: data,
      inviteUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://burnboard.app'}/s/${data}`,
    });
  } catch (err) {
    console.error('[Referral] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}