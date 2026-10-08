import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import {
  slugify, RESERVED_SLUGS, COMMUNITY_SLUG_PATTERN,
  getMemberCounts, searchCommunities, getUserCommunities, getCommunityBySlug,
} from '@/lib/communities';
import { checkRateLimit, ipKey, RATE_LIMITS, getClientIp } from '@/lib/serverRateLimit';

/**
 * GET /api/communities
 *   - ?slug=xxx             → single community (with real member count + viewer state)
 *   - ?q=xxx&sort=&limit=&offset= → search/list communities (real data only)
 *   - ?mine=true            → communities the authenticated user is a member of
 *
 * POST /api/communities
 *   Create a community. Requires authentication. Rate-limited.
 *   Body: { name, description?, topic_slug?, avatar_url?, visibility? }
 *   visibility: 'public' | 'private' | 'hidden' (default 'public').
 *   Private: discoverable by link, join requires approval.
 *   Hidden: invisible in search/discovery, members-only access.
 *   The founding user automatically becomes the Owner (a USER with a
 *   management role — there is no separate Creator account type).
 */

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Single community by slug
    const slug = searchParams.get('slug');
    if (slug) {
      const community = await getCommunityBySlug(slug);
      if (!community) {
        return NextResponse.json({ error: 'Community not found' }, { status: 404 });
      }
      const counts = await getMemberCounts([community.id]);
      const { data: membership } = await client
        .from('community_members')
        .select('role, membership_status')
        .eq('community_id', community.id)
        .eq('user_id', userId || '')
        .maybeSingle();

      return NextResponse.json({
        community: {
          ...community,
          member_count: counts[community.id] || 0,
          viewer_membership: membership
            ? { isMember: membership.membership_status === 'active', role: membership.role }
            : null,
        },
      });
    }

    // User's own communities
    if (searchParams.get('mine') === 'true') {
      const communities = await getUserCommunities(userId);
      return NextResponse.json({ communities });
    }

    // Search / list
    const q = searchParams.get('q') || '';
    const sort = searchParams.get('sort') || 'newest';
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const result = await searchCommunities({ q, sort, limit, offset, userId });
    return NextResponse.json({ ...result, limit, offset });
  } catch (err) {
    console.error('[Communities] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'Sign in to create a community' }, { status: 401 });
    }

    // Rate limit community creation (per IP + per user)
    const ip = getClientIp(req);
    const ipLimit = checkRateLimit(ipKey(ip, 'community_create'), RATE_LIMITS.COMMUNITY_CREATE);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Creating communities too quickly. Try again later.' },
        { status: 429 }
      );
    }
    const userLimit = checkRateLimit(`user:${userId}:community_create`, RATE_LIMITS.COMMUNITY_CREATE);
    if (!userLimit.allowed) {
      return NextResponse.json(
        { error: 'Creating communities too quickly. Try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { name, description, topic_slug, avatar_url, visibility } = body;

    // ── Validation ──────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 60) {
      return NextResponse.json(
        { error: 'Community name must be 3-60 characters' },
        { status: 400 }
      );
    }

    const cleanName = name.trim();
    const slug = slugify(cleanName);
    if (slug.length < 3 || slug.length > 40) {
      return NextResponse.json(
        { error: 'Community name must produce a slug of 3-40 characters' },
        { status: 400 }
      );
    }
    if (!COMMUNITY_SLUG_PATTERN.test(slug)) {
      return NextResponse.json(
        { error: 'Community name can only contain letters, numbers, and spaces' },
        { status: 400 }
      );
    }
    if (RESERVED_SLUGS.includes(slug)) {
      return NextResponse.json(
        { error: 'That community name is reserved. Try another.' },
        { status: 400 }
      );
    }

    const cleanDescription = typeof description === 'string' ? description.trim().slice(0, 300) : '';

    const cleanVisibility = ['public', 'private', 'hidden'].includes(visibility)
      ? visibility
      : 'public';

    // Duplicate prevention (unique slug)
    const { data: existing } = await client
      .from('communities')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'A community with that name already exists' },
        { status: 409 }
      );
    }

    // ── Create community ────────────────────────────────────
    const { data: community, error: createError } = await client
      .from('communities')
      .insert({
        name: cleanName,
        slug,
        description: cleanDescription,
        avatar_url: avatar_url || null,
        visibility: cleanVisibility,
        creator_id: userId,
      })
      .select()
      .single();

    if (createError) {
      console.error('[Communities] Create error:', createError);
      return NextResponse.json(
        { error: 'Failed to create community' },
        { status: 500 }
      );
    }

    // The founding user becomes Owner (real membership row — a management
    // role on a normal USER account, not a separate account type)
    const { error: memberError } = await client
      .from('community_members')
      .insert({
        community_id: community.id,
        user_id: userId,
        role: 'owner',
        membership_status: 'active',
      });

    if (memberError) {
      console.error('[Communities] Owner membership error:', memberError);
      // Community created but ownership row failed — clean up the community
      await client.from('communities').delete().eq('id', community.id);
      return NextResponse.json(
        { error: 'Failed to finalize community' },
        { status: 500 }
      );
    }

    // Optional topic association (curated topics only)
    if (topic_slug) {
      const { data: topic } = await client
        .from('topics')
        .select('id, name, slug')
        .eq('slug', topic_slug)
        .maybeSingle();
      if (topic) {
        await client
          .from('community_topics')
          .insert({ community_id: community.id, topic_id: topic.id })
          .then(() => {})
          .catch(() => {});
      }
    }

    // ── Non-critical hooks ──────────────────────────────────
    // Burn Rep for creating a community
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          event_type: 'community_created',
          source_type: 'community',
          source_id: community.id,
        }),
      });
    } catch (e) {}

    // Growth analytics event
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/growth/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'community_created',
          subjectId: userId,
          metadata: { communityId: community.id },
        }),
      });
    } catch (e) {}

    return NextResponse.json({
      success: true,
      community: {
        ...community,
        member_count: 1,
        viewer_membership: { isMember: true, role: 'owner' },
      },
    });
  } catch (err) {
    console.error('[Communities] POST Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}