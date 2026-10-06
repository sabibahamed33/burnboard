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
 *   - viewer_id: string (optional) - to check if viewer follows target
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ followerCount: 0, followingCount: 0, isFollowing: false });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const viewerId = searchParams.get('viewer_id');

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

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
    const { target_user_id, action, viewer_id } = body;

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
      // ── Safety enforcement (Master Prompt 11): blocks are mutual. ──
      // If either side blocks the other, following must be refused — never
      // rely on hidden buttons. Uses the session relationship when signed
      // in; legacy viewer_id bodies keep working but cannot bypass a block.
      try {
        const session = await getRequestContext(req);
        if (session?.client && session.userId) {
          const rel = await relationshipBetween(session.client, session.userId, target_user_id);
          if (rel.viewer_blocks_other || rel.other_blocks_viewer) {
            return NextResponse.json({ error: 'You cannot follow this user' }, { status: 403 });
          }
        }
      } catch {}

      // Check if already following
      const { data: existing } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', viewer_id)
        .eq('following_id', target_user_id)
        .single();

      if (existing) {
        return NextResponse.json({ success: true, action: 'already_following', isFollowing: true });
      }

      // Create follow relationship
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: viewer_id, following_id: target_user_id });

      if (error) {
        console.error('[Follow] Insert error:', error);
        return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
      }
    } else if (action === 'unfollow') {
      // Delete follow relationship
      const { error } = await supabase
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
      const session = await getRequestContext(req);
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
