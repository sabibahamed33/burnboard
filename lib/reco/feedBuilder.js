/**
 * BURNBOARD Personalization — Feed Builder (candidate generation, eligibility,
 * safety filtering, explainable ranking, diversity, exploration)
 *
 * Conceptual pipeline (Master Prompt 12):
 *   CANDIDATE GENERATION → ELIGIBILITY FILTERING → SAFETY FILTERING →
 *   PERSONALIZED SCORING → DIVERSITY → FRESHNESS → FINAL FEED
 *
 * Everything here is server-side; raw scores never leave this module — the
 * API only emits items plus product-level explanation strings.
 */

import { hiddenAuthorIds } from '@/lib/safety';
import { transformSocialPostItem, transformRoastItem, engagementOf } from './items';
import {
  RANKING_WEIGHTS as W,
  FRESHNESS, DIVERSITY, EXPLORATION, CANDIDATE_POOL as P, FEEDBACK, QUALITY,
  CREATOR_QUALITY as CQ, VIRAL,
} from './config';
import { excludeSeen } from './exclusion';
import { fetchCandidateContentQuality } from './contentQuality';

const SOCIAL_SELECT = '*, user_profiles!inner(id, username, display_name, bio), polls(*)';
const ROAST_SELECT = '*, profiles!inner(id, username, platform, avatar_letter, avatar_color, tagline, bio)';
const WINDOW_MS = 60 * 60 * 1000;

function hoursAgo(createdAt, now = Date.now()) {
  const t = new Date(createdAt).getTime();
  if (!t) return FRESHNESS.maxAgeHours;
  return Math.max(0, (now - t) / WINDOW_MS);
}

function nowMinusHours(hours) {
  return new Date(Date.now() - hours * WINDOW_MS).toISOString();
}

// ── Normalization ───────────────────────────────────────────
function normPost(r) {
  return {
    kind: 'social_post',
    id: r.id,
    authorId: r.user_id,
    communityId: r.community_id,
    contentType: r.content_type,
    createdAt: r.created_at,
    raw: r,
  };
}

function normRoast(r) {
  return {
    kind: 'roast',
    id: r.id,
    authorId: r.user_id || null, // null for anonymous legacy roasts
    communityId: null,
    contentType: 'roast',
    createdAt: r.created_at,
    raw: r,
  };
}

async function fetchPosts(client, { authorIds, communityIds, sinceIso, limit }) {
  let q = client.from('social_posts').select(SOCIAL_SELECT)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 300));
  if (sinceIso) q = q.gte('created_at', sinceIso);
  if (authorIds && authorIds.length) q = q.in('user_id', authorIds);
  if (communityIds && communityIds.length) q = q.in('community_id', communityIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normPost);
}

async function fetchRoasts(client, { sinceIso, limit }) {
  let q = client.from('roasts').select(ROAST_SELECT)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 300));
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normRoast);
}

// ── Candidate pools ─────────────────────────────────────────
/**
 * Assemble candidate content from multiple legitimate sources:
 * followed creators, affinity creators, joined/affinity communities,
 * recent eligible content, fresh under-discovered content.
 */
async function gatherCandidates(client, state, now = Date.now()) {
  const candidates = new Map();
  const add = (list, fromPool) => {
    for (const c of list) {
      const key = `${c.kind}:${c.id}`;
      if (!candidates.has(key)) {
        c.fromPool = fromPool;
        candidates.set(key, c);
      }
    }
  };

  const followed = [...state.follows];
  const maxAgeIso = nowMinusHours(FRESHNESS.maxAgeHours);

  // Affinity-driven creator ids (positive, not followed, not self)
  const affinityCreators = [...state.affinities.creator.entries()]
    .filter(([key, row]) => key !== state.userId && (row.positive || 0) > 0 && !state.follows.has(key))
    .sort((a, b) => b[1].positive - a[1].positive)
    .slice(0, 12)
    .map(([key]) => key);

  // Affinity communities not joined (discovery from topic overlap)
  const affinityCommunities = [...state.affinities.community.entries()]
    .filter(([key, row]) => (row.positive || 0) > 0 && !state.joinedCommunities.has(key))
    .sort((a, b) => b[1].positive - a[1].positive)
    .slice(0, 8)
    .map(([key]) => key);

  const communityIds = [...state.joinedCommunities, ...affinityCommunities];

  // Pool A: followed creators' recent posts (chronological source of truth)
  if (followed.length) {
    add(await fetchPosts(client, { authorIds: followed, sinceIso: maxAgeIso, limit: P.followingPosts }), 'following');
  }

  // Pool B: affinity creators (discovery through repeated engagement)
  if (affinityCreators.length) {
    add(await fetchPosts(client, { authorIds: affinityCreators, sinceIso: nowMinusHours(96), limit: P.affinityCreatorPosts }), 'creator_affinity');
  }

  // Pool C: communities joined + affinity communities
  if (communityIds.length) {
    add(await fetchPosts(client, { communityIds, sinceIso: nowMinusHours(72), limit: P.communityPosts }), 'community');
  }

  // Pool D: recent eligible content (trending/fresh base incl. roasts)
  add(await fetchPosts(client, { sinceIso: maxAgeIso, limit: P.globalFreshPosts }), 'global');
  add(await fetchRoasts(client, { sinceIso: nowMinusHours(72), limit: 140 }), 'global');

  return [...candidates.values()];
}

// ── Eligibility + safety ────────────────────────────────────
async function applyEligibility(client, state, candidates) {
  const keep = [];
  const communityIds = [...new Set(candidates.map(c => c.communityId).filter(Boolean))];
  let communityMeta = new Map(); // id -> { id, name, visibility }

  if (communityIds.length) {
    const meta = [];
    for (let i = 0; i < communityIds.length; i += 100) {
      const { data } = await client
        .from('communities')
        .select('id, name, visibility')
        .in('id', communityIds.slice(i, i + 100));
      meta.push(...(data || []));
    }
    communityMeta = new Map(meta.map(m => [m.id, m]));
  }

  // Batch block/mute resolution for every candidate author.
  const authorIds = [...new Set(candidates.map(c => c.authorId).filter(Boolean))];
  const hiddenAuthors = authorIds.length
    ? await hiddenAuthorIds(client, state.userId, authorIds)
    : new Set();

  for (const c of candidates) {
    // Never surface the viewer's own content to themselves in For You.
    if (c.authorId === state.userId) continue;

    // Content explicitly hidden / "not interested" never returns.
    if (state.hiddenContent.has(`${c.kind}:${c.id}`)) continue;

    // Blocks and mutes are authoritative in both directions.
    if (c.authorId && hiddenAuthors.has(c.authorId)) continue;

    // Community privacy: private-community content stays inside the
    // community unless the viewer is a member. RLS hides private-community
    // rows from non-members entirely, so a missing meta row is NOT a pass —
    // it means the viewer cannot legitimately access this community.
    if (c.communityId) {
      const meta = communityMeta.get(c.communityId);
      if (!meta) continue;
      if (meta.visibility !== 'public' && !state.joinedCommunities.has(c.communityId)) continue;
    }

    c.communityMeta = communityMeta.get(c.communityId) || null;
    keep.push(c);
  }
  return keep;
}

// ── Scoring factors ─────────────────────────────────────────
// Creator quality is derived from the candidates already in memory:
// consistent per-post engagement (log-normalized average), never volume or
// follower count. Zero extra database reads.
function buildCreatorQuality(candidates) {
  const perAuthor = new Map();
  for (const c of candidates) {
    if (!c.authorId) continue;
    const key = String(c.authorId);
    const row = perAuthor.get(key) || { posts: 0, engagement: 0 };
    row.posts += 1;
    row.engagement += engagementOf(c.raw);
    perAuthor.set(key, row);
  }
  const quality = new Map();
  for (const [key, row] of perAuthor) {
    const avg = row.posts > 0 ? row.engagement / row.posts : 0;
    quality.set(key, Math.min(1, Math.log1p(avg) / Math.log1p(CQ.saturationEngagement)));
  }
  return quality;
}

function buildScorer(state, communityTopicsByCommunity, contentQualityByCandidate = new Map(), creatorQualityByAuthor = new Map()) {
  const now = Date.now();
  const aff = state.affinities;

  return function scoreCandidate(c) {
    const ageHours = hoursAgo(c.createdAt, now);
    const engagement = engagementOf(c.raw);
    const authorKey = c.authorId ? String(c.authorId) : null;
    const commKey = c.communityId ? String(c.communityId) : null;

    // freshness: half-life decay
    const freshness = Math.pow(0.5, ageHours / FRESHNESS.halfLifeHours);

    // following
    const following = c.fromPool === 'following' && c.authorId && state.follows.has(c.authorId) ? 1 : 0;

    // creator affinity
    const creatorRow = authorKey ? aff.creator.get(authorKey) : null;
    const creatorPos = creatorRow?.positive || 0;
    const creatorFactor = following
      ? Math.min(1, 0.45 + creatorPos / 12)
      : Math.min(1, creatorPos / 7);

    // community affinity
    const commRow = commKey ? aff.community.get(commKey) : null;
    const commPos = commRow?.positive || 0;
    const joined = c.communityId && state.joinedCommunities.has(c.communityId);
    const communityFactor = joined
      ? Math.min(1, 0.55 + commPos / 12)
      : Math.min(1, commPos / 7);

    // topic relevance (topics of the item's community vs interests/affinity)
    const candidateTopics = c.communityId ? (communityTopicsByCommunity.get(c.communityId) || []) : [];
    let topicFactor = 0;
    let topicName = null;
    for (const t of candidateTopics) {
      const isExplicit = state.interestsById.has(String(t.id));
      const topicAff = aff.topic.get(String(t.id));
      const topicPos = topicAff?.positive || 0;
      const val = isExplicit
        ? Math.min(1, 0.7 + topicPos / 12)
        : Math.min(1, topicPos / 7);
      if (val > topicFactor) {
        topicFactor = val;
        topicName = t.name;
      }
    }

    // content type affinity
    const typeRow = aff.content_type.get(c.contentType);
    const typeFactor = Math.min(1, (typeRow?.positive || 0) / 8);

    // popularity: recent engagement, log-normalized, never raw totals alone
    const engagementNorm = Math.log1p(engagement) / Math.log1p(80);
    const velocity = engagement / (ageHours + 2); // per hour
    const velocityNorm = Math.min(1, Math.log1p(velocity * 24) / Math.log1p(90));

    // Content-quality evidence (MP27): when a REAL provider has scored this
    // item clearly low-quality, dampen only the popularity term so it cannot
    // ride an engagement wave. Builtin-source rows and missing metadata are
    // ignored entirely; moderation remains the only removal authority.
    const qualityRow = contentQualityByCandidate.get(`${c.kind}:${c.id}`) || null;
    const qualityPopularityMultiplier = qualityRow?.lowQuality
      ? QUALITY.popularityMultiplier
      : 1;
    const popularity = Math.min(1, 0.6 * engagementNorm + 0.4 * velocityNorm)
      * qualityPopularityMultiplier;

    // negative feedback (proportional, not one-click erasure)
    let negativeMultiplier = 1;
    let negPenalty = 0;
    const creatorNegCount = authorKey ? state.negativeCreators.get(authorKey) || 0 : 0;
    const commNegCount = commKey ? state.negativeCommunities.get(commKey) || 0 : 0;
    const typeNegCount = state.negativeTypes.get(c.contentType) || 0;
    const creatorNegAff = creatorRow?.negative || 0;
    const commNegAff = commRow?.negative || 0;
    if (creatorNegCount >= FEEDBACK.minNotInterestedForStrongSuppression || creatorNegAff >= 3) {
      negativeMultiplier *= FEEDBACK.repeatedNegativeMultiplier;
    } else if (creatorNegCount >= 1 || creatorNegAff >= 1.5) {
      negativeMultiplier *= FEEDBACK.singleNegativeMultiplier;
    }
    if (commNegCount >= FEEDBACK.minNotInterestedForStrongSuppression || commNegAff >= 3) {
      negativeMultiplier *= FEEDBACK.repeatedNegativeMultiplier;
    } else if (commNegCount >= 1 || commNegAff >= 1.5) {
      negativeMultiplier *= FEEDBACK.singleNegativeMultiplier;
    }
    if (typeNegCount >= 2) {
      negativeMultiplier *= FEEDBACK.repeatedNegativeMultiplier;
    } else if (typeNegCount >= 1) {
      negativeMultiplier *= FEEDBACK.singleNegativeMultiplier;
    }
    negPenalty += Math.min(2.5, (creatorNegAff || 0) / 3) * W.creatorNegative;
    negPenalty += Math.min(2.5, (commNegAff || 0) / 3) * W.communityNegative;

    // exploration: fresh, under-discovered, not from followed/affinity sources
    const isExploration = c.fromPool !== 'following'
      && c.fromPool !== 'creator_affinity'
      && (!c.authorId || !state.follows.has(c.authorId))
      && (creatorPos || 0) <= 0
      && engagement <= EXPLORATION.maxEngagementToExplore
      && ageHours <= EXPLORATION.freshWindowHours;

    const base = (
      W.following * following +
      W.creatorAffinity * creatorFactor +
      W.communityAffinity * communityFactor +
      W.topicRelevance * topicFactor +
      W.typeAffinity * typeFactor +
      W.popularity * popularity +
      W.freshness * freshness +
      W.creatorQuality * (authorKey ? (creatorQualityByAuthor.get(authorKey) || 0) : 0)
    );
    // Suppress strongly: explicitly negative creator/community rows reduce
    // the *multiplicative* fit so a category doesn't vanish from one click.
    const fitScore = Math.max(0, base - negPenalty) * negativeMultiplier;

    // Viral launch boost: strong quality engagement shortly after publishing
    // earns temporary extra distribution. Self-expiring — velocity collapses
    // with age and the window is hard-capped, so old viral posts can never
    // ride it and lifetime totals alone earn nothing.
    let launchBoost = 0;
    if (ageHours <= VIRAL.launchWindowHours && velocityNorm >= VIRAL.launchVelocityNormThreshold) {
      launchBoost = VIRAL.launchBoost * velocityNorm;
    }

    return {
      candidate: c,
      ageHours,
      engagement,
      factors: {
        following, creator: creatorFactor, community: communityFactor,
        topic: topicFactor, type: typeFactor, popularity, freshness,
        topicName,
        joinedCommunity: joined,
        creatorAffinityPositive: creatorPos,
        creatorQuality: authorKey ? (creatorQualityByAuthor.get(authorKey) || 0) : 0,
        velocityNorm,
        launchBoost,
      },
      isExploration,
      explorationBoost: isExploration ? Math.min(1, Math.max(0, 1 - ageHours / EXPLORATION.freshWindowHours)) * W.exploration * 0.6 : 0,
      score: fitScore + launchBoost,
    };
  };
}

// ── Diversity-aware ordering ────────────────────────────────
function applyDiversity(scored) {
  const order = [];
  const remaining = scored.slice().sort((a, b) => b.score - a.score);
  const recentCreator = [];
  const recentCommunity = [];
  const recentType = [];

  const penaltyFor = (s) => {
    let p = 1;
    const creatorKey = s.candidate.authorId ? `u:${s.candidate.authorId}` : `n:${s.candidate.id}`;
    if (recentCreator.includes(creatorKey) && recentCreator.length >= 1) p *= DIVERSITY.creatorPenalty;
    const commKey = s.candidate.communityId ? `c:${s.candidate.communityId}` : null;
    if (commKey && recentCommunity.includes(commKey)) p *= DIVERSITY.communityPenalty;
    if (recentType.includes(s.candidate.contentType)) p *= DIVERSITY.typePenalty;
    return p;
  };

  const remember = (s) => {
    if (s.candidate.authorId) {
      recentCreator.push(`u:${s.candidate.authorId}`);
      if (recentCreator.length > DIVERSITY.creatorWindow) recentCreator.shift();
    }
    if (s.candidate.communityId) {
      recentCommunity.push(`c:${s.candidate.communityId}`);
      if (recentCommunity.length > DIVERSITY.communityWindow) recentCommunity.shift();
    }
    recentType.push(s.candidate.contentType);
    if (recentType.length > DIVERSITY.typeWindow) recentType.shift();
  };

  while (remaining.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const adjusted = remaining[i].score + remaining[i].explorationBoost;
      const val = adjusted * penaltyFor(remaining[i]);
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    const pick = remaining.splice(bestIdx, 1)[0];
    order.push(pick);
    remember(pick);
  }
  return order;
}

// ── Explanation (product-level, truthful) ───────────────────
function explanationFor(scored, state) {
  const { factors } = scored;
  const c = scored.candidate;
  // Author/creator explanations only apply to canonical social posts: roast
  // cards are attributed to their TARGET profile, so claiming "because you
  // follow/engage @target" would not be truthful.
  const isSocialPost = c.kind === 'social_post';
  const username = isSocialPost ? c.raw?.user_profiles?.username || null : null;
  const communityName = isSocialPost ? c.communityMeta?.name || null : null;

  const strongest = [
    { key: 'following', strength: factors.following, text: username ? `Because you follow @${username}` : null },
    {
      key: 'community',
      strength: factors.community,
      text: communityName
        ? (factors.joinedCommunity ? `Popular in ${communityName}` : `From ${communityName}, which you like`)
        : null,
    },
    {
      key: 'topic',
      strength: factors.topic,
      text: factors.topicName ? `Because you're into ${factors.topicName}` : null,
    },
    {
      key: 'creator',
      strength: factors.creator,
      text: username && factors.creatorAffinityPositive > 0 ? `More from @${username}, who you engage with` : null,
    },
  ].filter(x => x.strength > 0 && x.text);

  strongest.sort((a, b) => b.strength - a.strength);

  let reason = null;
  if (strongest.length) {
    reason = strongest[0];
  } else if (factors.popularity >= 0.55) {
    reason = { key: 'trending', strength: 1, text: 'Trending on BurnBoard' };
  } else if (isSocialPost && c.authorId && !state.follows.has(c.authorId) && factors.creatorAffinityPositive <= 0) {
    reason = { key: 'discovery', strength: 1, text: 'New to you — try something different' };
  } else {
    reason = { key: 'fresh', strength: 1, text: 'Fresh on BurnBoard' };
  }
  return { reason: reason.key, text: reason.text };
}

// ── Topic index for candidate communities ───────────────────
async function buildCommunityTopics(client, communityIds) {
  const map = new Map();
  if (!communityIds.length) return map;
  const rows = [];
  for (let i = 0; i < communityIds.length; i += 100) {
    const { data } = await client
      .from('community_topics')
      .select('community_id, topics(id, name, slug)')
      .in('community_id', communityIds.slice(i, i + 100));
    rows.push(...(data || []));
  }
  for (const row of rows) {
    if (!row.topics) continue;
    const list = map.get(row.community_id) || [];
    list.push({ id: row.topics.id, name: row.topics.name, slug: row.topics.slug });
    map.set(row.community_id, list);
  }
  return map;
}

// ── Main personalized feed builder ──────────────────────────
/**
 * @returns {object} { items, nextCursor, personalized, coldStart, count }
 */
export async function buildPersonalizedFeed({ client, state, offset = 0, limit = 20, exclude = null, debug = false }) {
  const now = Date.now();
  let candidates = await gatherCandidates(client, state, now);
  candidates = await applyEligibility(client, state, candidates);

  if (candidates.length === 0) {
    return { items: [], nextCursor: null, personalized: true, coldStart: state.coldStart, count: 0 };
  }

  const communityTopicMap = await buildCommunityTopics(
    client,
    [...new Set(candidates.map(c => c.communityId).filter(Boolean))]
  );

  // Content-intelligence evidence for the eligible candidates (failure-soft;
  // empty map when no real-provider metadata exists).
  const contentQuality = await fetchCandidateContentQuality(client, candidates);

  // Creator quality from the candidates already in memory (no extra reads).
  const creatorQuality = buildCreatorQuality(candidates);

  const score = buildScorer(state, communityTopicMap, contentQuality, creatorQuality);
  const scored = candidates.map(score).filter(s => s.score > 0 || s.isExploration || s.factors.freshness > 0.2);
  const ordered = applyDiversity(scored);

  // Keep a small controlled portion of the page for discovery.
  const orderedWithExploration = reserveExplorationSlots(ordered);

  // Session impression-awareness: drop ids the client already displayed
  // (bounded `exclude` set) BEFORE slicing the page, so re-ranking shifts
  // between requests can neither duplicate nor silently skip content.
  const visible = excludeSeen(orderedWithExploration, exclude);

  const page = visible.slice(offset, offset + limit);
  const items = page.map((s) => {
    const item = s.candidate.kind === 'social_post'
      ? transformSocialPostItem(s.candidate.raw)
      : transformRoastItem(s.candidate.raw);
    item.explanation = explanationFor(s, state);
    // Development-only diagnostics: candidate source + score components.
    // Never enabled in production (route gates on NODE_ENV); internal
    // weights stay server-side, only per-item factor values are exposed.
    if (debug) {
      const f = s.factors;
      const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
      item.debug = {
        source: s.candidate.fromPool || null,
        score: round2(s.score),
        ageHours: round2(s.ageHours),
        engagement: s.engagement,
        factors: {
          following: f.following,
          creator: round2(f.creator),
          community: round2(f.community),
          topic: round2(f.topic),
          type: round2(f.type),
          popularity: round2(f.popularity),
          freshness: round2(f.freshness),
          creatorQuality: round2(f.creatorQuality),
          velocity: round2(f.velocityNorm),
          launchBoost: round2(f.launchBoost),
        },
      };
    }
    return item;
  });

  const nextCursor = offset + limit < visible.length ? String(offset + limit) : null;
  return {
    items,
    nextCursor,
    personalized: true,
    coldStart: state.coldStart,
    count: items.length,
  };
}

/**
 * Reserve a small number of slots for exploration candidates so discovery
 * always survives, without forcing irrelevant content into the feed.
 */
function reserveExplorationSlots(ordered) {
  if (ordered.length <= EXPLORATION.minPerPage) return ordered;
  const exploration = ordered.filter(s => s.isExploration);
  const rest = ordered.filter(s => !s.isExploration);
  if (!exploration.length) return ordered;

  const positions = [];
  const spacing = Math.max(4, Math.floor(ordered.length / (EXPLORATION.minPerPage + 1)));
  for (let k = 0; k < EXPLORATION.minPerPage; k += 1) {
    const pos = spacing * (k + 1) - 1;
    if (pos >= 0 && pos < ordered.length) positions.push(pos);
  }

  // Deterministic: pick the best-scoring exploration candidates.
  const picks = exploration.sort((a, b) => b.score - a.score).slice(0, positions.length);
  if (!picks.length) return ordered;

  const result = rest.slice();
  for (let i = 0; i < positions.length && i < picks.length; i += 1) {
    const pos = positions[i];
    if (pos < result.length) result.splice(pos, 0, picks[i]);
    else result.push(picks[i]);
  }
  return result;
}

// ── Following feed (chronological, distinct from For You) ───
export async function buildFollowingFeed({ client, userId, state, cursor, limit = 20 }) {
  if (!state || state.follows.size === 0) {
    return { items: [], nextCursor: null, requiresAuth: true, count: 0, followingEmpty: true };
  }

  const followed = [...state.follows];
  let q = client
    .from('social_posts')
    .select(SOCIAL_SELECT)
    .in('user_id', followed)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw error;

  let rows = data || [];

  // Exclude hidden content + private-community posts the viewer can't see.
  const communityIds = [...new Set(rows.map(r => r.community_id).filter(Boolean))];
  let communityVisibility = new Map();
  if (communityIds.length) {
    const { data: meta } = await client
      .from('communities')
      .select('id, visibility')
      .in('id', communityIds);
    communityVisibility = new Map((meta || []).map(m => [m.id, m.visibility]));
  }
  const authorIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const hiddenAuthors = authorIds.length
    ? await hiddenAuthorIds(client, userId, authorIds)
    : new Set();

  rows = rows.filter(r => {
    if (r.user_id === userId) return false;
    if (state.hiddenContent.has(`social_post:${r.id}`)) return false;
    if (hiddenAuthors.has(r.user_id)) return false;
    // Missing meta (RLS) or explicitly private + not a member → excluded.
    if (r.community_id) {
      const vis = communityVisibility.get(r.community_id);
      if (!vis || (vis !== 'public' && !state.joinedCommunities.has(r.community_id))) return false;
    }
    return true;
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows.map(transformSocialPostItem);
  const nextCursor = hasMore && pageRows.length ? pageRows[pageRows.length - 1].created_at : null;

  return { items, nextCursor, requiresAuth: false, count: items.length };
}
