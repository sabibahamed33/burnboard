import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/profile/featured?username=xxx
 *
 * Public read of a profile's featured (pinned) content. Returns a
 * FeedCard-compatible item or null. Server-side re-validation: the post must
 * belong to that profile, still be public + moderation-visible (RLS), and
 * exist. Removed/private/expired content never surfaces.
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
    if (!supabase) return NextResponse.json({ item: null });

    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, featured_post_id')
      .eq('username', username.toLowerCase())
      .single();

    if (!profile?.featured_post_id) return NextResponse.json({ item: null });

    // RLS already restricts to public + moderation-visible rows; the owner
    // check below is defense-in-depth (never show another user's pinned row).
    const { data: post } = await supabase
      .from('social_posts')
      .select(`
        *,
        user_profiles!inner(id, username, display_name, avatar_url, bio),
        polls(*)
      `)
      .eq('id', profile.featured_post_id)
      .single();

    if (!post || post.user_id !== profile.id) return NextResponse.json({ item: null });

    return NextResponse.json({
      item: {
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
        reactions: {},
        totalReactions: 0,
        upvotes: post.upvote_count || 0,
        userId: post.user_id,
        createdAt: post.created_at,
        poll: post.polls?.[0] || null,
      },
    });
  } catch (err) {
    console.error('[Profile Featured] Error:', err);
    return NextResponse.json({ item: null });
  }
}
