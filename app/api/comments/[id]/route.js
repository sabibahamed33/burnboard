import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * DELETE /api/comments/[id]
 * 
 * Delete a comment (owner only).
 * 
 * Body:
 *   - participant_id: string (required for authorization)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function DELETE(req, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const { participant_id } = body;

    if (!participant_id) {
      return NextResponse.json({ error: 'participant_id required' }, { status: 400 });
    }

    // Fetch the comment
    const { data: comment, error: fetchError } = await supabase
      .from('comments')
      .select('id, user_id, target_type, target_id')
      .eq('id', id)
      .single();

    if (fetchError || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Check authorization (comment owner or authenticated user)
    const { data: { user } } = await supabase.auth.getUser();
    const isOwner = comment.user_id && user && comment.user_id === user.id;

    // Anonymous comments carry no verifiable owner identity (no user_id and
    // no stored participant fingerprint), so they cannot be deleted through
    // this endpoint. This closes mass-deletion abuse where anyone could
    // remove anyone else's anonymous comments.
    if (!comment.user_id) {
      return NextResponse.json({ error: 'You can only delete your own comments' }, { status: 403 });
    }

    if (!isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete the comment (cascades to replies via FK)
    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[Comments] DELETE Error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    // Update comment count on the target
    if (comment.target_type === 'social_post') {
      const { data: post } = await supabase
        .from('social_posts')
        .select('comment_count')
        .eq('id', comment.target_id)
        .single();

      if (post) {
        await supabase
          .from('social_posts')
          .update({ comment_count: Math.max(0, (post.comment_count || 0) - 1) })
          .eq('id', comment.target_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Comments] DELETE Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
