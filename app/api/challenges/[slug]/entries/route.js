import { NextResponse } from 'next/server';
import { getChallengeEntries } from '@/lib/challenges';
import { supabase as anonSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getRequestContext } from '@/lib/routeAuth';
import { hiddenAuthorIds } from '@/lib/safety';

/**
 * GET /api/challenges/[slug]/entries
 *   ?limit= &cursor=
 *
 * Cursor-paginated real entries (canonical social_posts linked to the
 * challenge). Items are shaped like feed items so FeedCard works unchanged —
 * reactions, comments, and detail pages all hit the canonical content.
 */

export async function GET(req, { params }) {
  try {
    const { slug } = params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const cursor = searchParams.get('cursor');

    if (!isSupabaseConfigured || !anonSupabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { data: challenge } = await anonSupabase
      .from('challenges')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // ── Viewer-aware safety filtering (Master Prompt 11) ───────
    const { client: viewerClient, userId: viewerId } = await getRequestContext(req);
    let items = null;
    let nextCursor = null;
    let viewerVotePostId = null;
    if (viewerClient && viewerId) {
      const raw = await getChallengeEntries(challenge.id, { limit, cursor, viewerId });
      viewerVotePostId = raw.viewerVotePostId || null;
      const hidden = await hiddenAuthorIds(
        viewerClient,
        viewerId,
        raw.items.map((i) => i.userId).filter(Boolean)
      );
      items = hidden.size > 0
        ? raw.items.filter((i) => !i.userId || !hidden.has(i.userId))
        : raw.items;
      nextCursor = raw.nextCursor;
    } else {
      const result = await getChallengeEntries(challenge.id, { limit, cursor });
      items = result.items;
      nextCursor = result.nextCursor;
    }

    return NextResponse.json({
      items,
      nextCursor,
      count: items.length,
      viewerVotePostId,
    });
  } catch (err) {
    console.error('[Challenges] Entries error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
