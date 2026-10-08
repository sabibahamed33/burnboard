import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * GET /api/account/notifications — own notification preferences.
 * PUT /api/account/notifications — update own preferences (whitelist only).
 *
 * Columns live on user_profiles (existing preference fields). Safety and
 * critical account notices are NOT disableable — there is no toggle for
 * them anywhere, by design.
 */
const PREF_COLUMNS = [
  'follow_alerts',
  'roast_alerts',
  'dm_alerts',
  'upvote_alerts',
  'levelup_alerts',
  'battle_alerts',
  'push_enabled',
  'email_notifications',
];

export async function GET(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const { data } = await auth.client
      .from('user_profiles')
      .select(PREF_COLUMNS.join(','))
      .eq('id', auth.userId)
      .single();
    const prefs = {};
    for (const c of PREF_COLUMNS) prefs[c] = data?.[c] ?? true;
    return NextResponse.json({ prefs });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const patch = {};
    for (const c of PREF_COLUMNS) {
      if (body[c] !== undefined) patch[c] = !!body[c];
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'No preferences provided' }, { status: 400 });
    const { error } = await auth.client.from('user_profiles').update(patch).eq('id', auth.userId);
    if (error) return NextResponse.json({ error: 'Could not save preferences.' }, { status: 400 });
    return NextResponse.json({ success: true, prefs: patch });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
