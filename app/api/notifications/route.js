import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchNotifications, getUnreadCount, markAllAsRead } from '@/lib/notifications';
import { instrumentHandler } from '@/lib/metrics';

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

    // Get authenticated user from Supabase SSR session
    const userId = await getAuthUserId(req);
    
    if (!userId) {
      // Anonymous users: return empty (no notifications for anon)
      if (countOnly) {
        return NextResponse.json({ success: true, count: 0 });
      }
      return NextResponse.json({ success: true, notifications: [], count: 0 });
    }

    if (countOnly) {
      const count = await getUnreadCount(userId);
      return NextResponse.json({ success: true, count });
    }

    const notifications = await fetchNotifications(userId, { limit, offset, unreadOnly });
    const count = await getUnreadCount(userId);

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

    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (action === 'mark_all_read') {
      const success = await markAllAsRead(userId);
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

// ── Auth Helper ──────────────────────────────────────────────
async function getAuthUserId(req) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) return null;

    // Try to get user from cookie-based session
    const cookieHeader = req.headers.get('cookie') || '';
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name) {
          const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
          return match ? match[1] : undefined;
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}
