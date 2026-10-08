import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { DM_PRIVACY } from '@/lib/dm';

const ALLOWED = [DM_PRIVACY.EVERYONE, DM_PRIVACY.FOLLOWS, DM_PRIVACY.NONE];

/**
 * GET /api/dm/privacy → { dm_privacy }
 * PUT /api/dm/privacy { dm_privacy } → who may start new conversations.
 *
 * Only gates NEW threads — existing active conversations keep working if
 * the setting tightens later. Stored on the viewer's own profile row.
 */
export async function GET(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const { data } = await client
      .from('user_profiles')
      .select('dm_privacy')
      .eq('id', userId)
      .maybeSingle();
    return NextResponse.json({ dm_privacy: data?.dm_privacy || DM_PRIVACY.EVERYONE });
  } catch (err) {
    console.error('[DM] Privacy GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const body = await req.json();
    const { dm_privacy } = body;
    if (!ALLOWED.includes(dm_privacy)) {
      return NextResponse.json({ error: 'Invalid privacy setting' }, { status: 400 });
    }
    const { error } = await client
      .from('user_profiles')
      .update({ dm_privacy })
      .eq('id', userId);
    if (error) {
      console.error('[DM] Privacy PUT error:', error);
      return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 });
    }
    return NextResponse.json({ success: true, dm_privacy });
  } catch (err) {
    console.error('[DM] Privacy PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
