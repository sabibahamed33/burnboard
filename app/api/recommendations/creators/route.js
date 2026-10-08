import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { recommendCreators } from '@/lib/reco/discovery';

/**
 * GET /api/recommendations/creators?limit=6
 *
 * "People You May Like" — user discovery rail (path kept for compatibility).
 * Auth required (personalization needs a real viewer). Based only on
 * legitimate signals: shared community memberships, friend-of-friend
 * follows, and the viewer's own engagement affinity. Blocks/mutes are
 * always respected. Only product-level reason text is returned — never
 * raw scores or private relationship details.
 */
export async function GET(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ items: [], signedIn: false }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '6', 10) || 6, 12);
    const mutualOnly = searchParams.get('mutual') === '1' || searchParams.get('mutual') === 'true';

    const result = await recommendCreators({ client, userId, limit, mutualOnly });
    return NextResponse.json({ items: result.items, signedIn: true });
  } catch (err) {
    console.error('[Recommendations] Creators error:', err);
    return NextResponse.json({ items: [], error: 'Internal server error' }, { status: 500 });
  }
}
