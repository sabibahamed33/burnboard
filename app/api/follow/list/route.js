import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/follow/list
 * 
 * Get followers or following list for a user.
 * 
 * Query params:
 *   - user_id: string (required)
 *   - type: 'followers' | 'following' (required)
 *   - cursor: ISO timestamp for pagination
 *   - limit: number (default: 20, max: 50)
 *   - viewer_id: string (optional, to check follow status of each user)
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
      return NextResponse.json({ users: [], hasMore: false });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const type = searchParams.get('type') || 'followers';
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const viewerId = searchParams.get('viewer_id');

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    let users = [];
    let hasMore = false;

    if (type === 'followers') {
      // Get users who follow this user
      let query = supabase
        .from('follows')
        .select(`
          follower_id,
          created_at,
          user_profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, bio, karma, level)
        `)
        .eq('following_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit + 1);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[Follow List] Error:', error);
        return NextResponse.json({ users: [], hasMore: false, error: 'Unable to load list right now.' });
      }

      hasMore = (data || []).length > limit;
      users = (data || []).slice(0, limit).map(f => ({
        ...f.user_profiles,
        followed_at: f.created_at,
      })).filter(Boolean);
    } else if (type === 'following') {
      // Get users this user follows
      let query = supabase
        .from('follows')
        .select(`
          following_id,
          created_at,
          user_profiles!follows_following_id_fkey(id, username, display_name, avatar_url, bio, karma, level)
        `)
        .eq('follower_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit + 1);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[Follow List] Error:', error);
        return NextResponse.json({ users: [], hasMore: false, error: 'Unable to load list right now.' });
      }

      hasMore = (data || []).length > limit;
      users = (data || []).slice(0, limit).map(f => ({
        ...f.user_profiles,
        followed_at: f.created_at,
      })).filter(Boolean);
    }

    // Get follow status for each user if viewer is provided
    if (viewerId && users.length > 0) {
      const userIds = users.map(u => u.id).filter(Boolean);
      
      const { data: viewerFollows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', viewerId)
        .in('following_id', userIds);

      const followedSet = new Set((viewerFollows || []).map(f => f.following_id));
      users = users.map(u => ({
        ...u,
        isFollowingByViewer: followedSet.has(u.id),
      }));
    }

    const nextCursor = hasMore && users.length > 0 ? users[users.length - 1].followed_at : null;

    return NextResponse.json({
      users,
      hasMore,
      nextCursor,
      count: users.length,
    });
  } catch (err) {
    console.error('[Follow List] Error:', err);
    return NextResponse.json({ users: [], hasMore: false, error: 'Internal server error' });
  }
}
