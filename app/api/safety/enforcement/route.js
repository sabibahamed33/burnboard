import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { isPlatformModeratorClient, moderatorRestrictUser, moderatorLiftRestriction, moderatorSetBan } from '@/lib/safety';

/**
 * POST /api/safety/enforcement — platform safety staff only (NOT public).
 * Actions: warn | restrict | lift | suspend | unsuspend | ban | unban
 * Body: { userId, action, actionType?, reason?, expiresAt?, note? }
 *
 * Warn/restrict/suspend/ban create a USER-facing notification with
 * reason + duration + appeal path (no reporter info, no internal logic).
 * Every action is audited server-side via definer RPCs.
 */
const RESTRICT_TYPES = ['post', 'comment', 'community_create', 'community_join', 'challenge_create', 'invite', 'battle', 'report', 'all'];

async function notifyUser(client, userId, title, body) {
  try {
    await client.from('notifications').insert({
      user_id: userId,
      type: 'safety_notice',
      title,
      body,
      metadata: { category: 'safety' },
    });
  } catch {}
}

export async function POST(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (!(await isPlatformModeratorClient(auth.client))) {
      return NextResponse.json({ error: 'Unauthorized — safety staff only' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const { userId, action, actionType, reason, expiresAt, note } = body;
    if (!userId || !action) return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });

    if (action === 'warn') {
      await notifyUser(auth.client, userId, 'A note from the safety team',
        `${reason || 'Your recent activity broke a community rule.'} Further issues may limit your account. You can appeal from Safety & Privacy.`);
      try {
        await auth.client.from('moderation_actions').insert({
          action_type: 'restrict_profile', target_type: 'user', target_id: userId,
          new_state: 'warned', policy_category: 'safety', moderator_id: auth.userId, moderator_note: reason || note || 'warned',
        });
      } catch {}
      return NextResponse.json({ success: true, action: 'warn' });
    }

    if (action === 'restrict') {
      if (!RESTRICT_TYPES.includes(actionType)) return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 });
      const r = await moderatorRestrictUser(auth.client, userId, actionType, reason || note || null, expiresAt || null);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      const dur = expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : ' for now';
      await notifyUser(auth.client, userId, 'Your account was restricted',
        `You can't ${actionType} ${dur}. Reason: ${reason || 'a rule violation'}. You can appeal from Safety & Privacy.`);
      return NextResponse.json({ success: true, action: 'restrict' });
    }

    if (action === 'lift') {
      if (!RESTRICT_TYPES.includes(actionType)) return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 });
      const r = await moderatorLiftRestriction(auth.client, userId, actionType);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      await notifyUser(auth.client, userId, 'Good news — restriction lifted', `Your ${actionType} access was restored.`);
      return NextResponse.json({ success: true, action: 'lift' });
    }

    if (action === 'suspend' || action === 'ban') {
      const r = await moderatorSetBan(auth.client, userId, true, reason || note || null);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      await notifyUser(auth.client, userId, 'Your account was suspended',
        `${reason || 'Repeated or serious rule violations.'} You can appeal from Safety & Privacy.`);
      return NextResponse.json({ success: true, action });
    }

    if (action === 'unsuspend' || action === 'unban') {
      const r = await moderatorSetBan(auth.client, userId, false, reason || note || null);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      await notifyUser(auth.client, userId, 'Your account was restored', 'You can use BurnBoard normally again.');
      return NextResponse.json({ success: true, action });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
