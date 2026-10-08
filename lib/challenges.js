/**
 * BURNBOARD Challenges — Core Service (Master Prompt 9)
 *
 * Data layer + authorization helpers for the Challenge system.
 *
 * Architecture:
 *   challenges             — time-boxed, type-specific participation prompts
 *   challenge_participants — real authenticated participation (one per user)
 *   challenge_invitations  — user-to-user invites (accept = participate)
 *   social_posts.challenge_id — canonical content association (entries are
 *                               ordinary posts — no duplicated content)
 *
 * Identity model:
 *   Participation is tied to the authenticated Supabase user, matching the
 *   community/content conventions. Votes in the legacy Roast Arena use
 *   device identity (anon participant id) exactly like reactions/polls, but
 *   are written only through the cast_battle_vote RPC — totals are always
 *   derived from real vote rows server-side.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { buildFeedItem } from '@/lib/communities';

// ── Constants ────────────────────────────────────────────────

export const CHALLENGE_TYPES = ['opinion', 'question', 'poll', 'photo', 'hot_take'];

export const CHALLENGE_TYPE_META = {
  opinion: { icon: '💬', label: 'Opinion', color: 'text-blue-400', verb: 'share your opinion' },
  question: { icon: '❓', label: 'Question', color: 'text-purple-400', verb: 'ask your question' },
  poll: { icon: '🗳', label: 'Poll', color: 'text-amber-400', verb: 'create your poll' },
  photo: { icon: '📸', label: 'Photo', color: 'text-pink-400', verb: 'share your photo' },
  hot_take: { icon: '🌶', label: 'Hot Take', color: 'text-red-400', verb: 'drop your hot take' },
};

export const CHALLENGE_STATUS = {
  ACTIVE: 'active',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
};

// ── State helpers ────────────────────────────────────────────

/**
 * A challenge is "effectively ended" once ends_at passes (no cron needed).
 * Cancelled is terminal. All read paths use this so results are honest.
 */
export function effectiveStatus(challenge, now = Date.now()) {
  if (!challenge) return null;
  if (challenge.status === CHALLENGE_STATUS.CANCELLED) return CHALLENGE_STATUS.CANCELLED;
  if (challenge.status === CHALLENGE_STATUS.ENDED) return CHALLENGE_STATUS.ENDED;
  if (challenge.ends_at && new Date(challenge.ends_at).getTime() <= now) {
    return CHALLENGE_STATUS.ENDED;
  }
  return CHALLENGE_STATUS.ACTIVE;
}

export function isChallengeType(type) {
  return CHALLENGE_TYPES.includes(type);
}

export function isValidEndsAt(endsAt) {
  if (!endsAt) return true;
  const time = new Date(endsAt).getTime();
  if (Number.isNaN(time)) return false;
  // Max 14 days out, min 1 hour out
  const now = Date.now();
  return time > now + 60 * 60 * 1000 && time < now + 14 * 24 * 60 * 60 * 1000;
}

// ── Detail queries ───────────────────────────────────────────

/**
 * Fetch a challenge by slug with enriched display context (creator profile,
 * community summary, real participant count) using batched lookups.
 *
 * @param {object} opts { slug, client, viewerUserId }
 *   client — request-scoped SSR client (needed for viewer-scoped rows)
 */
export async function getChallengeDetail({ slug, client = null, viewerUserId = null }) {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error || !data) return null;

  return enrichChallenge(data, { client, viewerUserId });
}

export async function getChallengeById(id, { client = null, viewerUserId = null } = {}) {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return enrichChallenge(data, { client, viewerUserId });
}

/**
 * Add creator/community context + real counts + viewer state to a challenge row.
 */
async function enrichChallenge(challenge, { client = null, viewerUserId = null } = {}) {
  const readClient = client || supabase;

  // Creator profile (batched single lookup)
  let creator = null;
  if (challenge.creator_id) {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', challenge.creator_id)
      .maybeSingle();
    creator = data || null;
  }

  // Community summary when community-hosted
  let community = null;
  if (challenge.community_id) {
    const { data } = await supabase
      .from('communities')
      .select('id, name, slug, visibility')
      .eq('id', challenge.community_id)
      .maybeSingle();
    community = data || null;
  }

  // Real participant count + entry count
  const [{ count: participantCount }, { count: entryCount }] = await Promise.all([
    supabase
      .from('challenge_participants')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', challenge.id)
      .eq('status', 'active'),
    supabase
      .from('social_posts')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', challenge.id),
  ]);

  // Viewer state (participant / creator / pending invitation)
  let viewer = null;
  if (viewerUserId) {
    viewer = { isParticipant: false, isCreator: challenge.creator_id === viewerUserId, invitation: null };

    const { data: participation } = await readClient
      .from('challenge_participants')
      .select('id, post_id')
      .eq('challenge_id', challenge.id)
      .eq('user_id', viewerUserId)
      .maybeSingle();
    if (participation) {
      viewer.isParticipant = true;
      viewer.postId = participation.post_id;
    }

    if (!viewer.isParticipant) {
      const { data: invitation } = await readClient
        .from('challenge_invitations')
        .select('id, status')
        .eq('challenge_id', challenge.id)
        .eq('invitee_id', viewerUserId)
        .maybeSingle();
      if (invitation) viewer.invitation = invitation.status;
    }
  }

  return {
    ...challenge,
    status: effectiveStatus(challenge),
    creator,
    community,
    participant_count: participantCount || 0,
    entry_count: entryCount || 0,
    viewer,
  };
}

/**
 * List challenges with real data only.
 *
 * scope:
 *   'active'  — currently active, soonest-ending first
 *   'newest'  — newest first (any active/ended public challenge)
 *   'trending'— real recent participation velocity + freshness (time decay)
 *   'mine'    — challenges the viewer created or participated in
 *   'community' — challenges hosted in communityId (slug or id passed via community param)
 */
export async function listChallenges({
  scope = 'active',
  community = null,
  client = null,
  viewerUserId = null,
  limit = 24,
  cursor = null,
} = {}) {
  if (!isSupabaseConfigured || !supabase) return { challenges: [], total: 0 };

  const max = Math.min(limit, 50);
  const readClient = client || supabase;

  let query = supabase
    .from('challenges')
    .select('*')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(max + 1);

  if (cursor) query = query.lt('created_at', cursor);

  let idsForViewer = null;

  if (scope === 'mine') {
    if (!viewerUserId) return { challenges: [], total: 0 };
    const [createdResult, participatedResult] = await Promise.all([
      supabase.from('challenges').select('id').eq('creator_id', viewerUserId),
      supabase
        .from('challenge_participants')
        .select('challenge_id')
        .eq('user_id', viewerUserId)
        .eq('status', 'active'),
    ]);
    const ids = new Set([
      ...(createdResult.data || []).map(r => r.id),
      ...(participatedResult.data || []).map(r => r.challenge_id),
    ]);
    idsForViewer = [...ids];
    if (idsForViewer.length === 0) return { challenges: [], total: 0 };
    query = query.in('id', idsForViewer);
  }

  if (scope === 'invites') {
    if (!viewerUserId) return { challenges: [], total: 0 };
    const { data: inviteRows } = await readClient
      .from('challenge_invitations')
      .select('challenge_id')
      .eq('invitee_id', viewerUserId)
      .eq('status', 'pending');
    const ids = [...new Set((inviteRows || []).map(r => r.challenge_id))];
    idsForViewer = ids;
    if (idsForViewer.length === 0) return { challenges: [], total: 0 };
    query = query.in('id', idsForViewer);
    // Pending invites should surface even if the challenge already ended
    // (honest state) — but never cancelled ones.
    query = query.neq('status', 'cancelled');
  }

  if (scope === 'community' && community) {
    // community param may be a slug or id — resolve first
    let communityId = community;
    const { data: bySlug } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', community)
      .maybeSingle();
    if (bySlug) communityId = bySlug.id;
    query = query.eq('community_id', communityId);
  }

  if (scope === 'active') {
    // active by status — effective end (ends_at passed) is filtered below in Node
    query = query.eq('status', 'active');
  }

  const { data, error } = await query;
  if (error) return { challenges: [], total: 0 };

  let rows = data || [];
  const now = Date.now();

  // Honest state resolution + scope filtering (never display a dead challenge as active)
  const resolved = rows
    .map(row => ({ ...row, _effective: effectiveStatus(row, now) }))
    .filter(row => {
      if (scope === 'active') return row._effective === CHALLENGE_STATUS.ACTIVE;
      if (scope === 'invites') return row._effective !== CHALLENGE_STATUS.CANCELLED;
      return row._effective !== CHALLENGE_STATUS.CANCELLED || scope === 'mine';
    });

  const hasMore = resolved.length > max;
  let page = hasMore ? resolved.slice(0, max) : resolved;

  if (scope === 'active') {
    page = [...page].sort((a, b) => {
      const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : Infinity;
      const bEnd = b.ends_at ? new Date(b.ends_at).getTime() : Infinity;
      return aEnd - bEnd;
    });
  }

  if (scope === 'trending') {
    // Participation velocity (7d) + uniqueness + time decay
    const idList = page.map(c => c.id);
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentParticipants } = await supabase
      .from('challenge_participants')
      .select('challenge_id')
      .in('challenge_id', idList)
      .gte('created_at', since)
      .eq('status', 'active');
    const recent = {};
    for (const p of recentParticipants || []) {
      recent[p.challenge_id] = (recent[p.challenge_id] || 0) + 1;
    }
    page = [...page].sort((a, b) => {
      const aScore = (recent[a.id] || 0) * 5 + Math.max(0, 1 - (now - new Date(a.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000)) * 10;
      const bScore = (recent[b.id] || 0) * 5 + Math.max(0, 1 - (now - new Date(b.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000)) * 10;
      return bScore - aScore;
    });
  }

  // Batch enrich: creator + community + counts (all in 3 queries, no N+1)
  const challengeIds = page.map(c => c.id);

  const creatorIds = [...new Set(page.map(c => c.creator_id).filter(Boolean))];
  const profiles = {};
  if (creatorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('user_profiles')
      .select('id, username, display_name')
      .in('id', creatorIds);
    for (const p of profileRows || []) profiles[p.id] = p;
  }

  const communityIds = [...new Set(page.map(c => c.community_id).filter(Boolean))];
  const communities = {};
  if (communityIds.length > 0) {
    const { data: communityRows } = await supabase
      .from('communities')
      .select('id, name, slug')
      .in('id', communityIds);
    for (const c of communityRows || []) communities[c.id] = c;
  }

  const { data: participantRows } = await supabase
    .from('challenge_participants')
    .select('challenge_id')
    .in('challenge_id', challengeIds)
    .eq('status', 'active');
  const counts = {};
  for (const p of participantRows || []) {
    counts[p.challenge_id] = (counts[p.challenge_id] || 0) + 1;
  }

  // Viewer flags batched (participant + creator). Invitations require the SSR client.
  const myParticipations = new Set();
  const myInvitations = {};
  if (viewerUserId) {
    const { data: mine } = await readClient
      .from('challenge_participants')
      .select('challenge_id')
      .in('challenge_id', challengeIds)
      .eq('user_id', viewerUserId)
      .eq('status', 'active');
    for (const m of mine || []) myParticipations.add(m.challenge_id);

    const { data: invites } = await readClient
      .from('challenge_invitations')
      .select('challenge_id, status')
      .in('challenge_id', challengeIds)
      .eq('invitee_id', viewerUserId);
    for (const i of invites || []) myInvitations[i.challenge_id] = i.status;
  }

  return {
    challenges: page.map(c => ({
      ...c,
      _effective: undefined,
      status: effectiveStatus(c, now),
      creator: c.creator_id ? (profiles[c.creator_id] || null) : null,
      community: c.community_id ? (communities[c.community_id] || null) : null,
      participant_count: counts[c.id] || 0,
      viewer: viewerUserId
        ? {
            isParticipant: myParticipations.has(c.id),
            isCreator: c.creator_id === viewerUserId,
            invitation: myInvitations[c.id] || null,
          }
        : null,
    })),
    total: resolved.length,
  };
}

// ── Entries ──────────────────────────────────────────────────

/**
 * Challenge entries are canonical social_posts rows linked by challenge_id.
 * Reuses buildFeedItem so FeedCard/reactions/comments work unchanged.
 * Batch profile + poll lookups (no N+1). Attaches real vote tallies
 * (challenge_votes) and the viewer's voted entry when signed in.
 */
export async function getChallengeEntries(challengeId, { limit = 20, cursor = null, viewerId = null } = {}) {
  if (!isSupabaseConfigured || !supabase) return { items: [], nextCursor: null };

  let query = supabase
    .from('social_posts')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return { items: [], nextCursor: null };

  const hasMore = (data || []).length > limit;
  const posts = hasMore ? data.slice(0, limit) : data || [];

  const authorIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
  const profiles = {};
  if (authorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url, bio')
      .in('id', authorIds);
    for (const p of profileRows || []) profiles[p.id] = p;
  }

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

  // Real vote tallies per entry + the viewer's voted entry (batched, no N+1).
  const postIds = posts.map(p => p.id);
  const voteTotals = await getChallengeVoteTotals(challengeId, postIds);
  let viewerVotePostId = null;
  if (viewerId && postIds.length > 0) {
    const { data: mine } = await supabase
      .from('challenge_votes')
      .select('post_id')
      .eq('challenge_id', challengeId)
      .eq('user_id', viewerId)
      .maybeSingle();
    viewerVotePostId = mine?.post_id || null;
  }
  for (const item of items) {
    item.voteCount = voteTotals[item.id] || 0;
    item.viewerVoted = viewerVotePostId === item.id;
  }

  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;
  return { items, nextCursor, viewerVotePostId };
}

/**
 * Real vote tallies for challenge entries (challenge_votes is the source
 * of truth). Pass postIds to scope the count to one page of entries.
 */
export async function getChallengeVoteTotals(challengeId, postIds = null) {
  const totals = {};
  if (!isSupabaseConfigured || !supabase || !challengeId) return totals;
  let query = supabase
    .from('challenge_votes')
    .select('post_id')
    .eq('challenge_id', challengeId);
  if (postIds && postIds.length > 0) {
    query = query.in('post_id', postIds);
  }
  const { data } = await query;
  for (const r of data || []) {
    totals[r.post_id] = (totals[r.post_id] || 0) + 1;
  }
  return totals;
}

/**
 * Real reaction totals for a batch of posts (reactions table is the source
 * of truth). Used for honest challenge outcomes — never fabricated.
 */
export async function getPostReactionTotals(postIds) {
  const totals = {};
  if (!isSupabaseConfigured || !supabase || !postIds.length) return totals;
  const { data } = await supabase
    .from('reactions')
    .select('target_id')
    .eq('target_type', 'social_post')
    .in('target_id', postIds);
  for (const r of data || []) {
    totals[r.target_id] = (totals[r.target_id] || 0) + 1;
  }
  return totals;
}

/**
 * Honest outcome for a challenge: entries ranked by real votes first,
 * reactions as the tiebreak (so challenges that predate voting still
 * resolve honestly). A winner is only surfaced with actual crowd signal.
 */
export async function getChallengeOutcome(challengeId, { limit = 5 } = {}) {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: posts } = await supabase
    .from('social_posts')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!posts || posts.length === 0) return null;

  const totals = await getPostReactionTotals(posts.map(p => p.id));
  const voteTotals = await getChallengeVoteTotals(challengeId, posts.map(p => p.id));

  const authorIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
  const profiles = {};
  if (authorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('user_profiles')
      .select('id, username, display_name')
      .in('id', authorIds);
    for (const p of profileRows || []) profiles[p.id] = p;
  }

  const ranked = posts
    .map(post => ({
      post,
      votes: voteTotals[post.id] || 0,
      reactions: totals[post.id] || 0,
      author: post.user_id ? profiles[post.user_id] || null : null,
    }))
    .sort((a, b) =>
      b.votes - a.votes
      || b.reactions - a.reactions
      || new Date(b.post.created_at) - new Date(a.post.created_at))
    .slice(0, limit);

  const totalReactions = ranked.reduce((sum, r) => sum + r.reactions, 0);
  const totalVotes = ranked.reduce((sum, r) => sum + r.votes, 0);

  return {
    total_participants: posts.length,
    total_reactions: totalReactions,
    total_votes: totalVotes,
    has_signal: totalVotes > 0 || totalReactions > 0,
    top: ranked.map(r => ({
      post_id: r.post.id,
      text: r.post.content_text,
      content_type: r.post.content_type,
      author: r.author ? { username: r.author.username, display_name: r.author.display_name } : null,
      votes: r.votes,
      reactions: r.reactions,
    })),
  };
}

/**
 * Pending invitations visible to the viewer for a challenge.
 */
export async function getMyInvitation(challengeId, client, viewerUserId) {
  if (!client || !viewerUserId) return null;
  const { data } = await client
    .from('challenge_invitations')
    .select('*')
    .eq('challenge_id', challengeId)
    .eq('invitee_id', viewerUserId)
    .eq('status', 'pending')
    .maybeSingle();
  return data || null;
}
