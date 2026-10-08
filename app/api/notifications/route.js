import { NextResponse } from 'next/server';
import { fetchNotifications, getUnreadCount, markAllAsRead } from '@/lib/notifications';
import { instrumentHandler } from '@/lib/metrics';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * GET /api/notifications
 * 
 * Query params:
 *   - limit:   number (default: 20, max: 50)
 *   - offset:  number (default: 0)
 *   - unread:  'true' | 'false' (default: false)
 *   - count:   'true' to return only unread count
 */
async function getHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const unreadOnly = searchParams.get('unread') === 'true';
    const countOnly = searchParams.get('count') === 'true';

    // Get authenticated user from the Supabase SSR session (cookies).
    // Reads are RLS-gated (auth.uid() = user_id), so every query below
    // runs through the session client — never the anon client.
    const { client, userId } = await getRequestContext(req);
    
    if (!userId) {
      // Anonymous users: return empty (no notifications for anon)
      if (countOnly) {
        return NextResponse.json({ success: true, count: 0 });
      }
      return NextResponse.json({ success: true, notifications: [], count: 0 });
    }

    if (countOnly) {
      const count = await getUnreadCount(userId, client);
      return NextResponse.json({ success: true, count });
    }

    const notifications = await fetchNotifications(userId, { limit, offset, unreadOnly }, client);
    const count = await getUnreadCount(userId, client);

    return NextResponse.json({ 
      success: true, 
      notifications,
      count,
    });
  } catch (err) {
    console.error('[Notifications] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/notifications
 * 
 * Body:
 *   - action: 'mark_all_read'
 */
async function postHandler(req) {
  try {
    const body = await req.json();
    const { action } = body;

    const { client, userId } = await getRequestContext(req);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (action === 'mark_all_read') {
      const success = await markAllAsRead(userId, client);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[Notifications] POST Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = instrumentHandler('notifications', getHandler);
export const POST = instrumentHandler('notifications', postHandler);
