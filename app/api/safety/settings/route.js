import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { DEFAULT_SAFETY_SETTINGS, normalizeSafetySettings } from '@/lib/safety';

/**
 * GET /api/safety/settings — own USER interaction controls
 * PUT /api/safety/settings — update own controls
 * Body: { roast_control, comment_control, mention_control, tag_control, message_control, hide_sensitive }
 */
const FIELDS = ['roast_control', 'comment_control', 'mention_control', 'tag_control', 'message_control'];
const OPTIONS = ['everyone', 'people_i_follow', 'followers', 'nobody'];

export async function GET(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const { data } = await auth.client.from('user_safety_settings').select('*').eq('user_id', auth.userId).single();
    return NextResponse.json({ settings: normalizeSafetySettings(data || DEFAULT_SAFETY_SETTINGS) });
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const patch = {};
    for (const f of FIELDS) {
      if (body[f] !== undefined) {
        if (!OPTIONS.includes(body[f])) return NextResponse.json({ error: `Invalid value for ${f}` }, { status: 400 });
        patch[f] = body[f];
      }
    }
    if (body.hide_sensitive !== undefined) patch.hide_sensitive = !!body.hide_sensitive;
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'No settings provided' }, { status: 400 });
    patch.user_id = auth.userId;
    patch.updated_at = new Date().toISOString();
    const { error } = await auth.client.from('user_safety_settings').upsert(patch, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: 'Could not save settings. Please try again.' }, { status: 400 });
    const { data } = await auth.client.from('user_safety_settings').select('*').eq('user_id', auth.userId).single();
    return NextResponse.json({ success: true, settings: normalizeSafetySettings(data || { ...DEFAULT_SAFETY_SETTINGS, ...patch }) });
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
