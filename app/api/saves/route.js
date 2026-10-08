import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { instrumentHandler } from '@/lib/metrics';

/**
 * GET /api/saves?post_id=... — whether the signed-in user saved a post.
 * GET /api/saves?limit=&offset= — the user's saved posts (newest first).
 * POST /api/saves { post_id, action: 'save' | 'unsave' }
 *
 * Saves are private to the saver. Saving a post the viewer cannot see is
 * refused (no probing private posts via the save endpoint).
 */

function missingTable(err) {
  const msg = `${err?.message || ''} ${err?.code || ''}`;
  return /relation .* does not exist|42P01/i.test(msg);
}

async function getHandler(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('post_id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    if (postId) {
      const { data, error } = await client
        .from('post_saves')
        .select('id')
        .eq('user_id', userId)
        .eq('post_id', postId)
        .maybeSingle();
      if (error && missingTable(error)) {
        return NextResponse.json({ error: 'Saving is unavailable right now.' }, { status: 503 });
      }
      return NextResponse.json({ success: true, saved: !!data });
    }

    const { data, error } = await client
      .from('post_saves')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      if (missingTable(error)) {
        return NextResponse.json({ error: 'Saving is unavailable right now.' }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ success: true, saves: data || [] });
  } catch (err) {
    console.error('[Saves] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postHandler(req) {
  try {
    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'saves_ip'), RATE_LIMITS.API_READ);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error }, { status: 429 });
    }

    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const { post_id, action } = body || {};
    if (!post_id || !['save', 'unsave'].includes(action)) {
      return NextResponse.json({ error: 'Missing post_id or action (save|unsave)' }, { status: 400 });
    }

    if (action === 'save') {
      // Only saveable when visible to the saver (RLS already hides
      // non-public rows from unauthorized readers; double-check here so a
      // forged id can't probe private posts).
      const { data: post } = await client.from('social_posts').select('id').eq('id', post_id).maybeSingle();
      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }
      const { error } = await client.from('post_saves').insert({ user_id: userId, post_id });
      if (error && error.code !== '23505') {
        if (missingTable(error)) {
          return NextResponse.json({ error: 'Saving is unavailable right now.' }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to save post' }, { status: 500 });
      }
      return NextResponse.json({ success: true, saved: true });
    }

    const { error } = await client.from('post_saves').delete().eq('user_id', userId).eq('post_id', post_id);
    if (error) {
      return NextResponse.json({ error: 'Failed to remove saved post' }, { status: 500 });
    }
    return NextResponse.json({ success: true, saved: false });
  } catch (err) {
    console.error('[Saves] POST Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = instrumentHandler('saves', getHandler);
export const POST = instrumentHandler('saves', postHandler);
