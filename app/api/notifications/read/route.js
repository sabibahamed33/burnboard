import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { markAsRead, markAllAsRead } from '@/lib/notifications';

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

    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (action === 'mark_all_read') {
      const success = await markAllAsRead(userId);
      return NextResponse.json({ success });
    }

    if (notification_id) {
      const success = await markAsRead(notification_id, userId);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: 'Missing notification_id or action' }, { status: 400 });
  } catch (err) {
    console.error('[Notifications Read] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Auth Helper ──────────────────────────────────────────────
async function getAuthUserId(req) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) return null;

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
