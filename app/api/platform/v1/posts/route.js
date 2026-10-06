import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  authenticatePlatformRequest, hasScope, checkAppRateLimit,
  unauthorized, missingScope, rateLimited,
} from '@/lib/platform';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getClient() {
  return supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
}

const VALID_TYPES = ['opinion', 'question', 'hot_take'];

/**
 * POST /api/platform/v1/posts
 *
 * Publish a post AS the granting user (explicit consent, `content.publish`
 * scope). Subject to the exact same safety rules and per-user restrictions
 * as first-party publishing — third parties can never bypass moderation or
 * blocking. Supports text content types only in v1 (media/polls later).
 *
 *   Authorization: Bearer <access token>
 *   { content_type, text, visibility? }
 */
export async function POST(req) {
  try {
    const client = getClient();
    if (!client) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

    const session = await authenticatePlatformRequest(client, req);
    if (!session) return NextResponse.json(unauthorized(), { status: 401 });
    if (!hasScope(session, 'content.publish')) {
      return NextResponse.json(missingScope('content.publish'), { status: 403 });
    }

    const rl = checkAppRateLimit(session.appId, session.status);
    if (!rl.ok) {
      return NextResponse.json(rateLimited(rl.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const { content_type, text, visibility } = body;
    if (!content_type || !VALID_TYPES.includes(content_type)) {
      return NextResponse.json({ error: `Invalid content_type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!text || !text.trim()) return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
    if (text.length > 500) return NextResponse.json({ error: 'Text must be 500 characters or less' }, { status: 400 });
    if (visibility && !['public', 'followers'].includes(visibility)) {
      return NextResponse.json({ error: "visibility must be 'public' or 'followers'" }, { status: 400 });
    }

    // Safety first: deterministic policy + per-user restriction check run
    // server-side exactly as the first-party path does. The subject's
    // restriction state is read via the service client so the check targets
    // the consenting user (not the API caller's session).
    const { runDeterministicPolicy } = await import('@/lib/safety');
    const policy = runDeterministicPolicy(text.trim());
    if (policy.blocked) {
      const finding = policy.findings?.find(f => f.action === 'block');
      return NextResponse.json(
        { error: finding?.reason || 'This content violates BurnBoard safety policy' },
        { status: 400 }
      );
    }

    const { data: banned } = await client
      .from('user_profiles')
      .select('is_banned')
      .eq('id', session.subjectId)
      .single();
    if (banned?.is_banned) {
      return NextResponse.json({ error: 'Your account is currently restricted from posting' }, { status: 403 });
    }
    // Blocked accounts: is_banned is authoritative on the profile.
    const { data: restriction } = await client
      .from('user_restrictions')
      .select('id, expires_at')
      .eq('user_id', session.subjectId)
      .eq('active', true)
      .in('action_type', ['all', 'post'])
      .limit(1)
      .maybeSingle();
    if (restriction) {
      const expired = restriction.expires_at && new Date(restriction.expires_at) <= new Date();
      if (!expired) {
        return NextResponse.json({ error: 'Your account is currently restricted from posting' }, { status: 403 });
      }
    }

    const { data: post, error: postError } = await client
      .from('social_posts')
      .insert({
        user_id: session.subjectId,
        content_type,
        content_text: text.trim(),
        visibility: visibility || 'public',
        metadata: {
          context: 'published_via_platform_api',
          app_id: session.appId,
        },
      })
      .select('id, content_type, content_text, visibility, created_at')
      .single();

    if (postError) {
      console.error('[Platform v1] Publish error:', postError);
      return NextResponse.json({ error: 'failed_to_publish' }, { status: 500 });
    }

    // Fire the platform webhook event (content.published) for subscribed apps.
    try {
      await client.rpc('queue_webhook_event', {
        p_event_type: 'content.published',
        p_payload: {
          post_id: post.id,
          author_id: session.subjectId,
          content_type: post.content_type,
          visibility: post.visibility,
          published_at: post.created_at,
          via_app: session.appId,
        },
        p_subject_id: session.subjectId,
        p_event_id: `content_${post.id}`,
      });
    } catch (e) {
      console.warn('[Platform v1] Webhook queue skipped:', e?.message || e);
    }

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (err) {
    console.error('[Platform v1] posts error:', err?.message || err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * GET /api/platform/v1/posts?cursor=&limit=
 *
 * The granting user's PUBLIC posts (content.read scope). Cursor-paginated,
 * no private/community-restricted content, no deleted content.
 */
export async function GET(req) {
  try {
    const client = getClient();
    if (!client) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

    const session = await authenticatePlatformRequest(client, req);
    if (!session) return NextResponse.json(unauthorized(), { status: 401 });
    if (!hasScope(session, 'content.read')) {
      return NextResponse.json(missingScope('content.read'), { status: 403 });
    }

    const rl = checkAppRateLimit(session.appId, session.status);
    if (!rl.ok) {
      return NextResponse.json(rateLimited(rl.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50);
    const cursor = searchParams.get('cursor');

    let query = client
      .from('social_posts')
      .select('id, content_type, content_text, visibility, reaction_count, comment_count, created_at')
      .eq('user_id', session.subjectId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt('created_at', cursor);

    const { data: posts, error } = await query;
    if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 });

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && page.length ? page[page.length - 1].created_at : null;

    return NextResponse.json({
      data: page.map(p => ({
        id: p.id,
        content_type: p.content_type,
        text: p.content_text,
        visibility: p.visibility,
        reaction_count: p.reaction_count || 0,
        comment_count: p.comment_count || 0,
        created_at: p.created_at,
      })),
      meta: { next_cursor: nextCursor },
    });
  } catch (err) {
    console.error('[Platform v1] posts list error:', err?.message || err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}