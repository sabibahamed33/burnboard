/**
 * BURN BOARD — Safety Report API (Master Prompt 11)
 *
 * POST /api/safety/report - Submit a report (creates a real record)
 *
 * Body:
 *   targetType: 'roast' | 'hot_seat' | 'battle' | 'profile' | 'user' |
 *               'social_post' | 'comment' | 'challenge' | 'community'
 *   targetId: UUID
 *   category: harassment | threat | hate | spam | impersonation |
 *             non_consensual | privacy_violation | sexual_content |
 *             self_harm | illegal | other
 *   context: optional string
 *
 * Reporter identity is resolved from the session when signed in; otherwise
 * the IP is recorded. Reporter identity never leaves the server.
 */

import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { createReport } from '@/lib/moderationService';
import { REPORT_REASONS, canUserPerform } from '@/lib/safety';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';

const VALID_TARGET_TYPES = ['roast', 'hot_seat', 'battle', 'profile', 'user', 'social_post', 'comment', 'challenge', 'community'];
const VALID_CATEGORIES = REPORT_REASONS.map((r) => r.id);

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const rlResult = rateLimitMiddleware(ipKey(clientIp, 'report'), RATE_LIMITS.REPORT);
    if (rlResult.blocked) {
      return NextResponse.json(rlResult.response, { status: 429 });
    }

    const body = await request.json();
    const { targetType, targetId, category, context } = body;

    if (!targetType || !targetId) {
      return NextResponse.json({ error: 'targetType and targetId are required' }, { status: 400 });
    }
    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return NextResponse.json(
        { error: `Invalid targetType. Must be one of: ${VALID_TARGET_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Resolve identity from the session when present (better dedupe +
    // anti-abuse); anonymous reports still work with IP identity.
    const auth = await getRequestContext(request);
    const reporterId = auth?.userId || null;

    // Users restricted from reporting cannot weaponize the queue.
    if (auth?.client) {
      const allowed = await canUserPerform(auth.client, 'report');
      if (!allowed) {
        return NextResponse.json(
          { error: 'Your account is restricted from reporting right now' },
          { status: 403 }
        );
      }
    }

    const result = await createReport({
      targetType,
      targetId,
      category: VALID_CATEGORIES.includes(category) ? category : 'other',
      context,
      reporterId,
      reporterIp: reporterId ? null : clientIp,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.duplicate ? 'Already reported' : 'Report submitted',
      duplicate: result.duplicate || false,
    });
  } catch (error) {
    console.error('[Safety Report] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
