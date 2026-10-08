import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * DELETE /api/dm/messages/[id]
 *
 * Delete-for-everyone by the author: only the sender may delete their own
 * message, and deletion removes it for both participants (no silent
 * history rewrites by third parties, no delete-for-me ambiguity).
 * The thread preview falls back to the newest remaining message.
 */
export async function DELETE(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { data: message } = await client
      .from('dm_messages')
      .select('id, thread_id, sender_id')
      .eq('id', id)
      .maybeSingle();

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    if (message.sender_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own messages' }, { status: 403 });
    }

    const { error } = await client.from('dm_messages').delete().eq('id', id);
    if (error) {
      console.error('[DM] Delete error:', error);
      return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
    }

    // Refresh the thread preview to the newest remaining message.
    const { data: newest } = await client
      .from('dm_messages')
      .select('message, shared_ref, created_at')
      .eq('thread_id', message.thread_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    await client
      .from('dm_threads')
      .update({
        last_message: newest ? newest.message || (newest.shared_ref ? 'Shared something with you' : '') : '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', message.thread_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DM] Message DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
