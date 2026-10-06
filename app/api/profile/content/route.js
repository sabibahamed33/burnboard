import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/profile/content
 * 
 * Get content created by a user (social_posts + roasts).
 * 
 * Query params:
 *   - user_id: string (required)
 *   - cursor: ISO timestamp for pagination
 *   - limit: number (default: 20, max: 50)
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
      return NextResponse.json({ items: [], hasMore: false });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    if (!userId) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    // Fetch social posts
    let postQuery = supabase
      .from('social_posts')
      .select(`
        *,
        user_profiles!inner(id, username, display_name, avatar_url, bio),
        polls(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      postQuery = postQuery.lt('created_at', cursor);
    }

    const { data: posts, error: postError } = await postQuery;

    if (postError) {
      console.error('[Profile Content] Error:', postError);
      return NextResponse.json({ items: [], hasMore: false, error: postError.message });
    }

    const hasMore = (posts || []).length > limit;
    const items = (posts || []).slice(0, limit);

    // Transform posts into feed items
    const feedItems = items.map(post => ({
      id: post.id,
      type: post.content_type,
      text: post.content_text,
      mediaUrl: post.media_url,
      context: post.metadata?.context || null,
      author: {
        id: post.user_profiles?.id,
        username: post.user_profiles?.username,
        displayName: post.user_profiles?.display_name,
        avatarLetter: post.user_profiles?.username?.[0]?.toUpperCase() || '?',
        avatarColor: null,
        tagline: post.user_profiles?.bio,
      },
      reactions: { funny: 0, savage: 0, fatal: 0 },
      totalReactions: 0,
      upvotes: post.upvote_count || 0,
      userId: post.user_id,
      createdAt: post.created_at,
      poll: post.polls?.[0] || null,
    }));

    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

    return NextResponse.json({
      items: feedItems,
      hasMore,
      nextCursor,
      count: feedItems.length,
    });
  } catch (err) {
    console.error('[Profile Content] Error:', err);
    return NextResponse.json({ items: [], hasMore: false, error: 'Internal server error' });
  }
}
