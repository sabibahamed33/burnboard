import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { relationshipBetween } from '@/lib/safety';
import { recordSignal } from '@/lib/reco/signals';
import { pingMilestones } from '@/lib/creator/milestones';
import { notifyNewFollower } from '@/lib/notifications';

/**
 * POST /api/follow
 * 
 * Follow or unfollow a user.
 * 
 * Body:
 *   - target_user_id: string (required) - user to follow/unfollow
 *   - action: 'follow' | 'unfollow' (required)
 * 
 * GET /api/follow?user_id=xxx
 * 
 * Get follow status and counts for a user.
 * 
 * Query params:
 *   - user_id: string (required) - target user
 *   NOTE: a legacy `viewer_id` param is intentionally ignored — the
 *   isFollowing check uses only the signed-in session viewer.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// follows.* ids are UUIDs (FK → auth.users). Anonymous `anon_*`
// participant ids can never be valid here.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ followerCount: 0, followingCount: 0, isFollowing: false });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Viewer identity comes ONLY from the session. A client-supplied
    // viewer_id is never trusted for the isFollowing check (prevents
    // follow-graph oracle queries for arbitrary viewer→target pairs).
    let viewerId = null;
    try {
      const session = await getRequestContext(req);
      if (session?.userId) viewerId = session.userId;
    } catch {}

    // Get follower and following counts
    const [followersResult, followingResult] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
    ]);

    const followerCount = followersResult.count || 0;
    const followingCount = followingResult.count || 0;

    // Check if viewer follows target
    let isFollowing = false;
    if (viewerId && viewerId !== userId) {
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('following_id', userId)
        .single();
      isFollowing = !!data;
    }

    return NextResponse.json({
      followerCount,
      followingCount,
      isFollowing,
    });
  } catch (err) {
    console.error('[Follow] GET Error:', err);
    return NextResponse.json({ followerCount: 0, followingCount: 0, isFollowing: false });
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Layered rate limit: per-IP + per-viewer (anti-follow-spam).
    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'follow_ip'), RATE_LIMITS.FOLLOW);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error, retryAfter: ipLimit.retryAfterSeconds }, { status: 429 });
    }

    const body = await req.json();
    const { target_user_id, action } = body;
    let { viewer_id } = body;

    // Resolve the real actor: the signed-in session wins over any
    // client-supplied viewer_id (prevents follow spoofing).
    const session = await getRequestContext(req);
    if (session?.userId) {
      if (viewer_id && viewer_id !== session.userId) {
        return NextResponse.json({ error: 'Identity mismatch. Please refresh and try again.' }, { status: 403 });
      }
      viewer_id = session.userId;
    }

    if (viewer_id) {
      const userLimit = rateLimitMiddleware(ipKey(viewer_id, 'follow_user'), RATE_LIMITS.FOLLOW);
      if (userLimit.blocked) {
        return NextResponse.json({ error: userLimit.response.error, retryAfter: userLimit.retryAfterSeconds }, { status: 429 });
      }
    }

    if (!target_user_id || !action || !viewer_id) {
      return NextResponse.json(
        { error: 'Missing required fields: target_user_id, action, viewer_id' },
        { status: 400 }
      );
    }

    // Only real user ids can follow (anon participant ids fail the
    // UUID/FK constraint — reject with a friendly message, not a 500).
    if (!UUID_RE.test(viewer_id)) {
      return NextResponse.json({ error: 'Sign in to follow users.' }, { status: 401 });
    }

    // Writes require the session client: RLS enforces
    // auth.uid() = follower_id on follows, so the anon-key client can
    // never insert/delete (RLS would deny it). No session → no follow.
    const writeClient = session?.client && session.userId === viewer_id ? session.client : null;
    if (!writeClient) {
      return NextResponse.json({ error: 'Sign in to follow users.' }, { status: 401 });
    }

    // Prevent self-follow
    if (viewer_id === target_user_id) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    // Verify target user exists
    const { data: targetUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', target_user_id)
      .single();

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'follow') {
      // ── Safety enforcement: blocks are mutual. ──
      // If either side blocks the other, following is refused — never rely
      // on hidden buttons. Checked for every caller (the RPC takes explicit
      // ids, so no session is required to enforce it).
      try {
        const relClient = session?.client || supabase;
        const rel = await relationshipBetween(relClient, viewer_id, target_user_id);
        if (rel.viewer_blocks_other || rel.other_blocks_viewer) {
          return NextResponse.json({ error: 'You cannot follow this user' }, { status: 403 });
        }
      } catch {}

      // Check if already following
      const { data: existing } = await writeClient
        .from('follows')
        .select('id')
        .eq('follower_id', viewer_id)
        .eq('following_id', target_user_id)
        .single();

      if (existing) {
        return NextResponse.json({ success: true, action: 'already_following', isFollowing: true });
      }

      // Create follow relationship (session client: satisfies RLS).
      const { error } = await writeClient
        .from('follows')
        .insert({ follower_id: viewer_id, following_id: target_user_id });

      if (error) {
        console.error('[Follow] Insert error:', error);
        return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
      }
    } else if (action === 'unfollow') {
      // Delete follow relationship (session client: satisfies RLS).
      const { error } = await writeClient
        .from('follows')
        .delete()
        .eq('follower_id', viewer_id)
        .eq('following_id', target_user_id);

      if (error) {
        console.error('[Follow] Delete error:', error);
        return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid action. Must be "follow" or "unfollow"' }, { status: 400 });
    }

    // Real behavior signal: follow/unfollow by the authenticated actor
    // (verified against the session so viewers can't record for others).
    try {
      if (session?.client && session.userId && session.userId === viewer_id) {
        recordSignal({
          client: session.client,
          userId: session.userId,
          eventType: action === 'follow' ? 'user_followed' : 'user_unfollowed',
          targetType: 'user',
          targetId: target_user_id,
          context: {},
          idempotencyKey: `${action === 'follow' ? 'follow' : 'unfollow'}-${target_user_id}`,
        }).catch(() => {});

        // Creator milestone check: a real follower was gained (fire-and-forget;
        // thresholds are recomputed server-side — nothing can be faked).
        if (action === 'follow' && session.client) {
          pingMilestones(session.client, target_user_id).catch(() => {});

          // Real-time new-follower notification for the followed user
          // (respects their preferences + safety gate; fire-and-forget).
          notifyNewFollower({
            followerId: viewer_id,
            followedUserId: target_user_id,
          }).catch(() => {});

          // Universal XP: the follower connected (+2), the followed user
          // gained a follower (+5). Direct service calls with server-
          // resolved ids — never client-supplied. Fire-and-forget; the
          // service enforces daily caps and idempotency.
          (async () => {
            try {
              const { awardRep } = await import('@/lib/reputation/awardService');
              await awardRep({ userId: viewer_id, eventType: 'follow', sourceType: 'user', sourceId: target_user_id });
              await awardRep({ userId: target_user_id, eventType: 'follow_received', sourceType: 'user', sourceId: viewer_id });
            } catch {}
          })();
        }
      }
    } catch {}

    // Get updated counts
    const [followersResult, followingResult] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', target_user_id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', target_user_id),
    ]);

    // Check follow status
    const { data: followCheck } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', viewer_id)
      .eq('following_id', target_user_id)
      .single();

    return NextResponse.json({
      success: true,
      action,
      isFollowing: !!followCheck,
      followerCount: followersResult.count || 0,
      followingCount: followingResult.count || 0,
    });
  } catch (err) {
    console.error('[Follow] POST Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
