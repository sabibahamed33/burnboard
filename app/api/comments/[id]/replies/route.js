import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/comments/[id]/replies
 * 
 * Fetch replies for a specific comment.
 * 
 * Query params:
 *   - limit: number (default: 10, max: 30)
 *   - cursor: ISO timestamp for pagination
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ replies: [], hasMore: false });
    }

    const { id } = params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 30);
    const cursor = searchParams.get('cursor');

    // Moderated content never surfaces in public reads.
    let query = supabase
      .from('comments')
      .select(`
        *,
        user_profiles!comments_user_id_fkey(username, display_name, avatar_url)
      `)
      .eq('parent_id', id)
      .eq('moderation_state', 'visible')
      .order('created_at', { ascending: true })
      .limit(limit + 1);

    if (cursor) {
      query = query.gt('created_at', cursor);
    }

    const { data: replies, error } = await query;

    if (error) {
      console.error('[Replies] GET Error:', error);
      // Never leak database internals to the client.
      return NextResponse.json({ replies: [], hasMore: false, error: 'Unable to load replies right now.' });
    }

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, limit) : replies;

    // Fetch reaction counts for replies
    const replyIds = items.map(r => r.id);
    let reactionCounts = {};

    if (replyIds.length > 0) {
      const { data: commentReactions } = await supabase
        .from('comment_reactions')
        .select('comment_id, reaction_type')
        .in('comment_id', replyIds);

      for (const r of commentReactions || []) {
        if (!reactionCounts[r.comment_id]) {
          reactionCounts[r.comment_id] = {};
        }
        reactionCounts[r.comment_id][r.reaction_type] = (reactionCounts[r.comment_id][r.reaction_type] || 0) + 1;
      }
    }

    const enrichedReplies = items.map(reply => ({
      ...reply,
      author: reply.user_profiles || null,
      reactionCounts: reactionCounts[reply.id] || {},
    }));

    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    return NextResponse.json({
      replies: enrichedReplies,
      hasMore,
      nextCursor,
      count: enrichedReplies.length,
    });
  } catch (err) {
    console.error('[Replies] GET Error:', err);
    return NextResponse.json({ replies: [], hasMore: false, error: 'Internal server error' });
  }
}
