import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { hiddenAuthorIds } from '@/lib/safety';
import { searchCommunities } from '@/lib/communities';
import { normalizeQuery, normalizeTag, aggregateTags, extractTags } from '@/lib/hashtags';
import { instrumentHandler } from '@/lib/metrics';

/**
 * GET /api/search?q=...&scope=all|people|roasts|communities|topics|hashtags&limit=&offset=
 *
 * Server-side discovery search across entity types. Every scope reads only
 * real rows, respects blocks/mutes (hiddenAuthorIds), moderation state,
 * community visibility, and RLS (session client when signed in).
 * Hashtags are aggregated live from matched content — no stored counts,
 * nothing fabricated.
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

const SCOPES = ['all', 'people', 'roasts', 'communities', 'topics', 'hashtags'];
const MAX_LIMIT = 20;

/**
 * Strip characters that break PostgREST `or()` filter syntax or act as
 * LIKE wildcards. The surrounding %...% for contains-match is added by
 * each caller, so user-supplied wildcards are never honored.
 */
function sanitizeLike(q) {
  return String(q || '').replace(/[,()"%_\\]/g, '').trim();
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
  const { data } = await db
    .from('user_profiles')
    .select('id, username, display_name, bio, avatar_url, follower_count')
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .limit(30);
  let rows = (data || []).filter((p) => p.username);
  if (userId && rows.length) {
    const hidden = await hiddenAuthorIds(db, userId, rows.map((r) => r.id));
    if (hidden.size) rows = rows.filter((r) => !hidden.has(r.id));
  }
  const lower = q.toLowerCase();
  return rows
    .map((p) => {
      const uname = (p.username || '').toLowerCase();
      let score = 0;
      if (uname === lower) score = 4;
      else if (uname.startsWith(lower)) score = 3;
      else if (uname.includes(lower)) score = 2;
      else score = 1;
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

async function searchRoasts(db, q, userId, limit) {
  const safe = sanitizeLike(q);
  if (!safe) return [];
  const like = `%${safe}%`;
  const [postsRes, roastsRes] = await Promise.all([
    db
      .from('social_posts')
      .select('id, content_text, user_id, community_id, content_type, upvote_count, comment_count, created_at, user_profiles!inner(id, username, display_name)')
      .ilike('content_text', like)
      .eq('moderation_state', 'visible')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(30),
    db
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

    if (!SCOPES.includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }

    const q = normalizeQuery(rawQ);
    if (!q && !(scope === 'topics' && !rawQ)) {
      return NextResponse.json({ success: true, query: '', scope, people: [], roasts: [], communities: [], topics: [], hashtags: { tags: [], posts: [] }, suggestions: [] });
    }
    if (q.length > 80) {
      return NextResponse.json({ error: 'Query too long' }, { status: 400 });
    }

    const { client: sessionClient, userId } = await getRequestContext(req);
    const db = sessionClient || anon;
    const want = (s) => scope === 'all' || scope === s;

    const [people, roasts, communitiesRes, topics, hashtags] = await Promise.all([
      want('people') ? searchPeople(db, q, userId, limit) : Promise.resolve([]),
      want('roasts') || want('hashtags') ? searchRoasts(db, q, userId, limit) : Promise.resolve([]),
      want('communities') ? searchCommunities({ q, sort: 'newest', limit, offset: 0, userId }) : Promise.resolve([]),
      want('topics') || scope === 'all' ? searchTopics(db, q, scope === 'all' ? 6 : limit) : Promise.resolve([]),
      want('hashtags') ? searchHashtags(db, q, limit) : Promise.resolve({ tags: [], posts: [] }),
    ]);

    const communities = Array.isArray(communitiesRes) ? communitiesRes : communitiesRes?.communities || [];
    const suggestions = scope === 'all' || scope === 'topics' ? await suggestTopics(db, q) : [];

    return NextResponse.json({
      success: true,
      query: q,
      scope,
      people,
      roasts,
      communities,
      topics,
      hashtags,
      suggestions,
    });
  } catch (err) {
    console.error('[Search] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = instrumentHandler('search', getHandler);
