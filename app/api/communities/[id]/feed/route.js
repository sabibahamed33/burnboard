import { NextResponse } from 'next/server';
import { getCommunityById, getCommunityFeed } from '@/lib/communities';
import { getRequestContext } from '@/lib/routeAuth';
import { hiddenAuthorIds } from '@/lib/safety';

/**
 * GET /api/communities/[id]/feed?limit=&cursor=&sort=new|top&media=1
 *
 * Community feed built on the canonical social_posts table — the same content
 * records that appear across the platform, with the community as context.
 * Items are shaped exactly like /api/feed items, so FeedCard, reactions,
 * comments, and detail pages work unchanged.
 *
 * sort=new (default): chronological with cursor paging.
 * sort=top: engagement-first snapshot (first page only, no cursor).
 * media=1: photo posts only (combines with either sort).
 *
 * Privacy enforcement happens here too: private communities return 403 for
 * non-members; hidden communities return 404 (never reveal existence).
 */

export async function GET(req, { params }) {
  try {
    const { id } = params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const cursor = searchParams.get('cursor');
    const sort = searchParams.get('sort') === 'top' ? 'top' : 'new';
    const mediaOnly = searchParams.get('media') === '1';

    const community = await getCommunityById(id);
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    // Privacy enforcement at the data layer (not just hidden UI).
    // Hidden communities never reveal their existence to outsiders.
    if (community.visibility !== 'public') {
      const { client, userId } = await getRequestContext(req);
      if (!userId) {
        return NextResponse.json(
          { error: community.visibility === 'hidden' ? 'Community not found' : 'This community is private' },
          { status: community.visibility === 'hidden' ? 404 : 403 }
        );
      }
      const { data: membership } = await client
        .from('community_members')
        .select('id')
        .eq('community_id', id)
        .eq('user_id', userId)
        .eq('membership_status', 'active')
        .maybeSingle();
      if (!membership) {
        return NextResponse.json(
          { error: community.visibility === 'hidden' ? 'Community not found' : 'This community is private' },
          { status: community.visibility === 'hidden' ? 404 : 403 }
        );
      }
    }

    // ── Viewer-aware safety filtering (Master Prompt 11) ───────
    // When a signed-in viewer reads the feed, hide content authored by users
    // they blocked/muted, and by users who blocked them. Blocks are mutual;
    // mutes are one-directional. RLS already hides removed/under-review rows.
    const { client: viewerClient, userId: viewerId } = await getRequestContext(req);
    let visibleItems = null;
    if (viewerClient && viewerId) {
      const { items: rawItems, nextCursor: rawCursor } = await getCommunityFeed(id, { limit, cursor, sort, mediaOnly });
      const hidden = await hiddenAuthorIds(
        viewerClient,
        viewerId,
        rawItems.map((i) => i.userId).filter(Boolean)
      );
      visibleItems = hidden.size > 0
        ? rawItems.filter((i) => !i.userId || !hidden.has(i.userId))
        : rawItems;
      // Pagination boundary: if a full page was filtered away, the client
      // can keep paging; nextCursor is still real data, never fabricated.
      return NextResponse.json({
        items: visibleItems,
        nextCursor: rawCursor,
        count: visibleItems.length,
      });
    }

    const { items, nextCursor } = await getCommunityFeed(id, { limit, cursor, sort, mediaOnly });

    // Growth analytics (non-critical)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/growth/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'community_feed_viewed',
          subjectId: null,
          metadata: { communityId: id },
        }),
      });
    } catch (e) {}

    return NextResponse.json({ items, nextCursor, count: items.length });
  } catch (err) {
    console.error('[Communities] Feed Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}