import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { checkRateLimit, ipKey, RATE_LIMITS, getClientIp } from '@/lib/serverRateLimit';
import {
  isChallengeType,
  isValidEndsAt,
  listChallenges,
} from '@/lib/challenges';

/**
 * GET /api/challenges
 *   ?scope=active|newest|trending|mine|invites|community
 *   &community=<slug|id>   (for scope=community)
 *   &limit= &cursor=
 *
 * POST /api/challenges
 *   { title, description, challenge_type, ends_at, community_id? }
 *   Auth required. Rate limited (3/hr per user + IP).
 *   Community challenges require active membership in that community.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'active';
    const community = searchParams.get('community');
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 50);
    const cursor = searchParams.get('cursor');

    const auth = await getRequestContext(req);

    const result = await listChallenges({
      scope,
      community,
      client: auth.client,
      viewerUserId: auth.userId,
      limit,
      cursor,
    });

    return NextResponse.json({
      challenges: result.challenges,
      total: result.total,
      scope,
    });
  } catch (err) {
    console.error('[Challenges] List error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const auth = await getRequestContext(req);
    if (!auth.client || !auth.userId) {
      return NextResponse.json({ error: 'Sign in to create a challenge' }, { status: 401 });
    }
    const client = auth.client;

    const body = await req.json();
    const { title, description, challenge_type, ends_at, community_id } = body;

    // ── Validation ────────────────────────────────────────────
    const cleanTitle = String(title || '').trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 120) {
      return NextResponse.json(
        { error: 'Title must be between 3 and 120 characters' },
        { status: 400 }
      );
    }

    const cleanDescription = String(description || '').trim();
    if (cleanDescription.length > 500) {
      return NextResponse.json(
        { error: 'Description must be 500 characters or less' },
        { status: 400 }
      );
    }

    if (!isChallengeType(challenge_type)) {
      return NextResponse.json(
        { error: `challenge_type must be one of: opinion, question, poll, photo, hot_take` },
        { status: 400 }
      );
    }

    if (!isValidEndsAt(ends_at)) {
      return NextResponse.json(
        { error: 'ends_at must be between 1 hour and 14 days from now' },
        { status: 400 }
      );
    }

    // ── Rate limit: per user + per IP (anti-challenge-spam) ───
    const [userCheck, ipCheck] = [
      checkRateLimit(ipKey(auth.userId, 'challenge_create_user'), RATE_LIMITS.CHALLENGE_CREATE),
      checkRateLimit(ipKey(getClientIp(req), 'challenge_create_ip'), RATE_LIMITS.CHALLENGE_CREATE),
    ];
    if (!userCheck.allowed || !ipCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many challenges created — please wait before creating another.' },
        { status: 429 }
      );
    }

    // ── Community challenges: membership + posting eligibility ──
    let resolvedCommunityId = null;
    if (community_id) {
      const { data: community } = await client
        .from('communities')
        .select('id, slug, visibility, status')
        .eq('id', community_id)
        .maybeSingle();

      if (!community || community.status !== 'active') {
        return NextResponse.json({ error: 'Community not found' }, { status: 404 });
      }
      if (community.visibility !== 'public') {
        return NextResponse.json(
          { error: 'This community does not host challenges' },
          { status: 403 }
        );
      }

      const { data: membership } = await client
        .from('community_members')
        .select('id')
        .eq('community_id', community_id)
        .eq('user_id', auth.userId)
        .eq('membership_status', 'active')
        .maybeSingle();

      if (!membership) {
        return NextResponse.json(
          { error: 'Join the community before hosting a challenge there' },
          { status: 403 }
        );
      }
      resolvedCommunityId = community_id;
    }

    // ── Unique slug generation (stable shareable URL) ─────────
    const slug = await generateUniqueSlug(client, cleanTitle);

    const { data: challenge, error } = await client
      .from('challenges')
      .insert({
        title: cleanTitle,
        description: cleanDescription,
        challenge_type,
        ends_at: ends_at ? new Date(ends_at).toISOString() : null,
        community_id: resolvedCommunityId,
        creator_id: auth.userId,
        status: 'active',
        visibility: 'public',
        slug,
      })
      .select('id, slug, title, challenge_type')
      .single();

    if (error) {
      console.error('[Challenges] Create error:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A challenge with that title already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
    }

    // Growth analytics (non-critical)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/growth/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'challenge_created',
          subjectId: auth.userId,
          metadata: { challengeId: challenge.id, type: challenge.challenge_type },
        }),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      challenge: {
        id: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        url: `/challenges/${challenge.slug}`,
      },
    });
  } catch (err) {
    console.error('[Challenges] Create error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function generateUniqueSlug(client, title) {
  const base = String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);

  let candidate = base || 'challenge';
  for (let i = 0; i < 10; i++) {
    if (i > 0) candidate = `${base}-${i + 1}`;
    const { data } = await client
      .from('challenges')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Extremely unlikely; add random suffix as last resort
  return `${base}-${Date.now().toString(36)}`;
}
