import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * GET /api/dm/unread → { totalUnread }
 *
 * Lightweight badge count for navigation. Counts unread incoming messages
 * across the viewer's active threads only (requests don't badge until
 * accepted — they surface in the inbox instead).
 */
export async function GET(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ totalUnread: 0 });
    }

    const { data: threads } = await client
      .from('dm_threads')
      .select('id')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .eq('status', 'active');

    const ids = (threads || []).map((t) => t.id);
    if (ids.length === 0) {
      return NextResponse.json({ totalUnread: 0 });
    }

    const { count } = await client
      .from('dm_messages')
      .select('id', { count: 'exact', head: true })
      .in('thread_id', ids)
      .neq('sender_id', userId)
      .eq('is_read', false);

    return NextResponse.json({ totalUnread: count || 0 });
  } catch (err) {
    console.error('[DM] Unread error:', err);
    return NextResponse.json({ totalUnread: 0 });
  }
}
