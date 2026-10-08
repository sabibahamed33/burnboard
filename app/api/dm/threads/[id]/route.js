import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { createBlock } from '@/lib/safety';
import { notifyDmMessage } from '@/lib/notifications';
import { otherParticipant } from '@/lib/dm';

/**
 * PATCH /api/dm/threads/[id]
 *   Body: { action: 'accept' | 'decline' | 'block' }
 *
 * Review a message request. Only the recipient (the participant who did
 * NOT send the request) may review it:
 *   - accept: requested → active. The conversation unlocks; the requester
 *     is notified once.
 *   - decline: the thread and its messages are deleted (CASCADE).
 *   - block: the requester is blocked (existing safety system) and the
 *     thread is deleted. Blocked users cannot start new threads.
 */
export async function PATCH(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;
    if (!['accept', 'decline', 'block'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { data: thread } = await client
      .from('dm_threads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!thread || (thread.user1_id !== userId && thread.user2_id !== userId)) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if ((thread.status || 'active') !== 'requested') {
      return NextResponse.json({ error: 'This conversation needs no review' }, { status: 400 });
    }
    if (thread.requested_by === userId) {
      return NextResponse.json({ error: 'Wait for the recipient to review your request' }, { status: 403 });
    }

    const requesterId = otherParticipant(thread, userId);

    if (action === 'accept') {
      const { error } = await client
        .from('dm_threads')
        .update({ status: 'active', requested_by: null })
        .eq('id', id);
      if (error) {
        console.error('[DM] Accept error:', error);
        return NextResponse.json({ error: 'Failed to accept request' }, { status: 500 });
      }
      notifyDmMessage({
        threadId: id,
        recipientId: requesterId,
        senderId: userId,
        isRequest: false,
        preview: 'accepted your message request — say hi!',
      }).catch(() => {});
      return NextResponse.json({ success: true, action: 'accepted' });
    }

    if (action === 'block') {
      try {
        await createBlock({ client, blockerUserId: userId, blockedUserId: requesterId });
      } catch (e) {
        console.error('[DM] Request block error:', e);
        return NextResponse.json({ error: 'Failed to block user' }, { status: 500 });
      }
    }

    // decline + block both remove the thread (messages cascade).
    const { error: deleteError } = await client.from('dm_threads').delete().eq('id', id);
    if (deleteError) {
      console.error('[DM] Decline error:', deleteError);
      return NextResponse.json({ error: 'Failed to remove request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: action === 'block' ? 'blocked' : 'declined' });
  } catch (err) {
    console.error('[DM] Thread PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
