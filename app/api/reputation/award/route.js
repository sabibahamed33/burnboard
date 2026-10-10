import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { awardRep, checkBadgesFor } from '@/lib/reputation/awardService';

/**
 * POST /api/reputation/award
 *
 * Award Burn Rep for an action. Central enforcement point for the
 * universal XP economy (every USER earns through this route):
 *
 * Body:
 *   - event_type: string (required)
 *   - user_id: string (required, must equal the signed-in session user)
 *   - source_type: string (optional)
 *   - source_id: string (optional, dedupes repeat awards for one source)
 *   - metadata: object (optional, bounded server-side)
 *
 * Anti-abuse (server-side, never trusted from clients):
 *   - session authorization: the caller must be signed in and may only
 *     award XP to their own user id (server-to-server callers use the
 *     service module directly, never this HTTP route)
 *   - allowlisted event types with fixed point values
 *   - per-user daily caps per event type (farming-resistant)
 *   - source_id idempotency (same source never pays twice)
 *
 * Side effects (best-effort, non-blocking):
 *   - level-up detection → LEVEL_UP notification + leveledUp in response
 *   - badge + achievement checks → unlock notifications for achievements
 *   - streak accrual for qualifying events
 *
 * Event types: see lib/reputation/awardService.js (single source of truth).
 */

export async function POST(req) {
  try {
    const body = await req.json();
    const { event_type, user_id, source_type, source_id, metadata } = body;

    // Authorization: only the signed-in user may award XP to themselves.
    // Server-side flows (comments, follows, posts) call the service module
    // directly and never go through this route, so there is no legitimate
    // cross-user caller.
    const session = await getRequestContext(req);
    if (!session?.userId) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }
    if (!user_id || user_id !== session.userId) {
      return NextResponse.json({ error: 'Identity mismatch. Please refresh and try again.' }, { status: 403 });
    }

    // Handle badge check requests
    if (event_type === 'check_badges') {
      const result = await checkBadgesFor(session.userId);
      return NextResponse.json(result);
    }

    if (!event_type) {
      return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
    }

    const result = await awardRep({
      userId: session.userId,
      eventType: event_type,
      sourceType: source_type,
      sourceId: source_id,
      metadata,
    });
    if (!result.ok) {
      const status = result.error === 'Service not configured' ? 503 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ success: true, ...result, ok: undefined });
  } catch (err) {
    console.error('[Rep Award] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
