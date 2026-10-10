import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { instrumentHandler } from '@/lib/metrics';
import { runDeterministicPolicy, canUserPerform } from '@/lib/safety';
import { recordSignal, resolveContentContext } from '@/lib/reco/signals';
import { pingMilestones } from '@/lib/creator/milestones';

/**
 * GET /api/comments
 * 
 * Fetch comments for a content item with pagination.
 * 
 * Query params:
 *   - target_type: 'roast' | 'social_post' (required)
 *   - target_id: string (required)
 *   - sort: 'top' | 'newest' (default: 'top')
 *   - limit: number (default: 20, max: 50)
 *   - cursor: ISO timestamp for pagination
 * 
 * POST /api/comments (requires sign-in; the session is the author)
 *
 * Create a new comment.
 *
 * Body:
 *   - target_type: 'roast' | 'social_post' (required)
 *   - target_id: string (required)
 *   - text: string (required, max 500 chars)
 *   - parent_id: string (optional, for replies — must match same target)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

const VALID_TARGET_TYPES = ['roast', 'social_post'];

async function getHandler(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ comments: [], hasMore: false });
    }

    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get('target_type');
    const targetId = searchParams.get('target_id');
    const sort = searchParams.get('sort') || 'top';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const cursor = searchParams.get('cursor');

    if (!targetType || !targetId) {
      return NextResponse.json({ error: 'Missing target_type or target_id' }, { status: 400 });
    }

    // Private/restricted posts stay private: their conversations are not
    // listable by unauthorized viewers (404, same as the post itself).
    if (targetType === 'social_post') {
      try {
        const { fetchSocialPostAccess } = await import('@/lib/photoPosts');
        const session = await getRequestContext(req);
        const access = await fetchSocialPostAccess(session?.client || supabase, targetId, session?.userId || null);
        if (!access.canView) {
          return NextResponse.json({ comments: [], hasMore: false });
        }
      } catch {}
    }

    // Fetch top-level comments (no parent_id). Moderated content
    // (removed/limited/under_review) never surfaces in public reads.
    let query = supabase
      .from('comments')
      .select(`
        *,
        user_profiles!comments_user_id_fkey(username, display_name, avatar_url)
      `)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('moderation_state', 'visible')
      .is('parent_id', null)
      .limit(limit + 1);

    // Apply sort
    if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else {
      // Top: order by upvotes then recency
      query = query.order('upvotes', { ascending: false }).order('created_at', { ascending: false });
    }

    // Apply cursor
    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: comments, error } = await query;

    if (error) {
      console.error('[Comments] GET Error:', error);
      return NextResponse.json({ comments: [], hasMore: false, error: 'Unable to load comments right now.' });
    }

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;

    // Fetch reply counts for each comment
    const commentIds = items.map(c => c.id);
    let replyCounts = {};

    if (commentIds.length > 0) {
      const { data: replies } = await supabase
        .from('comments')
        .select('parent_id')
        .eq('moderation_state', 'visible')
        .in('parent_id', commentIds);

      for (const r of replies || []) {
        replyCounts[r.parent_id] = (replyCounts[r.parent_id] || 0) + 1;
      }
    }

    // Fetch reaction counts for each comment
    let reactionCounts = {};
    if (commentIds.length > 0) {
      const { data: commentReactions } = await supabase
        .from('comment_reactions')
        .select('comment_id, reaction_type')
        .in('comment_id', commentIds);

      for (const r of commentReactions || []) {
        if (!reactionCounts[r.comment_id]) {
          reactionCounts[r.comment_id] = {};
        }
        reactionCounts[r.comment_id][r.reaction_type] = (reactionCounts[r.comment_id][r.reaction_type] || 0) + 1;
      }
    }

    // Enrich comments
    const enrichedComments = items.map(comment => ({
      ...comment,
      author: comment.user_profiles || null,
      replyCount: replyCounts[comment.id] || 0,
      reactionCounts: reactionCounts[comment.id] || {},
    }));

    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    return NextResponse.json({
      comments: enrichedComments,
      hasMore,
      nextCursor,
      count: enrichedComments.length,
    });
  } catch (err) {
    console.error('[Comments] GET Error:', err);
    return NextResponse.json({ comments: [], hasMore: false, error: 'Internal server error' });
  }
}

export const GET = instrumentHandler('comments', getHandler);
export const POST = instrumentHandler('comments', postHandler);

async function postHandler(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Layered rate limit: per-IP + per-participant (anti-comment-flood).
    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'comment_ip'), RATE_LIMITS.COMMENT_CREATE);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error, retryAfter: ipLimit.retryAfterSeconds }, { status: 429 });
    }

    const body = await req.json();
    const { target_type, target_id, text, parent_id } = body;
    // NOTE: a legacy `participant_id` field is accepted but ignored for
    // identity — the signed-in session is the only identity source.

    // Comments require a signed-in user: the database boundary enforces
    // auth.uid() = user_id on insert, so anonymous writes can never
    // succeed. Fail with an honest 401 instead of an RLS-driven 500.
    const session = await getRequestContext(req);
    if (!session?.client || !session?.userId) {
      return NextResponse.json({ error: 'Sign in to comment.' }, { status: 401 });
    }
    const sessionUserId = session.userId;

    const userLimit = rateLimitMiddleware(ipKey(sessionUserId, 'comment_user'), RATE_LIMITS.COMMENT_CREATE);
    if (userLimit.blocked) {
      return NextResponse.json({ error: userLimit.response.error, retryAfter: userLimit.retryAfterSeconds }, { status: 429 });
    }

    // Validate required fields
    if (!target_type || !target_id || !text) {
      return NextResponse.json(
        { error: 'Missing required fields: target_type, target_id, text' },
        { status: 400 }
      );
    }

    // Validate target type
    if (!VALID_TARGET_TYPES.includes(target_type)) {
      return NextResponse.json(
        { error: `Invalid target_type. Must be one of: ${VALID_TARGET_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate text
    if (typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json({ error: 'Comment must be 500 characters or less' }, { status: 400 });
    }

    // If replying, verify the parent exists AND belongs to the same
    // thread (prevents grafting a reply across unrelated threads).
    if (parent_id) {
      const { data: parent } = await supabase
        .from('comments')
        .select('id, target_type, target_id')
        .eq('id', parent_id)
        .single();

      if (!parent) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      }
      if (parent.target_type !== target_type || String(parent.target_id) !== String(target_id)) {
        return NextResponse.json({ error: 'Reply target does not match the parent comment.' }, { status: 400 });
      }
    }

    // The session is the authenticated user (resolved above).

    // Interaction gating: private/restricted posts stay private.
    // Comments off → only the owner may still comment (owner bypass).
    if (target_type === 'social_post') {
      const { fetchSocialPostAccess } = await import('@/lib/photoPosts');
      const access = await fetchSocialPostAccess(session?.client || supabase, target_id, sessionUserId);
      if (!access.canView) {
        return NextResponse.json({ error: 'Comments not found' }, { status: 404 });
      }
      if (access.permissions.comments === 'off' && !access.isOwner) {
        return NextResponse.json({ error: 'Comments are turned off for this post.' }, { status: 403 });
      }
    }

    // ── Safety pipeline (Master Prompt 11) ─────────────────────
    // 1) Account restriction check (server-side; a hidden button is not
    //    enforcement).
    {
      const allowed = await canUserPerform(session.client, 'comment');
      if (!allowed) {
        return NextResponse.json(
          { error: 'Your account is currently restricted from commenting' },
          { status: 403 }
        );
      }
    }

    // 2) Deterministic policy: block clear violations synchronously.
    const policy = runDeterministicPolicy(text.trim());
    if (policy.blocked) {
      const finding = policy.findings.find((f) => f.action === 'block');
      return NextResponse.json(
        { error: finding?.reason || 'This comment violates BurnBoard safety policy' },
        { status: 400 }
      );
    }

    // Create comment through the session client so RLS
    // (auth.uid() = user_id) accepts the row.
    const writeClient = session.client;
    const { data: comment, error } = await writeClient
      .from('comments')
      .insert({
        target_type,
        target_id,
        text: text.trim(),
        parent_id: parent_id || null,
        user_id: sessionUserId,
      })
      .select(`
        *,
        user_profiles!comments_user_id_fkey(username, display_name, avatar_url)
      `)
      .single();

    if (error) {
      console.error('[Comments] POST Error:', error);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    // 3) Async safety analysis (rules classification + optional AI).
    // Fire-and-forget: never blocks or delays the write path, and if the
    // AI provider is down nothing here breaks.
    try {
      const { analyzeContentAsync } = await import('@/lib/safety');
      analyzeContentAsync({
        targetType: 'comment',
        targetId: comment.id,
        text: text.trim(),
        authorUserId: sessionUserId,
      });
    } catch {}

    // 4) Record a safety event for the content creation (auditable).
    try {
      const { recordSafetyEvent } = await import('@/lib/safety');
      recordSafetyEvent({
        eventType: 'content_created',
        actorUserId: sessionUserId,
        targetType: 'comment',
        targetId: comment.id,
        riskLevel: 'low',
      });
    } catch {}

    // Real behavior signal: an authenticated user commented/replied on real
    // content → strong positive content signal (fire-and-forget).
    if (session?.client && sessionUserId
        && (target_type === 'roast' || target_type === 'social_post')) {
      (async () => {
        try {
          const meta = await resolveContentContext(session.client, target_type, target_id);
          await recordSignal({
            client: session.client,
            userId: sessionUserId,
            eventType: parent_id ? 'content_replied' : 'content_commented',
            targetType: target_type,
            targetId: target_id,
            context: { ...(meta || {}) },
            idempotencyKey: `comment-${target_type}-${target_id}`,
          });

          // Creator milestone check: the author received a real comment.
          if (meta?.author_id) {
            await pingMilestones(session.client, meta.author_id);
          }
        } catch {}
      })();
    }

    // Engagement notifications: reply → parent author, top-level comment →
    // content author, @mentions → mentioned users. Fire-and-forget: a
    // notification failure must never fail the comment itself.
    if (sessionUserId) {
      (async () => {
        try {
          const { notifyCommentActivity } = await import('@/lib/notifications');
          await notifyCommentActivity({
            commentId: comment.id,
            targetType: target_type,
            targetId: target_id,
            authorId: sessionUserId,
            parentCommentId: parent_id || null,
            text: text.trim(),
          });
        } catch {}
      })();
    }

    // Award reputation for comment creation (non-critical). Direct service
    // call with the server-resolved session user — never HTTP with a
    // client-supplied id.
    if (sessionUserId) {
      (async () => {
        try {
          const { awardRep } = await import('@/lib/reputation/awardService');
          await awardRep({ userId: sessionUserId, eventType: 'comment_created', sourceType: 'comment', sourceId: comment.id });
        } catch {}
      })();
    }

    // Update comment count on the target
    if (target_type === 'social_post') {
      await supabase.rpc('increment_comment_count', { post_id: target_id }).catch(() => {
        // Fallback: manual increment
        supabase.from('social_posts')
          .select('comment_count')
          .eq('id', target_id)
          .single()
          .then(({ data }) => {
            if (data) {
              supabase.from('social_posts')
                .update({ comment_count: (data.comment_count || 0) + 1 })
                .eq('id', target_id);
            }
          });
      });
    }

    return NextResponse.json({
      success: true,
      comment: {
        ...comment,
        author: comment.user_profiles || null,
        replyCount: 0,
        reactionCounts: {},
      },
    });
  } catch (err) {
    console.error('[Comments] POST Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
