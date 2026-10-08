import { NextResponse } from 'next/server';
import { fetchNotifications, getUnreadCount, markAllAsRead, deleteNotification, clearReadNotifications, NOTIFICATION_CATEGORIES } from '@/lib/notifications';
import { instrumentHandler } from '@/lib/metrics';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * GET /api/notifications
 *
 * Query params:
 *   - limit:   number (default: 20, max: 50)
 *   - offset:  number (default: 0; legacy page-based)
 *   - cursor:  JSON {created_at, id} for stable cursor pagination
 *   - category: mentions|social|communities|battles|challenges|achievements|messages|system
 *   - sort:    'new' (chronological) | 'smart' (priority, then recency)
 *   - unread:  'true' | 'false' (default: false)
 *   - count:   'true' to return only unread count
 */
async function getHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
    const unreadOnly = searchParams.get('unread') === 'true';
    const countOnly = searchParams.get('count') === 'true';
    const sort = searchParams.get('sort') === 'smart' ? 'smart' : 'new';
    const categoryParam = (searchParams.get('category') || '').toLowerCase();
    const category = NOTIFICATION_CATEGORIES.includes(categoryParam) ? categoryParam : null;
    let cursor = null;
    try {
      const raw = searchParams.get('cursor');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.created_at && parsed?.id) cursor = { created_at: parsed.created_at, id: parsed.id };
      }
    } catch {}

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

    const notifications = await fetchNotifications(userId, { limit, offset, unreadOnly, category, sort, cursor }, client);
    const count = await getUnreadCount(userId, client);

    const last = notifications[notifications.length - 1] || null;
    return NextResponse.json({
      success: true,
      notifications,
      count,
      nextCursor: last ? { created_at: last.created_at, id: last.id } : null,
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

/**
 * DELETE /api/notifications
 *
 * Body:
 *   - { id } — remove one owned notification
 *   - { clear_read: true } — remove all read notifications (unread kept)
 */
async function deleteHandler(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { client, userId } = await getRequestContext(req);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (body?.clear_read) {
      const success = await clearReadNotifications(userId, client);
      return NextResponse.json({ success });
    }
    if (body?.id) {
      const success = await deleteNotification(body.id, userId, client);
      return NextResponse.json({ success });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (err) {
    console.error('[Notifications] DELETE Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = instrumentHandler('notifications', getHandler);
export const POST = instrumentHandler('notifications', postHandler);
export const DELETE = instrumentHandler('notifications', deleteHandler);
