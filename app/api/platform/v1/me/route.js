import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  authenticatePlatformRequest, hasScope, checkAppRateLimit,
  unauthorized, missingScope, rateLimited,
} from '@/lib/platform';

/**
 * GET /api/platform/v1/me
 *
 * The public profile of the granting (consenting) user. Requires the
 * `profile.read` scope. Never returns private data: username, display name,
 * bio, avatar, follower count only. Blocking/privacy boundaries are the
 * user's own settings — the app acts as the user, not around them.
 *
 *   Authorization: Bearer <access token issued via grant_app_access>
 */
export async function GET(req) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

    const client = createClient(supabaseUrl, supabaseKey);
    const session = await authenticatePlatformRequest(client, req);
    if (!session) return NextResponse.json(unauthorized(), { status: 401 });
    if (!hasScope(session, 'profile.read')) return NextResponse.json(missingScope('profile.read'), { status: 403 });

    const rl = checkAppRateLimit(session.appId, session.status);
    if (!rl.ok) {
      return NextResponse.json(rateLimited(rl.retryAfterSeconds), {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      });
    }

    const { data: profile } = await client
      .from('user_profiles')
      .select('username, display_name, bio, avatar_url, follower_count, created_at')
      .eq('id', session.subjectId)
      .single();

    if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    return NextResponse.json({
      data: {
        username: profile.username,
        display_name: profile.display_name,
        bio: profile.bio,
        avatar_url: profile.avatar_url,
        follower_count: profile.follower_count || 0,
        member_since: profile.created_at,
      },
      meta: {
        app: session.appName,
        scopes: session.scopes,
        subject: session.subjectId,
      },
    });
  } catch (err) {
    console.error('[Platform v1] /me error:', err?.message || err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}