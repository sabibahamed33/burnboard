/**
 * BURNBOARD Communities — Core Service
 *
 * Data layer + authorization helpers for the Community system.
 *
 * Architecture:
 *   communities        — the community entity itself
 *   community_members  — real membership with roles (owner/moderator/member)
 *   community_rules    — community-defined rules
 *   topics / community_topics — normalized interest topics
 *   social_posts.community_id — canonical content association (no duplicates)
 *
 * Identity model:
 *   Membership is tied to the authenticated Supabase user (auth.users),
 *   matching follows/comments conventions. Anonymous visitors can view
 *   public communities but cannot join or post.
 *
 * Authorization:
 *   The database (RLS) and this service are the source of truth. The UI
 *   never grants permissions on its own.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ── Constants ────────────────────────────────────────────────

export const COMMUNITY_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin', // accepted in schema, never assignable yet (no distinct permissions)
  MODERATOR: 'moderator',
  MEMBER: 'member',
};

export const ASSIGNABLE_ROLES = ['moderator', 'member'];

export const COMMUNITY_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  HIDDEN: 'hidden',
};

export const COMMUNITY_VISIBILITY_OPTIONS = [
  {
    key: 'public',
    label: 'Public',
    desc: 'Anyone can discover, view, join, and participate.',
  },
  {
    key: 'private',
    label: 'Private',
    desc: 'Anyone with the link can view and request to join. Members approve.',
  },
  {
    key: 'hidden',
    label: 'Hidden',
    desc: 'Invisible in search and discovery. Members only — invite-only access.',
  },
];

export function isPublicCommunity(community) {
  return (community?.visibility || 'public') === COMMUNITY_VISIBILITY.PUBLIC;
}

// Slugs that would collide with existing routes or platform pages
export const RESERVED_SLUGS = [
  'new', 'create', 'c', 'admin', 'mod', 'settings', 'explore', 'search',
  'home', 'feed', 'notifications', 'leaderboards', 'leaderboard', 'battle',
  'weekly', 'top', 'stats', 'terms', 'privacy', 'auth', 'api', 'offline',
  'manifest', 'robots', 'sitemap', 'hot-seat', 'hotseat', 'discover',
  'challenge', 'friend-challenge', 'post', 'u', 'r',
];

export const COMMUNITY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ── Helpers ──────────────────────────────────────────────────

export function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug;
}

export function canModerate(role) {
  return role === COMMUNITY_ROLES.OWNER || role === COMMUNITY_ROLES.ADMIN || role === COMMUNITY_ROLES.MODERATOR;
}

export function canManage(role) {
  return role === COMMUNITY_ROLES.OWNER;
}

// ── Queries ──────────────────────────────────────────────────

/**
 * Get a community by slug (public data only).
 */
export async function getCommunityBySlug(slug) {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Get a community by id.
 */
export async function getCommunityById(id) {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .eq('id', id)
    .eq('status', 'active')
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Real member counts for a batch of community ids (single query, no N+1).
 */
export async function getMemberCounts(communityIds) {
  const counts = {};
  if (!isSupabaseConfigured || !supabase || !communityIds?.length) return counts;

  const { data } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('membership_status', 'active')
    .in('community_id', communityIds);

  for (const m of data || []) {
    counts[m.community_id] = (counts[m.community_id] || 0) + 1;
  }
  return counts;
}

/**
 * Get the viewer's membership for a community (if authenticated).
 */
export async function getViewerMembership(communityId, userId) {
  if (!isSupabaseConfigured || !supabase || !userId) return null;
  const { data } = await supabase
    .from('community_members')
    .select('id, role, membership_status, created_at')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return data;
}

/**
 * Get topics for a community (batched topic lookup — no join hints).
 */
export async function getCommunityTopics(communityId) {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data } = await supabase
    .from('community_topics')
    .select('topic_id')
    .eq('community_id', communityId);

  const rows = data || [];
  if (rows.length === 0) return [];

  const topicIds = rows.map(r => r.topic_id).filter(Boolean);
  const topics = {};
  if (topicIds.length > 0) {
    const { data: topicRows } = await supabase
      .from('topics')
      .select('id, name, slug')
      .in('id', topicIds);
    for (const t of topicRows || []) topics[t.id] = t;
  }

  return rows
    .map(r => topics[r.topic_id])
    .filter(Boolean)
    .map(t => ({ name: t.name, slug: t.slug }));
}

/**
 * Get rules for a community.
 */
export async function getCommunityRules(communityId) {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data } = await supabase
    .from('community_rules')
    .select('id, text')
    .eq('community_id', communityId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  return data || [];
}

/**
 * Get a community's topics (all curated topics for pickers).
 */
export async function getTopics() {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data } = await supabase
    .from('topics')
    .select('name, slug')
    .order('name', { ascending: true });
  return data || [];
}

/**
 * Get communities the user is an active member of (for the create picker).
 * Batched community lookup — no join hints.
 */
export async function getUserCommunities(userId) {
  if (!isSupabaseConfigured || !supabase || !userId) return [];
  const { data } = await supabase
    .from('community_members')
    .select('community_id, role, created_at')
    .eq('user_id', userId)
    .eq('membership_status', 'active')
    .order('created_at', { ascending: false });

  const rows = data || [];
  const communityIds = rows.map(r => r.community_id).filter(Boolean);
  const communities = {};
  if (communityIds.length > 0) {
    const { data: communityRows } = await supabase
      .from('communities')
      .select('id, name, slug, visibility')
      .in('id', communityIds);
    for (const c of communityRows || []) communities[c.id] = c;
  }

  return rows
    .filter(r => communities[r.community_id])
    .map(r => ({
      id: r.community_id,
      role: r.role,
      name: communities[r.community_id].name,
      slug: communities[r.community_id].slug,
      visibility: communities[r.community_id].visibility,
    }));
}

/**
 * Search / list communities. Real data only.
 * sort: 'newest' | 'members'
 */
export async function searchCommunities({ q = '', sort = 'newest', limit = 24, offset = 0, userId = null } = {}) {
  if (!isSupabaseConfigured || !supabase) return { communities: [], total: 0 };

  const fetchLimit = Math.min(limit, 50);
  let query = supabase
    .from('communities')
    .select('*')
    .eq('status', 'active')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchLimit - 1);

  const trimmed = (q || '').trim();
  if (trimmed) {
    // Name-first relevance: exact-ish matches come first (searched separately),
    // then substring matches on name or description.
    const { data: nameMatches } = await supabase
      .from('communities')
      .select('*')
      .eq('status', 'active')
      .eq('visibility', 'public')
      .ilike('name', `%${trimmed}%`)
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    const { data: descMatches } = await supabase
      .from('communities')
      .select('*')
      .eq('status', 'active')
      .eq('visibility', 'public')
      .ilike('description', `%${trimmed}%`)
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    const seen = new Set();
    const merged = [];
    for (const c of [...(nameMatches || []), ...(descMatches || [])]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push(c);
      }
    }
    // Exact slug or exact name first (relevance, not member count)
    merged.sort((a, b) => {
      const aExact = a.slug === trimmed || a.name.toLowerCase() === trimmed.toLowerCase() ? 0 : 1;
      const bExact = b.slug === trimmed || b.name.toLowerCase() === trimmed.toLowerCase() ? 0 : 1;
      return aExact - bExact;
    });

    const counts = await getMemberCounts(merged.map(c => c.id));
    const viewerIds = new Set();
    if (userId) {
      const { data: memberships } = await supabase
        .from('community_members')
        .select('community_id, role')
        .eq('user_id', userId)
        .eq('membership_status', 'active')
        .in('community_id', merged.map(c => c.id));
      for (const m of memberships || []) viewerIds.add(m.community_id);
    }

    return {
      communities: merged.slice(0, fetchLimit).map(c => ({
        ...c,
        member_count: counts[c.id] || 0,
        viewer_membership: viewerIds.has(c.id) ? { isMember: true } : null,
      })),
      total: merged.length,
    };
  }

  const { data, error, count } = await query;
  if (error) return { communities: [], total: 0 };

  const counts = await getMemberCounts((data || []).map(c => c.id));

  let viewerMemberships = {};
  if (userId) {
    const { data: memberships } = await supabase
      .from('community_members')
      .select('community_id, role')
      .eq('user_id', userId)
      .eq('membership_status', 'active')
      .in('community_id', (data || []).map(c => c.id));
    for (const m of memberships || []) {
      viewerMemberships[m.community_id] = m;
    }
  }

  let communities = (data || []).map(c => ({
    ...c,
    member_count: counts[c.id] || 0,
    viewer_membership: viewerMemberships[c.id]
      ? { isMember: true, role: viewerMemberships[c.id].role }
      : null,
  }));

  if (sort === 'members') {
    communities = [...communities].sort((a, b) => b.member_count - a.member_count);
  }

  return { communities, total: count || communities.length };
}

/**
 * Community feed — reuses the canonical social_posts table so reactions,
 * comments, moderation state and the author record stay unified.
 * Items are shaped exactly like /api/feed items so FeedCard works unchanged.
 *
 * Author profiles and polls are fetched in batched queries (no N+1).
 *
 * sort: 'new' (default, chronological) | 'top' (engagement first)
 * mediaOnly: only posts with an attached photo
 */
export async function getCommunityFeed(communityId, { limit = 20, cursor = null, sort = 'new', mediaOnly = false } = {}) {
  if (!isSupabaseConfigured || !supabase) return { items: [], nextCursor: null };

  let query = supabase
    .from('social_posts')
    .select('*')
    .eq('community_id', communityId)
    .limit(limit + 1);

  if (mediaOnly) {
    query = query.not('media_url', 'is', null);
  }

  if (sort === 'top') {
    // Engagement-first: most-reacted posts surface, newest breaks ties.
    // Cursor paging on mixed sort is unreliable, so Top is first-page only.
    query = query
      .order('upvote_count', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
    if (cursor) {
      query = query.lt('created_at', cursor);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error('[Communities] Feed error:', error);
    return { items: [], nextCursor: null };
  }

  const hasMore = (data || []).length > limit;
  const posts = hasMore ? data.slice(0, limit) : data || [];

  // Batch fetch author profiles
  const authorIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
  const profiles = {};
  if (authorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url, bio')
      .in('id', authorIds);
    for (const p of profileRows || []) profiles[p.id] = p;
  }

  // Batch fetch polls
  const pollPostIds = posts.filter(p => p.content_type === 'poll').map(p => p.id);
  const polls = {};
  if (pollPostIds.length > 0) {
    const { data: pollRows } = await supabase
      .from('polls')
      .select('*')
      .in('post_id', pollPostIds);
    for (const poll of pollRows || []) polls[poll.post_id] = poll;
  }

  const items = posts.map(p => buildFeedItem(p, profiles[p.user_id], polls[p.id]));

  // Top is a snapshot sort with no stable cursor — first page only.
  // Chronological sorts (New, Media) paginate normally via created_at.
  const nextCursor = sort === 'new' && hasMore && items.length > 0
    ? items[items.length - 1].createdAt
    : null;

  return { items, nextCursor };
}

/**
 * Transform a social_posts row into a FeedCard-ready item.
 */
export function buildFeedItem(post, profile = null, poll = null) {
  return {
    id: post.id,
    type: post.content_type,
    text: post.content_text,
    mediaUrl: post.media_url,
    context: post.metadata?.context || null,
    communityId: post.community_id,
    author: {
      id: profile?.id,
      username: profile?.username,
      displayName: profile?.display_name,
      avatarLetter: profile?.username?.[0]?.toUpperCase() || '?',
      avatarColor: null,
      tagline: profile?.bio,
    },
    reactions: { funny: 0, savage: 0, fatal: 0 },
    totalReactions: 0,
    upvotes: post.upvote_count || 0,
    userId: post.user_id,
    createdAt: post.created_at,
    poll: poll || null,
  };
}

/**
 * Paginated member list (batched profile lookup — no N+1, no join hints).
 * status: 'active' (default) | 'suspended' (moderation review — callers must
 * verify the viewer may moderate before requesting it).
 */
export async function listCommunityMembers(communityId, { limit = 24, offset = 0, viewerId = null, status = 'active' } = {}) {
  if (!isSupabaseConfigured || !supabase) return { members: [], total: 0, hasMore: false };
  if (!['active', 'suspended'].includes(status)) status = 'active';

  const [listResult, countResult] = await Promise.all([
    supabase
      .from('community_members')
      .select('user_id, role, created_at, membership_status')
      .eq('community_id', communityId)
      .eq('membership_status', status)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1),
    supabase
      .from('community_members')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .eq('membership_status', status),
  ]);

  const rows = listResult.data || [];

  // Batch fetch profiles for this page of members
  const userIds = rows.map(m => m.user_id).filter(Boolean);
  const profiles = {};
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);
    for (const p of profileRows || []) profiles[p.id] = p;
  }

  const members = rows
    .filter(m => profiles[m.user_id])
    .map(m => ({
      id: m.user_id,
      role: m.role,
      status: m.membership_status,
      joinedAt: m.created_at,
      username: profiles[m.user_id].username,
      displayName: profiles[m.user_id].display_name,
      avatarUrl: profiles[m.user_id].avatar_url,
      isViewer: viewerId ? m.user_id === viewerId : false,
    }));

  return {
    members,
    total: countResult.count || 0,
    hasMore: rows.length === limit,
  };
}

/**
 * Pending join requests for a community (private-community approvals).
 * Callers must verify the viewer manages the community (owner-only).
 * Batched profile lookup — no N+1.
 */
export async function listPendingRequests(communityId, { limit = 50 } = {}) {
  if (!isSupabaseConfigured || !supabase) return { requests: [], total: 0 };

  const { data: rows, count } = await supabase
    .from('community_members')
    .select('user_id, created_at', { count: 'exact' })
    .eq('community_id', communityId)
    .eq('membership_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  const userIds = (rows || []).map(r => r.user_id).filter(Boolean);
  const profiles = {};
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds);
    for (const p of profileRows || []) profiles[p.id] = p;
  }

  return {
    requests: (rows || [])
      .filter(r => profiles[r.user_id])
      .map(r => ({
        id: r.user_id,
        username: profiles[r.user_id].username,
        displayName: profiles[r.user_id].display_name,
        avatarUrl: profiles[r.user_id].avatar_url,
        requestedAt: r.created_at,
      })),
    total: count || 0,
  };
}

/**
 * Check membership (for posting validation and visibility checks).
 */
export async function isActiveMember(communityId, userId) {
  if (!isSupabaseConfigured || !supabase || !userId) return false;
  const membership = await getViewerMembership(communityId, userId);
  return !!membership && membership.membership_status === 'active';
}

/**
 * Get owner user ids of a community (for notifications).
 */
export async function getCommunityOwners(communityId) {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data } = await supabase
    .from('community_members')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('role', 'owner')
    .eq('membership_status', 'active');
  return (data || []).map(m => m.user_id);
}