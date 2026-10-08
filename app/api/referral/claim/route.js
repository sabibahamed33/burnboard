import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';

/**
 * POST /api/referral/claim (authenticated)
 *
 * Called after a REAL signup/sign-in when the first-party referral cookie is
 * present. Claims the conversion (idempotent, self-referral-proof, token
 * forgery-proof inside the SECURITY DEFINER function) and clears the cookie.
 * Returns the referrer code so future rewards can be attached — rewards are
 * deliberately NOT granted yet.
 */
export async function POST(req) {
  const { client, userId } = await getRequestContext(req);
  if (!client || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  let token = null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== 'bb_ref') continue;
    const value = part.slice(eq + 1).trim();
    try { token = decodeURIComponent(value); } catch { token = value; }
  }

  const response = NextResponse.json({ converted: false, referrerCode: null });
  response.cookies.set('bb_ref', '', { path: '/', maxAge: 0 });

  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return response; // No legitimate token → nothing to claim.
  }

  // Claim attempts are abuse-sensitive (farming): per-user hourly cap.
  const claimLimit = rateLimitMiddleware(ipKey(userId, 'referral_claim'), RATE_LIMITS.REFERRAL_CLAIM);
  if (claimLimit.blocked) {
    return response;
  }

  try {
    const { data, error } = await client.rpc('claim_referral_by_token', {
      p_token: token,
      p_user: userId,
    });
    if (!error && data) {
      return NextResponse.json({ converted: true, referrerCode: data });
    }
  } catch {
    // Silent — attribution is best-effort and never blocks auth.
  }
  return response;
}