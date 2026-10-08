import { NextResponse } from 'next/server';
import { markAsRead, markAllAsRead } from '@/lib/notifications';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * POST /api/notifications/read
 * 
 * Body:
 *   - notification_id: string (mark single as read)
 *   - action: 'mark_all_read' (mark all as read)
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { notification_id, action } = body;

    const { client, userId } = await getRequestContext(req);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (action === 'mark_all_read') {
      const success = await markAllAsRead(userId, client);
      return NextResponse.json({ success });
    }

    if (notification_id) {
      const success = await markAsRead(notification_id, userId, client);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: 'Missing notification_id or action' }, { status: 400 });
  } catch (err) {
    console.error('[Notifications Read] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
