import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * POST /api/dm/threads/[id]/read
 *
 * Mark the conversation as read for the viewer (their incoming messages
 * only — never the other participant's read state). Called when the chat
 * is actively viewed, so unread badges reflect actual viewing, not list
 * renders.
 */
export async function POST(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { data: thread } = await client
      .from('dm_threads')
      .select('id, user1_id, user2_id')
      .eq('id', id)
      .maybeSingle();

    if (!thread || (thread.user1_id !== userId && thread.user2_id !== userId)) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { error } = await client
      .from('dm_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('thread_id', id)
      .neq('sender_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('[DM] Mark read error:', error);
      return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DM] Read error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
