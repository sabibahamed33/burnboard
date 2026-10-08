import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { transformSocialPostItem } from '@/lib/reco/items';
import { attachTaggedUsers } from '@/lib/reco/feedBuilder';
import { canViewPost } from '@/lib/photoPosts';

/**
 * GET /api/profile/content
 *
 * Get content created by a user (social_posts).
 *
 * Query params:
 *   - user_id: string (required) — profile owner
 *   - cursor: ISO timestamp for pagination
 *   - limit: number (default: 20, max: 50)
 *   - filter: 'published' (default) | 'drafts' (owner only — private
 *     drafts/scheduled posts for the owner's own drafts shelf)
 *     | 'roasts' (roasts authored by the user — public, unhidden only)
 *
 * Visibility: public rows for everyone; followers-only rows for followers
 * and the owner; drafts/scheduled/only_me for the owner only (via
 * ?filter=drafts). Anonymous reads see public posts only.
 * Blocked/suspended authors serve nothing to non-owners.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req) {
  try {
    const anon = getSupabase();
    if (!anon) {
      return NextResponse.json({ items: [], hasMore: false });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const filter = searchParams.get('filter') || 'published';
    const draftsOnly = filter === 'drafts';
    const roastsOnly = filter === 'roasts';

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    const { client: sessionClient, userId: viewerId } = await getRequestContext(req);
    const db = sessionClient || anon;
    const isOwner = !!viewerId && viewerId === userId;

    // Blocked/suspended authors serve nothing to non-owners (fail-soft:
    // lookups that error simply yield no rows, like a quiet profile).
    if (!isOwner) {
      try {
        if (viewerId && sessionClient) {
          const { relationshipBetween } = await import('@/lib/safety');
          const rel = await relationshipBetween(sessionClient, viewerId, userId);
          if (rel.viewer_blocks_other || rel.other_blocks_viewer) {
            return NextResponse.json({ items: [], hasMore: false });
          }
        }
        const { data: author } = await db
          .from('user_profiles')
          .select('is_banned')
          .eq('id', userId)
          .maybeSingle();
        if (author?.is_banned) {
          return NextResponse.json({ items: [], hasMore: false });
        }
      } catch {}
    }

    // Authored roasts: public, unhidden legacy roasts (newest first).
    if (roastsOnly) {
      try {
        let rq = db
          .from('roasts')
          .select('id, roast_text, anon_id, user_id, upvotes, reaction_haha, reaction_brutal, reaction_cry, created_at')
          .eq('user_id', userId)
          .eq('is_hidden', false)
          .order('created_at', { ascending: false })
          .limit(limit + 1);
        if (cursor) rq = rq.lt('created_at', cursor);
        const { data: roastRows } = await rq;
        const { transformRoastItem } = await import('@/lib/reco/items');
        const items = (roastRows || []).slice(0, limit).map(transformRoastItem);
        const hasMore = (roastRows || []).length > limit;
        return NextResponse.json({
          items,
          hasMore,
          nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt : null,
          count: items.length,
        });
      } catch {
        return NextResponse.json({ items: [], hasMore: false });
      }
    }

    // Drafts shelf is strictly owner-only.
    if (draftsOnly && !isOwner) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let postQuery = db
      .from('social_posts')
      .select(`
        *,
        user_profiles!inner(id, username, display_name, avatar_url, bio),
        polls(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (draftsOnly) {
      postQuery = postQuery.in('visibility', ['draft', 'scheduled']);
    }

    if (cursor) {
      postQuery = postQuery.lt('created_at', cursor);
    }

    const { data: posts, error: postError } = await postQuery;

    if (postError) {
      console.error('[Profile Content] Error:', postError);
      return NextResponse.json({ items: [], hasMore: false, error: 'Unable to load content right now.' });
    }

    // App-layer visibility gate (defense in depth over RLS): resolve
    // follow status once for the whole page, then filter.
    let isFollower = false;
    if (!isOwner && viewerId && (posts || []).some((p) => p.visibility === 'followers')) {
      const { data: follow } = await db
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('following_id', userId)
        .maybeSingle();
      isFollower = !!follow;
    }

    const visible = (posts || []).filter((p) => canViewPost(p, viewerId, isFollower || isOwner));
    const hasMore = visible.length > limit;
    const items = await attachTaggedUsers(db, visible.slice(0, limit).map(transformSocialPostItem));

    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

    return NextResponse.json({
      items,
      hasMore,
      nextCursor,
      count: items.length,
    });
  } catch (err) {
    console.error('[Profile Content] Error:', err);
    return NextResponse.json({ items: [], hasMore: false, error: 'Internal server error' });
  }
}
