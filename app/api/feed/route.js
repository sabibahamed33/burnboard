import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { instrumentHandler } from '@/lib/metrics';
import { transformRoastItem, transformSocialPostItem } from '@/lib/reco/items';
import { buildPersonalizedFeed, buildFollowingFeed, attachTaggedUsers } from '@/lib/reco/feedBuilder';
import { parseExcludeParam } from '@/lib/reco/exclusion';
import { buildViewerState } from '@/lib/reco/viewer';
import { recordSignal } from '@/lib/reco/signals';

/**
 * GET /api/feed
 *
 * Social feed endpoint with multi-content support, ranking, and pagination.
 *
 * Query params:
 *   - tab:      'following' | 'for_you' | 'trending' | 'rising' | 'latest'
 *               (default: 'for_you')
 *   - cursor:   Following/Trending/Rising/Latest → ISO timestamp cursor.
 *               For You (personalized) → numeric page offset (opaque).
 *   - limit:    number (default: 20, max: 50)
 *   - window:   'now' | 'today' | 'week' | 'alltime' (trending tab only)
 *
 * Feed semantics (documented ranking windows, dedup, fallbacks):
 *   - following: chronological content from people the user chose to follow.
 *     Distinct from algorithmic recommendations — user intent stays clear.
 *   - for_you:   personalized ranking (affinity, diversity, exploration,
 *                negative feedback, safety filters) when signed in with
 *                personalization enabled. Anonymous/signed-out visitors get
 *                the previous generic ranking — never a blank feed.
 *   - trending:  sustained high engagement + time decay (lifetime winners
 *                allowed). Window controls the recency horizon.
 *   - rising:    NEWER or less-established content gaining traction fast:
 *                velocity = engagement / (ageHours + 2)^1.2, age capped at
 *                72h, engagement must be > 0. Old posts can never top this
 *                even with huge lifetime totals (velocity collapses with age).
 *                Falls back to trending order when no velocity signal exists.
 *   - latest:    pure recency — eligible public content ordered by
 *                publication time only (no scoring). Never labeled trending.
 *   Dedup: rows are keyed `${type}:${id}` client-side (mergeFeedItems) and
 *   the server pages over the chronological frontier so ranked display order
 *   can never skip or repeat rows between pages.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ── Legacy ranking helpers (generic For You fallback + Trending) ──
function calculateFeedScore(item, now) {
  const createdAt = new Date(item.created_at).getTime();
  const ageInHours = Math.max(0.1, (now - createdAt) / (1000 * 60 * 60));

  const recencyScore = Math.max(0, 100 - (ageInHours / 48) * 100);

  const engagement = (
    (item.reaction_haha || 0) * 3 +
    (item.reaction_brutal || 0) * 2 +
    (item.reaction_cry || 0) * 4 +
    (item.upvotes || 0) * 1 +
    (item.upvote_count || 0) * 1
  );

  const velocityScore = engagement / Math.max(ageInHours, 1);

  return recencyScore + engagement * 2 + velocityScore * 10;
}

function calculateTrendingScore(item, now, window) {
  const createdAt = new Date(item.created_at).getTime();
  const ageInHours = Math.max(0.1, (now - createdAt) / (1000 * 60 * 60));

  const decayHours = { now: 6, today: 24, week: 168, alltime: 720 }[window] || 24;
  const timeDecay = Math.max(0, 1 - ageInHours / decayHours);

  const engagement = (
    (item.reaction_haha || 0) * 3 +
    (item.reaction_brutal || 0) * 2 +
    (item.reaction_cry || 0) * 4 +
    (item.upvotes || 0) * 1 +
    (item.upvote_count || 0) * 1
  );

  return engagement * timeDecay + timeDecay * 50;
}

function engagementOfRow(item) {
  return (
    (item.reaction_haha || 0) * 3 +
    (item.reaction_brutal || 0) * 2 +
    (item.reaction_cry || 0) * 4 +
    (item.upvotes || 0) * 1 +
    (item.upvote_count || 0) * 1 +
    (item.comment_count || 0) * 2
  );
}

function risingVelocity(engagement, ageHours) {
  // Age-adjusted velocity: young posts with real engagement outrank old
  // posts with large lifetime totals. Exponent > 1 punishes age harder.
  return engagement / Math.pow(ageHours + 2, 1.2);
}

/**
 * Latest feed: eligible public content ordered by publication time only.
 * Safety allowlist mirrors buildGenericFeed (public posts; non-hidden
 * roasts). Cursor pages over created_at. No scoring, no labels.
 */
async function buildLatestFeed(supabase, { cursor, limit }) {
  let roastQuery = supabase
    .from('roasts')
    .select('*, profiles!inner(id, username, platform, avatar_letter, avatar_color, tagline, bio)')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  let postQuery = supabase
    .from('social_posts')
    .select('*, user_profiles!inner(id, username, display_name, bio), polls(*)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    roastQuery = roastQuery.lt('created_at', cursor);
    postQuery = postQuery.lt('created_at', cursor);
  }

  const [roastResult, postResult] = await Promise.all([roastQuery, postQuery]);
  const roasts = roastResult.data || [];
  const posts = postResult.data || [];

  const transformed = [];
  for (const r of roasts) transformed.push(transformRoastItem(r));
  for (const p of posts) transformed.push(transformSocialPostItem(p));
  transformed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const hasMore = roasts.length > limit || posts.length > limit || transformed.length > limit;
  const page = transformed.slice(0, limit);
  const times = page.map((i) => i.createdAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
  const nextCursor = hasMore && times.length > 0 ? times[times.length - 1] : null;
  await attachTaggedUsers(supabase, page);
  return { feedItems: page, nextCursor };
}

/**
 * Rising feed: newer/less-established content gaining traction.
 * Candidate window: last 72h, engagement > 0. Ranked by age-adjusted
 * velocity (NOT raw totals). Falls back to trending score order when no
 * velocity signal exists (quiet corpus) so the tab never dead-ends.
 */
async function buildRisingFeed(supabase, { cursor, limit, now }) {
  const since = new Date(now - 72 * 60 * 60 * 1000).toISOString();
  let roastQuery = supabase
    .from('roasts')
    .select('*, profiles!inner(id, username, platform, avatar_letter, avatar_color, tagline, bio)')
    .eq('is_hidden', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit * 4 + 10);

  let postQuery = supabase
    .from('social_posts')
    .select('*, user_profiles!inner(id, username, display_name, bio), polls(*)')
    .eq('visibility', 'public')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit * 4 + 10);

  if (cursor) {
    roastQuery = roastQuery.lt('created_at', cursor);
    postQuery = postQuery.lt('created_at', cursor);
  }

  const [roastResult, postResult] = await Promise.all([roastQuery, postQuery]);
  const roasts = roastResult.data || [];
  const posts = postResult.data || [];

  const scored = [];
  for (const r of [...roasts, ...posts]) {
    const createdAt = new Date(r.created_at).getTime();
    const ageHours = Math.max(0.1, (now - createdAt) / (1000 * 60 * 60));
    const eng = engagementOfRow(r);
    if (eng <= 0) continue; // rising requires real traction
    scored.push({ row: r, velocity: risingVelocity(eng, ageHours), eng, ageHours });
  }
  scored.sort((a, b) => b.velocity - a.velocity);

  // Fallback: quiet corpus (no engagement yet) → trending-score order over
  // the same recency window so the tab explains itself honestly.
  const rows = scored.length > 0
    ? scored.slice(0, limit).map((s) => s.row)
    : [...roasts, ...posts]
        .map((r) => ({ row: r, score: calculateTrendingScore(r, now, 'today') }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.row);

  const transformed = [];
  const roastIds = new Set(roasts.map((r) => r.id));
  for (const r of rows) {
    transformed.push(roastIds.has(r.id) ? transformRoastItem(r) : transformSocialPostItem(r));
  }

  const times = [...roasts.map((r) => r.created_at), ...posts.map((p) => p.created_at)]
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const hasMore = roasts.length >= limit * 2 || posts.length >= limit * 2;
  const nextCursor = hasMore && times.length > 0
    ? times[Math.min(limit - 1, times.length - 1)]
    : null;
  await attachTaggedUsers(supabase, transformed);
  return { feedItems: transformed.slice(0, limit), nextCursor, fallback: scored.length === 0 };
}
/**
 * Generic ranked feed (previous "for_you" behavior) — used when the viewer
 * is signed out or has personalization disabled. No behavior profiling.
 */
async function buildGenericFeed(supabase, { cursor, limit, window, now }) {
  let roastQuery = supabase
    .from('roasts')
    .select('*, profiles!inner(id, username, platform, avatar_letter, avatar_color, tagline, bio)')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  let postQuery = supabase
    .from('social_posts')
    .select('*, user_profiles!inner(id, username, display_name, bio), polls(*)')
    // Public discovery only — drafts/scheduled/restricted never surface.
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    roastQuery = roastQuery.lt('created_at', cursor);
    postQuery = postQuery.lt('created_at', cursor);
  }

  if (window) {
    const windowHours = { now: 6, today: 24, week: 168, alltime: 720 }[window] || 24;
    const since = new Date(now - windowHours * 60 * 60 * 1000).toISOString();
    roastQuery = roastQuery.gte('created_at', since);
    postQuery = postQuery.gte('created_at', since);
  }

  const [roastResult, postResult] = await Promise.all([roastQuery, postQuery]);
  const roasts = roastResult.data || [];
  const posts = postResult.data || [];

  // Chronological frontier: the cursor pages over created_at, so it must be
  // derived from chronological order — never from the ranked display order
  // (ranking ≠ recency would otherwise skip or repeat rows between pages).
  const chronological = [
    ...roasts.map(r => r.created_at),
    ...posts.map(p => p.created_at),
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const hasMore = roasts.length > limit || posts.length > limit || chronological.length > limit;
  const frontier = chronological.slice(0, limit);
  const nextCursor = hasMore && frontier.length > 0
    ? frontier[frontier.length - 1]
    : null;

  const transformed = [];
  for (const r of roasts) {
    const item = transformRoastItem(r);
    item.score = window
      ? calculateTrendingScore(r, now, window)
      : calculateFeedScore(r, now);
    transformed.push(item);
  }
  for (const p of posts) {
    const item = transformSocialPostItem(p);
    item.score = window
      ? calculateTrendingScore(p, now, window)
      : calculateFeedScore(p, now);
    transformed.push(item);
  }

  const feedItems = transformed.sort((a, b) => b.score - a.score).slice(0, limit);
  await attachTaggedUsers(supabase, feedItems);

  return { feedItems, nextCursor };
}

async function getHandler(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ items: [], nextCursor: null, error: 'Service not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') || 'for_you';
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 50);
    const window = searchParams.get('window') || 'today';
    const now = Date.now();

    // Timestamp cursors (Following/Trending/Rising/Latest) must look like ISO dates;
    // For You personalized cursors are numeric offsets — never mix them.
    const tsCursor = cursor && /^\d{4}-\d{2}/.test(cursor) ? cursor : null;

    // Resolve the signed-in viewer (session cookie) when present.
    const { client: sessionClient, userId } = await getRequestContext(req);
    const authed = !!(sessionClient && userId);

    // Opportunistic publish: the owner's own due scheduled posts flip the
    // moment they load the feed (owner-only RLS update; the daily cron
    // sweeps everything else). Fire-and-forget, bounded, never blocking.
    if (authed) {
      (async () => {
        try {
          const nowIso = new Date().toISOString();
          const { data: due } = await sessionClient
            .from('social_posts')
            .select('id, metadata')
            .eq('user_id', userId)
            .eq('visibility', 'scheduled')
            .lte('metadata->>scheduled_at', nowIso)
            .limit(10);
          for (const row of due || []) {
            try {
              const meta = { ...(row.metadata || {}) };
              const target = ['public', 'followers', 'only_me'].includes(meta.target_visibility)
                ? meta.target_visibility
                : 'public';
              delete meta.scheduled_at;
              meta.published_at = nowIso;
              await sessionClient
                .from('social_posts')
                .update({ visibility: target, metadata: meta, updated_at: nowIso })
                .eq('id', row.id)
                .eq('user_id', userId)
                .eq('visibility', 'scheduled');
            } catch {}
          }
        } catch {}
      })();
    }

    // ── TRENDING (unchanged) ─────────────────────────────────
    if (tab === 'trending') {
      const { feedItems, nextCursor } = await buildGenericFeed(supabase, {
        cursor: tsCursor, limit, window, now,
      });
      return NextResponse.json({ items: feedItems, nextCursor, tab, count: feedItems.length });
    }

    // ── RISING (velocity-ranked, age-adjusted, 72h window) ─────
    if (tab === 'rising') {
      const { feedItems, nextCursor, fallback } = await buildRisingFeed(supabase, {
        cursor: tsCursor, limit, now,
      });
      return NextResponse.json({ items: feedItems, nextCursor, tab, count: feedItems.length, fallback: !!fallback });
    }

    // ── LATEST (pure recency, no scoring) ──────────────────────
    if (tab === 'latest') {
      const { feedItems, nextCursor } = await buildLatestFeed(supabase, {
        cursor: tsCursor, limit,
      });
      return NextResponse.json({ items: feedItems, nextCursor, tab, count: feedItems.length });
    }

    // ── FOLLOWING (chronological, follows only) ──────────────
    if (tab === 'following') {
      if (!authed) {
        return NextResponse.json({
          items: [], nextCursor: null, tab,
          count: 0, requiresAuth: true,
          personalization: { signedIn: false, tab: 'following' },
        });
      }
      const state = await buildViewerState({ client: sessionClient, userId });
      const result = await buildFollowingFeed({
        client: sessionClient, userId, state, cursor: tsCursor, limit,
      });
      return NextResponse.json({
        items: result.items,
        nextCursor: result.nextCursor,
        tab,
        count: result.items.length,
        requiresAuth: result.requiresAuth || false,
        followingEmpty: result.followingEmpty || false,
        personalization: { signedIn: true, tab: 'following' },
      });
    }

    // ── FOR YOU ──────────────────────────────────────────────
    // Personalized ranking for signed-in users with personalization enabled.
    if (authed) {
      const langHint = (() => {
        const raw = (searchParams.get('lang') || '').toLowerCase().split(/[-_]/)[0];
        return /^[a-z]{2}$/.test(raw) ? raw : null;
      })();
      const state = await buildViewerState({ client: sessionClient, userId, locale: langHint });
      if (state && state.enabled) {
        const offset = cursor ? (parseInt(cursor, 10) || 0) : 0;
        // Session impression-awareness: the client sends ids it already
        // displayed (bounded); they are filtered before the page is sliced
        // so re-ranking shifts can't duplicate or skip content.
        const exclude = parseExcludeParam(searchParams.get('exclude'));
        // Development-only score diagnostics. Gated on NODE_ENV so
        // production can never emit internal ranking internals.
        const debug = process.env.NODE_ENV !== 'production' && searchParams.get('debug') === '1';
        const result = await buildPersonalizedFeed({
          client: sessionClient, state, offset, limit, exclude, debug,
        });

        // Weak impression signals from what was genuinely served (viewed).
        // Deduped per item per day and bounded to the first page items so
        // event ingestion never taxes feed reads; never blocks the response.
        if (result.items.length) {
          for (const item of result.items.slice(0, 10)) {
            recordSignal({
              client: sessionClient,
              userId,
              eventType: 'content_viewed',
              targetType: item.type === 'roast' ? 'roast' : 'social_post',
              targetId: item.id,
              context: {
                content_type: item.type,
                author_id: item.userId || null,
              },
              idempotencyKey: `view-${item.type === 'roast' ? 'roast' : 'social_post'}-${item.id}`,
              dedupeWindowHours: 24,
            }).catch(() => {});
          }
        }

        return NextResponse.json({
          items: result.items,
          nextCursor: result.nextCursor,
          tab,
          count: result.items.length,
          personalized: true,
          coldStart: !!result.coldStart,
          personalization: { signedIn: true, tab: 'for_you' },
        });
      }
    }

    // ── GENERIC fallback (previous behavior, signed out / disabled) ──
    const { feedItems, nextCursor } = await buildGenericFeed(supabase, {
      cursor: tsCursor, limit, window: null, now,
    });
    return NextResponse.json({
      items: feedItems, nextCursor, tab,
      count: feedItems.length,
      personalized: false,
      personalization: { signedIn: authed, tab: 'for_you' },
    });
  } catch (err) {
    console.error('[Feed] Error:', err);
    try {
      const { captureServerError } = await import('@/lib/observability/serverErrors');
      captureServerError({ kind: 'feed_failed', route: '/api/feed', operation: 'GET /api/feed', statusCode: 500, message: err?.message || 'Feed error', stack: err?.stack });
    } catch {}
    // Fail safe: never return a broken feed state.
    return NextResponse.json({ items: [], nextCursor: null, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = instrumentHandler('feed', getHandler);
