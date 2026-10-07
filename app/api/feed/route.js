import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { instrumentHandler } from '@/lib/metrics';
import { transformRoastItem, transformSocialPostItem } from '@/lib/reco/items';
import { buildPersonalizedFeed, buildFollowingFeed } from '@/lib/reco/feedBuilder';
import { buildViewerState } from '@/lib/reco/viewer';
import { recordSignal } from '@/lib/reco/signals';

/**
 * GET /api/feed
 *
 * Social feed endpoint with multi-content support, ranking, and pagination.
 *
 * Query params:
 *   - tab:      'following' | 'for_you' | 'trending' (default: 'for_you')
 *   - cursor:   Following/Trending → ISO timestamp for cursor pagination.
 *               For You (personalized) → numeric page offset (opaque).
 *   - limit:    number (default: 20, max: 50)
 *   - window:   'now' | 'today' | 'week' | 'alltime' (trending tab only)
 *
 * Feed semantics:
 *   - following: chronological content from people the user chose to follow.
 *     Distinct from algorithmic recommendations — user intent stays clear.
 *   - for_you:   personalized ranking (affinity, diversity, exploration,
 *                negative feedback, safety filters) when signed in with
 *                personalization enabled. Anonymous/signed-out visitors get
 *                the previous generic ranking — never a blank feed.
 *   - trending:  unchanged engagement/recency ranking.
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

    // Timestamp cursors (Following/Trending) must look like ISO dates;
    // For You personalized cursors are numeric offsets — never mix them.
    const tsCursor = cursor && /^\d{4}-\d{2}/.test(cursor) ? cursor : null;

    // Resolve the signed-in viewer (session cookie) when present.
    const { client: sessionClient, userId } = await getRequestContext(req);
    const authed = !!(sessionClient && userId);

    // ── TRENDING (unchanged) ─────────────────────────────────
    if (tab === 'trending') {
      const { feedItems, nextCursor } = await buildGenericFeed(supabase, {
        cursor: tsCursor, limit, window, now,
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
      const state = await buildViewerState({ client: sessionClient, userId });
      if (state && state.enabled) {
        const offset = cursor ? (parseInt(cursor, 10) || 0) : 0;
        const result = await buildPersonalizedFeed({
          client: sessionClient, state, offset, limit,
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
    // Fail safe: never return a broken feed state.
    return NextResponse.json({ items: [], nextCursor: null, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = instrumentHandler('feed', getHandler);
