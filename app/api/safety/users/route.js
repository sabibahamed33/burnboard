import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import {
  isPlatformModeratorClient,
  moderatorRestrictUser,
  moderatorLiftRestriction,
  moderatorSetBan,
} from '@/lib/safety';

/**
 * Platform moderator user management (Master Prompt 11).
 *
 * POST /api/safety/users
 *   { action: 'restrict', user_id, action_type, reason, expires_at? }
 *   { action: 'lift_restriction', user_id, action_type }
 *   { action: 'ban', user_id, reason? } | { action: 'unban', user_id, reason? }
 *
 * All actions are moderator-session-gated at the DB (definer RPCs), persist
 * real restriction rows, and write audit + safety events. Restricting a
 * user never removes content; bans hide content via existing profile rules.
 */

const VALID_RESTRICTION_TYPES = ['post', 'comment', 'community_create', 'community_join', 'challenge_create', 'invite', 'battle', 'report', 'all'];

/**
 * GET /api/safety/users?ids=a,b,c — safe public username lookup for the
 * signed-in USER's own block/mute lists. Returns only id + username +
 * display_name (never email, phone, or private fields).
 */
export async function GET(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (!ids.length) return NextResponse.json({ users: [] });
    const { data } = await auth.client.from('user_profiles').select('id, username, display_name').in('id', ids);
    return NextResponse.json({ users: data || [] });
  } catch {
    return NextResponse.json({ users: [] });
  }
}

export async function POST(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    if (!(await isPlatformModeratorClient(auth.client))) {
      return NextResponse.json({ error: 'Unauthorized — moderator account required' }, { status: 403 });
    }

    const body = await request.json();
    const { action, user_id: userId, action_type, reason, expires_at } = body;

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    switch (action) {
      case 'restrict': {
        if (!VALID_RESTRICTION_TYPES.includes(action_type)) {
          return NextResponse.json({ error: 'Invalid restriction type' }, { status: 400 });
        }
        const result = await moderatorRestrictUser(auth.client, userId, action_type, reason, expires_at || null);
        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json({ success: true, action, action_type });
      }
      case 'lift_restriction': {
        if (!VALID_RESTRICTION_TYPES.includes(action_type)) {
          return NextResponse.json({ error: 'Invalid restriction type' }, { status: 400 });
        }
        const result = await moderatorLiftRestriction(auth.client, userId, action_type);
        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json({ success: true, action, action_type });
      }
      case 'ban':
      case 'unban': {
        const result = await moderatorSetBan(auth.client, userId, action === 'ban', reason || null);
        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json({ success: true, action });
      }
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'restrict', 'lift_restriction', 'ban', or 'unban'" },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error('[Safety] Users error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
