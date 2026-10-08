import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import {
  getCommunityById, getMemberCounts, getViewerMembership,
  getCommunityTopics, getCommunityRules, canModerate, canManage,
} from '@/lib/communities';

/**
 * GET /api/communities/[id]
 *   Full community detail: community, member_count, topics, rules,
 *   viewer membership state, permission flags, recent activity count.
 *
 * PATCH /api/communities/[id]
 *   Owner-only updates: name, description, avatar_url, cover_url,
 *   visibility (public | private | hidden), topic_slug.
 *   Slugs are stable and never change (stable URLs preserved).
 *
 * DELETE /api/communities/[id]
 *   Owner-only delete. Members/rules/topic links cascade; community posts
 *   (social_posts) keep their canonical records via ON DELETE SET NULL.
 */

export async function GET(req, { params }) {
  try {
    const { searchParams } = new URL(req.url);
    const slugParam = searchParams.get('slug');
    let id = params.id;
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Use the request-scoped client so members can read private communities
    // (RLS: visibility = 'public' OR is_community_member(id)) in the future.
    let community = await client
      .from('communities')
      .select('*')
      .eq('status', 'active')
      .eq('id', id)
      .maybeSingle()
      .then(r => r.data || null);
    if (!community && slugParam) {
      community = await client
        .from('communities')
        .select('*')
        .eq('status', 'active')
        .eq('slug', slugParam)
        .maybeSingle()
        .then(r => r.data || null);
    }
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }
    id = community.id;

    const [counts, membership, topics, rules, activityResult] = await Promise.all([
      getMemberCounts([community.id]),
      getViewerMembership(community.id, userId),
      getCommunityTopics(community.id),
      getCommunityRules(community.id),
      client
        .from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', community.id),
    ]);

    const { data: creator } = await client
      .from('user_profiles')
      .select('username, display_name')
      .eq('id', community.creator_id)
      .maybeSingle();

    const isOwner = membership?.role === 'owner';
    const isModerator = canModerate(membership?.role);
    const isMember = !!membership && membership.membership_status === 'active';

    // Owners see how many join requests await review (private communities).
    let pendingCount = 0;
    if (isOwner) {
      const { count } = await client
        .from('community_members')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', community.id)
        .eq('membership_status', 'pending');
      pendingCount = count || 0;
    }

    return NextResponse.json({
      community: {
        ...community,
        member_count: counts[community.id] || 0,
        activity_count: activityResult.count || 0,
        pending_count: pendingCount,
        creator: creator ? { username: creator.username, displayName: creator.display_name } : null,
      },
      topics,
      rules,
      viewer: {
        userId: userId || null,
        isMember,
        isOwner,
        isModerator,
        role: membership?.role || null,
        membershipStatus: membership?.membership_status || null,
      },
      permissions: {
        canPost: isMember,
        canModerate: isModerator,
        canManage: canManage(membership?.role),
      },
    });
  } catch (err) {
    console.error('[Communities] Detail GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const community = await getCommunityById(id);
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const membership = await getViewerMembership(community.id, userId);
    if (!canManage(membership?.role)) {
      return NextResponse.json({ error: 'Only the community owner can edit this community' }, { status: 403 });
    }

    const body = await req.json();
    const updates = {};

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (name.length < 3 || name.length > 60) {
        return NextResponse.json({ error: 'Name must be 3-60 characters' }, { status: 400 });
      }
      // Name may change; the slug stays stable so URLs never break.
      updates.name = name;
    }

    if (body.description !== undefined) {
      const description = String(body.description || '').trim().slice(0, 300);
      updates.description = description;
    }

    if (body.avatar_url !== undefined) {
      updates.avatar_url = body.avatar_url ? String(body.avatar_url) : null;
    }

    if (body.cover_url !== undefined) {
      updates.cover_url = body.cover_url ? String(body.cover_url) : null;
    }

    if (body.visibility !== undefined) {
      if (!['public', 'private', 'hidden'].includes(body.visibility)) {
        return NextResponse.json({ error: 'Visibility must be public, private, or hidden' }, { status: 400 });
      }
      updates.visibility = body.visibility;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error } = await client
        .from('communities')
        .update(updates)
        .eq('id', community.id);
      if (error) {
        console.error('[Communities] PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update community' }, { status: 500 });
      }
    }

    // Topic association replacement (owner-managed)
    if (body.topic_slug !== undefined) {
      const { data: topic } = await client
        .from('topics')
        .select('id, name, slug')
        .eq('slug', String(body.topic_slug || ''))
        .maybeSingle();
      await client.from('community_topics').delete().eq('community_id', community.id);
      if (topic) {
        await client
          .from('community_topics')
          .insert({ community_id: community.id, topic_id: topic.id });
      }
    }

    const updated = await getCommunityById(community.id);
    const counts = await getMemberCounts([community.id]);
    const topics = await getCommunityTopics(community.id);

    return NextResponse.json({
      success: true,
      community: { ...updated, member_count: counts[community.id] || 0 },
      topics,
    });
  } catch (err) {
    console.error('[Communities] PATCH Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const community = await getCommunityById(id);
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const membership = await getViewerMembership(community.id, userId);
    if (!canManage(membership?.role)) {
      return NextResponse.json({ error: 'Only the community owner can delete this community' }, { status: 403 });
    }

    const { error } = await client.from('communities').delete().eq('id', community.id);
    if (error) {
      console.error('[Communities] DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete community' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Communities] DELETE Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}