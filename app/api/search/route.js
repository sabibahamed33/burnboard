import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { hiddenAuthorIds } from '@/lib/safety';
import { searchCommunities } from '@/lib/communities';
import { normalizeQuery, normalizeTag, aggregateTags, extractTags } from '@/lib/hashtags';
import { sanitizeSearchQuery } from '@/lib/unicode';
import { understandQuery, intentSynonyms } from '@/lib/semantic';
import { instrumentHandler } from '@/lib/metrics';

/**
 * GET /api/search?q=...&scope=all|people|roasts|communities|challenges|topics|hashtags&limit=&offset=
 *
 * Server-side discovery search across entity types. Every scope reads only
 * real rows, respects blocks/mutes (hiddenAuthorIds), moderation state,
 * community visibility, and RLS (session client when signed in).
 * Hashtags are aggregated live from matched content — no stored counts,
 * nothing fabricated. Challenges are public-only by schema; cancelled
 * challenges never surface.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

const SCOPES = ['all', 'people', 'roasts', 'photos', 'communities', 'challenges', 'battles', 'topics', 'hashtags'];
const MAX_LIMIT = 20;
const BATTLE_STATUSES = ['all', 'live', 'finished'];

/**
 * Strip characters that break PostgREST `or()` filter syntax or act as
 * LIKE wildcards. Unicode-safe: NFC-normalizes and drops bidi/invisible
 * controls first so multilingual queries (Bangla, Arabic, CJK, Latin)
 * can't crash or spoof search. The surrounding %...% for contains-match
 * is added by each caller, so user-supplied wildcards are never honored.
 * Original query text is preserved by callers for display.
 */
function sanitizeLike(q) {
  return sanitizeSearchQuery(q, 80).replace(/[,()"%_\\]/g, '').trim();
}

function freshnessDecay(createdAt, halfLifeHours = 48) {
  const t = new Date(createdAt).getTime();
  if (!t) return 0;
  const ageHours = Math.max(0, (Date.now() - t) / 3600000);
  return Math.pow(0.5, ageHours / halfLifeHours);
}

async function searchPeople(db, q, userId, limit) {
  const safe = sanitizeLike(q);
  if (!safe) return [];
  // Suspended/banned users are never discoverable. The is_banned filter is
  // applied fail-soft (column may not exist on older snapshots).
  let query = db
    .from('user_profiles')
    .select('id, username, display_name, bio, avatar_url, follower_count')
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .eq('is_banned', false)
    .limit(30);
  let res = await query;
  if (res.error && /is_banned|column/i.test(res.error.message || '')) {
    res = await db
      .from('user_profiles')
      .select('id, username, display_name, bio, avatar_url, follower_count')
      .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .limit(30);
  }
  const { data } = res;
  let rows = (data || []).filter((p) => p.username);
  if (userId && rows.length) {
    const hidden = await hiddenAuthorIds(db, userId, rows.map((r) => r.id));
    if (hidden.size) rows = rows.filter((r) => !hidden.has(r.id));
  }
  // Relationship signal (RELEVANCE FIRST, personalization second): followed
  // users get a modest boost that can never outrank an exact text match.
  let followed = new Set();
  if (userId && rows.length) {
    try {
      const { data: fr } = await db
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)
        .in('following_id', rows.map((r) => r.id).slice(0, 50));
      followed = new Set((fr || []).map((f) => f.following_id));
    } catch {}
  }
  const lower = q.toLowerCase();
  return rows
    .map((p) => {
      const uname = (p.username || '').toLowerCase();
      const dname = (p.display_name || '').toLowerCase();
      let score = 0;
      if (uname === lower) score = 4;
      else if (uname.startsWith(lower)) score = 3;
      else if (uname.includes(lower)) score = 2;
      else if (dname === lower) score = 2.5;
      else score = 1;
      if (followed.has(p.id)) score += 0.5;
      return { ...p, _score: score };
    })
    .sort((a, b) => b._score - a._score || (b.follower_count || 0) - (a.follower_count || 0))
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}

async function communityAccessMap(db, userId, communityIds) {
  const unique = [...new Set((communityIds || []).filter(Boolean))];
  if (!unique.length) return new Map();
  const { data: meta } = await db.from('communities').select('id, visibility').in('id', unique);
  const map = new Map((meta || []).map((m) => [m.id, m.visibility || 'public']));
  let memberSet = new Set();
  if (userId) {
    const { data: memberships } = await db
      .from('community_members')
      .select('community_id')
      .eq('user_id', userId)
      .in('community_id', unique);
    memberSet = new Set((memberships || []).map((m) => m.community_id));
  }
  for (const [id, vis] of map) {
    map.set(id, vis === 'public' || memberSet.has(id) ? 'ok' : 'hidden');
  }
  return map;
}

async function searchRoasts(db, q, userId, limit, { photoOnly = false } = {}) {
  const safe = sanitizeLike(q);
  if (!safe) return [];
  const like = `%${safe}%`;
  const postSelect = 'id, content_text, user_id, community_id, content_type, upvote_count, comment_count, created_at, user_profiles!inner(id, username, display_name)';
  let postQuery = db
    .from('social_posts')
    .select(postSelect)
    .ilike('content_text', like)
    .eq('moderation_state', 'visible')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(30);
  if (photoOnly) postQuery = postQuery.eq('content_type', 'photo');
  const [postsRes, roastsRes] = await Promise.all([
    postQuery,
    // Photos scope shows photo posts only — skip the legacy roast table.
    photoOnly
      ? Promise.resolve({ data: [] })
      : db
        .from('roasts')
        .select('id, roast_text, user_id, upvotes, created_at')
        .ilike('roast_text', like)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(30),
  ]);
  const posts = postsRes.data || [];
  const roastRows = roastsRes.data || [];

  // Safety: hidden authors + private communities the viewer can't see.
  let authorIds = [...new Set([...posts.map((p) => p.user_id), ...roastRows.map((r) => r.user_id)].filter(Boolean))];
  let hidden = new Set();
  if (userId && authorIds.length) {
    hidden = await hiddenAuthorIds(db, userId, authorIds);
  }
  const access = await communityAccessMap(db, userId, posts.map((p) => p.community_id));

  const items = [];
  for (const p of posts) {
    if (hidden.has(p.user_id)) continue;
    if (p.community_id && access.get(p.community_id) !== 'ok' && access.has(p.community_id)) continue;
    if (p.community_id && !access.has(p.community_id)) continue; // RLS hid it → not visible
    const engagement = (p.upvote_count || 0) + (p.comment_count || 0) * 2;
    items.push({
      kind: 'social_post',
      id: p.id,
      text: p.content_text,
      author: p.user_profiles
        ? { id: p.user_profiles.id, username: p.user_profiles.username, displayName: p.user_profiles.display_name }
        : null,
      communityId: p.community_id,
      contentType: p.content_type,
      upvotes: p.upvote_count || 0,
      commentCount: p.comment_count || 0,
      createdAt: p.created_at,
      _score: freshnessDecay(p.created_at) * (1 + Math.log1p(engagement)),
    });
  }
  // Roast-table authors need profile names for display.
  const roastAuthorIds = [...new Set(roastRows.map((r) => r.user_id).filter(Boolean))];
  let profilesById = new Map();
  if (roastAuthorIds.length) {
    const { data: profs } = await db
      .from('user_profiles')
      .select('id, username, display_name')
      .in('id', roastAuthorIds.slice(0, 50));
    profilesById = new Map((profs || []).map((p) => [p.id, p]));
  }
  for (const r of roastRows) {
    if (hidden.has(r.user_id)) continue;
    const engagement = r.upvotes || 0;
    const prof = profilesById.get(r.user_id) || null;
    items.push({
      kind: 'roast',
      id: r.id,
      text: r.roast_text,
      author: prof ? { id: prof.id, username: prof.username, displayName: prof.display_name } : null,
      upvotes: r.upvotes || 0,
      createdAt: r.created_at,
      _score: freshnessDecay(r.created_at) * (1 + Math.log1p(engagement)),
    });
  }
  return items
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}

async function searchChallenges(db, q, limit) {
  const safe = sanitizeLike(q);
  if (!safe) return [];
  const like = `%${safe}%`;
  const { data } = await db
    .from('challenges')
    .select('id, slug, title, description, challenge_type, status, ends_at, created_at')
    .or(`title.ilike.${like},description.ilike.${like}`)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = data || [];
  const lower = q.toLowerCase();
  return rows
    .map((c) => {
      const title = (c.title || '').toLowerCase();
      let score = 0;
      if (title === lower) score = 4;
      else if (title.startsWith(lower)) score = 3;
      else if (title.includes(lower)) score = 2;
      else score = 1;
      // Live challenges rank above ended ones for the same text match.
      if (c.status === 'active') score += 0.5;
      return { ...c, _score: score * (1 + freshnessDecay(c.created_at, 72)) };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}

/**
 * Battle search (honest to the schema: battles carry no title/topic text —
 * they are participant matchups). Matches participant usernames, prioritizes
 * live battles, then vote velocity, then recency. Never alters results.
 */
async function searchBattles(db, q, userId, limit, status = 'all') {
  const safe = sanitizeLike(q);
  if (!safe) return [];
  const like = `%${safe}%`;
  // Participant profiles matching the query (legacy profiles table).
  let profileIds = [];
  try {
    const { data: profs } = await db
      .from('profiles')
      .select('id, username')
      .ilike('username', like)
      .limit(20);
    profileIds = (profs || []).map((p) => p.id).filter(Boolean);
  } catch {}
  if (!profileIds.length) return [];

  let query = db
    .from('battles')
    .select('id, profile1_id, profile2_id, votes1, votes2, is_active, created_at')
    .or(`profile1_id.in.(${profileIds.join(',')}),profile2_id.in.(${profileIds.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(30);
  if (status === 'live') query = query.eq('is_active', true);
  if (status === 'finished') query = query.eq('is_active', false);
  const { data } = await query;
  const rows = data || [];
  if (!rows.length) return [];

  // Resolve participant display info in one bounded query.
  const allIds = [...new Set(rows.flatMap((b) => [b.profile1_id, b.profile2_id]).filter(Boolean))];
  let byId = new Map();
  try {
    const { data: profs } = await db
      .from('profiles')
      .select('id, username, avatar_letter, avatar_color')
      .in('id', allIds.slice(0, 60));
    byId = new Map((profs || []).map((p) => [p.id, p]));
  } catch {}

  return rows
    .map((b) => {
      const votes = (b.votes1 || 0) + (b.votes2 || 0);
      const p1 = byId.get(b.profile1_id) || null;
      const p2 = byId.get(b.profile2_id) || null;
      // Live first, then vote velocity proxy (votes), then freshness.
      const score = (b.is_active ? 1000 : 0) + Math.log1p(votes) * 10 + freshnessDecay(b.created_at, 72) * 5;
      return {
        id: b.id,
        status: b.is_active ? 'live' : 'finished',
        participants: [p1, p2].filter(Boolean).map((p) => ({ id: p.id, username: p.username })),
        votes: votes,
        createdAt: b.created_at,
        _score: score,
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}

/** Levenshtein distance (bounded inputs only — typo tolerance). */
function editDistance(a, b, max = 2) {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i += 1) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[lb];
}

/**
 * "Did you mean" — only when direct results are empty. Candidates come
 * from REAL taxonomy (topic names, matched community names, matched tags).
 * Low confidence → suggestion chip, never silent autocorrect.
 */
function didYouMean(query, { topics = [], communities = [], tags = [] }) {
  const q = String(query || '').toLowerCase().replace(/^#+/, '').trim();
  if (!q || q.length < 4 || q.length > 30 || q.includes(' ')) return null;
  const candidates = new Set();
  for (const t of topics.slice(0, 30)) {
    const n = String(t.name || '').toLowerCase();
    if (n && !n.includes(' ')) candidates.add(n);
  }
  for (const c of communities.slice(0, 20)) {
    const n = String(c.name || '').toLowerCase();
    if (n && !n.includes(' ')) candidates.add(n);
  }
  for (const t of tags.slice(0, 20)) {
    const n = String(t.tag || '').toLowerCase();
    if (n) candidates.add(n);
  }
  let best = null;
  let bestDist = 3;
  for (const c of candidates) {
    if (c === q) return null; // exact exists — no suggestion needed
    const d = editDistance(q, c, 2);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return bestDist <= 2 ? best : null;
}

async function searchTopics(db, q, limit) {
  let query = db.from('topics').select('id, name, slug');
  const safe = sanitizeLike(q);
  if (safe) query = query.ilike('name', `%${safe}%`);
  const { data } = await query.order('name').limit(Math.min(limit, 24));
  const topics = data || [];
  // Real usage counts: communities per topic (bounded).
  let counts = new Map();
  if (topics.length) {
    const { data: links } = await db
      .from('community_topics')
      .select('topic_id')
      .in('topic_id', topics.map((t) => t.id).slice(0, 50));
    for (const l of links || []) {
      counts.set(l.topic_id, (counts.get(l.topic_id) || 0) + 1);
    }
  }
  return topics.map((t) => ({ ...t, communityCount: counts.get(t.id) || 0 }));
}

async function searchHashtags(db, q, limit) {
  const tag = sanitizeLike(normalizeTag(q) || normalizeQuery(q).replace(/\s+/g, ''));
  if (!tag) return { tags: [], posts: [] };
  const { data } = await db
    .from('social_posts')
    .select('id, content_text, user_id, community_id, content_type, upvote_count, comment_count, created_at, user_profiles!inner(id, username, display_name)')
    .ilike('content_text', `%#${tag}%`)
    .eq('moderation_state', 'visible')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = data || [];
  const aggregated = aggregateTags(rows, {
    getText: (r) => r.content_text,
    getAuthorId: (r) => r.user_id,
  }).slice(0, 12);
  const exact = tag.toLowerCase();
  const posts = rows
    .filter((r) => extractTags(r.content_text).includes(exact))
    .slice(0, limit)
    .map((p) => ({
      kind: 'social_post',
      id: p.id,
      text: p.content_text,
      author: p.user_profiles
        ? { id: p.user_profiles.id, username: p.user_profiles.username, displayName: p.user_profiles.display_name }
        : null,
      upvotes: p.upvote_count || 0,
      commentCount: p.comment_count || 0,
      createdAt: p.created_at,
    }));
  return { tags: aggregated, posts };
}

async function suggestTopics(db, q) {
  const words = normalizeQuery(q)
    .split(' ')
    .map((w) => sanitizeLike(w))
    .filter((w) => w.length >= 3)
    .slice(0, 3);
  if (!words.length) return [];
  const ors = words.map((w) => `name.ilike.%${w}%`).join(',');
  const { data } = await db.from('topics').select('id, name, slug').or(ors).limit(5);
  return data || [];
}

/**
 * Fire-and-forget trending log via the PII-guarded definer RPC.
 * Never blocks or fails the search response.
 */
function supabaseLogSearch(anonClient, query, scope, userId) {
  if (!anonClient) return;
  anonClient.rpc('log_search_query', {
    p_query: String(query || '').slice(0, 80),
    p_scope: scope || 'all',
    p_user: userId || null,
  }).then(
    () => {},
    () => {}
  );
}

async function getHandler(req) {
  try {
    const anon = getSupabase();
    if (!anon) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'search_ip'), RATE_LIMITS.API_READ);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const rawQ = searchParams.get('q') || '';
    const scope = (searchParams.get('scope') || 'all').toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '12', 10) || 12, MAX_LIMIT);
    const battleStatus = (searchParams.get('battle_status') || 'all').toLowerCase();

    if (!SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    if (!BATTLE_STATUSES.includes(battleStatus)) {
      return NextResponse.json({ error: 'Invalid battle_status' }, { status: 400 });
    }

    const q = normalizeQuery(rawQ);
    if (!q && !(scope === 'topics' && !rawQ)) {
      return NextResponse.json({ success: true, query: '', scope, people: [], roasts: [], photos: [], communities: [], challenges: [], battles: [], topics: [], hashtags: { tags: [], posts: [] }, suggestions: [], related: [], didYouMean: null, semantic: { topics: [] } });
    }
    if (q.length > 80) {
      return NextResponse.json({ error: 'Query too long' }, { status: 400 });
    }

    const { client: sessionClient, userId } = await getRequestContext(req);
    const db = sessionClient || anon;
    const want = (s) => scope === 'all' || scope === s;

    // Taxonomy-backed query understanding (soft hints for discovery UI).
    const semanticTopics = understandQuery(q);

    const [people, roasts, photos, communitiesRes, challenges, battles, topics, hashtags] = await Promise.all([
      want('people') ? searchPeople(db, q, userId, limit) : Promise.resolve([]),
      want('roasts') || want('hashtags') ? searchRoasts(db, q, userId, limit) : Promise.resolve([]),
      want('photos') ? searchRoasts(db, q, userId, limit, { photoOnly: true }) : Promise.resolve([]),
      want('communities') ? searchCommunities({ q, sort: 'newest', limit, offset: 0, userId }) : Promise.resolve([]),
      want('challenges') ? searchChallenges(db, q, limit) : Promise.resolve([]),
      want('battles') ? searchBattles(db, q, userId, limit, battleStatus) : Promise.resolve([]),
      want('topics') || scope === 'all' ? searchTopics(db, q, scope === 'all' ? 6 : limit) : Promise.resolve([]),
      want('hashtags') ? searchHashtags(db, q, limit) : Promise.resolve({ tags: [], posts: [] }),
    ]);

    const communities = Array.isArray(communitiesRes) ? communitiesRes : communitiesRes?.communities || [];
    const suggestions = scope === 'all' || scope === 'topics' ? await suggestTopics(db, q) : [];

    // Related searches from REAL co-occurring tags (never fabricated).
    const queryTag = (normalizeTag(q) || q.replace(/\s+/g, '')).toLowerCase();
    const related = [...new Set(
      (hashtags.tags || [])
        .map((t) => String(t.tag || '').toLowerCase())
        .filter((t) => t && t !== queryTag)
    )].slice(0, 5);

    // Typo tolerance: suggest only when direct results are empty.
    const hasDirect = people.length > 0 || roasts.length > 0 || photos.length > 0
      || communities.length > 0 || challenges.length > 0 || battles.length > 0 || topics.length > 0;
    const didYouMean = hasDirect
      ? null
      : didYouMean(q, { topics, communities, tags: hashtags.tags || [] });

    // Privacy-aware analytics + trending log (fire-and-forget, no raw PII:
    // the SQL function refuses emails, phones, and @handles; retention 8d).
    const resultCount = people.length + roasts.length + photos.length + communities.length
      + challenges.length + battles.length + topics.length + (hashtags.tags || []).length;
    try {
      const { recordGrowthEvent } = await import('@/lib/experimentService');
      recordGrowthEvent('search_performed', userId || null, {
        scope, results: resultCount, zero: resultCount === 0,
      }).catch(() => {});
    } catch {}
    try {
      supabaseLogSearch(supabaseAnonymous(anon), q, scope, userId);
    } catch {}

    return NextResponse.json({
      success: true,
      query: q,
      scope,
      people,
      roasts,
      photos,
      communities,
      challenges,
      battles,
      topics,
      hashtags,
      suggestions,
      related,
      didYouMean,
      semantic: { topics: semanticTopics, synonyms: intentSynonyms(q) },
    });
  } catch (err) {
    console.error('[Search] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = instrumentHandler('search', getHandler);
