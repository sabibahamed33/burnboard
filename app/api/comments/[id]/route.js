import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * DELETE /api/comments/[id]
 *
 * Delete a comment (owner only). Ownership is verified server-side
 * against the signed-in session AND enforced by RLS (auth.uid() =
 * user_id) on the delete itself. A client-supplied participant_id is
 * never accepted as proof of ownership.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

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

    // Session is the only identity source (the previous anon-client
    // getUser() could never resolve a user, so every delete 403'd —
    // including the owner's).
    const session = await getRequestContext(req);
    if (!session?.client || !session?.userId) {
      return NextResponse.json({ error: 'Sign in to delete comments.' }, { status: 401 });
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

    // Owner-only (anonymous comments carry no verifiable owner identity
    // and cannot be deleted through this endpoint).
    if (!comment.user_id || comment.user_id !== session.userId) {
      return NextResponse.json({ error: 'You can only delete your own comments' }, { status: 403 });
    }

    // Delete through the session client so RLS (auth.uid() = user_id)
    // independently enforces ownership (cascades to replies via FK).
    const { error: deleteError } = await session.client
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
