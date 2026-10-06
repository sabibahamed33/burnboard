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
 * POST /api/comments
 * 
 * Create a new comment.
 * 
 * Body:
 *   - target_type: 'roast' | 'social_post' (required)
 *   - target_id: string (required)
 *   - text: string (required, max 500 chars)
 *   - parent_id: string (optional, for replies)
 *   - participant_id: string (required)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

    // Fetch top-level comments (no parent_id)
    let query = supabase
      .from('comments')
      .select(`
        *,
        user_profiles!comments_user_id_fkey(username, display_name, avatar_url)
      `)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
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
    const { target_type, target_id, text, parent_id, participant_id } = body;

    if (participant_id) {
      const userLimit = rateLimitMiddleware(ipKey(participant_id, 'comment_user'), RATE_LIMITS.COMMENT_CREATE);
      if (userLimit.blocked) {
        return NextResponse.json({ error: userLimit.response.error, retryAfter: userLimit.retryAfterSeconds }, { status: 429 });
      }
    }

    // Validate required fields
    if (!target_type || !target_id || !text || !participant_id) {
      return NextResponse.json(
        { error: 'Missing required fields: target_type, target_id, text, participant_id' },
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

    // Validate participant_id
    if (typeof participant_id !== 'string' || participant_id.length < 10) {
      return NextResponse.json({ error: 'Invalid participant_id' }, { status: 400 });
    }

    // If replying, verify parent comment exists
    if (parent_id) {
      const { data: parent } = await supabase
        .from('comments')
        .select('id')
        .eq('id', parent_id)
        .single();

      if (!parent) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      }
    }

    // Get authenticated user (optional)
    const { data: { user } } = await supabase.auth.getUser();
    const session = await getRequestContext(req);
    const sessionUserId = session?.userId || user?.id || null;

    // ── Safety pipeline (Master Prompt 11) ─────────────────────
    // 1) Account restriction check (server-side; a hidden button is not
    //    enforcement). Applies to signed-in commenters.
    if (session?.client && sessionUserId) {
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

    // Create comment. When a real session exists we write through the SSR
    // client so RLS (auth.uid() = user_id) accepts the row; anonymous legacy
    // paths keep the previous behavior unchanged.
    const writeClient = session?.client || supabase;
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

    // Award reputation for comment creation (non-critical)
    if (user?.id) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            event_type: 'comment_created',
            source_type: 'comment',
            source_id: comment.id,
          }),
        });
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            event_type: 'check_badges',
          }),
        });
      } catch (e) {}
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
