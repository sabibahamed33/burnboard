/**
 * BURNBOARD — Hot Seat local fallback store
 *
 * Used when Supabase is not configured OR the `hot_seats` tables
 * have not been created yet in the Supabase project (fresh project).
 * This lets localhost dev + UI flows keep working instead of 500ing
 * with "Failed to create hot seat".
 *
 * NOTE: in-memory only (per server instance). Real persistence requires
 * running supabase/bootstrap.sql (or APPLY_TO_LIVE_DB.sql) in the
 * Supabase SQL Editor.
 *
 * IMPORTANT: state is stored on `globalThis`, NOT at module scope.
 * Next.js compiles every route handler into its own bundle, so a
 * module-level Map is evaluated once per route and the create route
 * would not see seats created by the detail/roast routes. A single
 * `globalThis` slot is shared by every bundle in the process (and
 * survives dev-server HMR re-evaluation).
 */

const STORE_KEY = '__burnboard_hotSeatFallbackStore__';

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = {
      // id -> seat
      seats: new Map(),
      // seatId -> roast[]
      roastsBySeat: new Map(),
      // roastId -> Map<participantId, reactionType>
      reactionsByRoast: new Map(),
    };
  }
  return globalThis[STORE_KEY];
}

function makeId(prefix = 'hs') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function createFallbackSeat({ category, title, context, heat_level, display_name }) {
  const store = getStore();
  const now = new Date().toISOString();
  const seat = {
    id: makeId('hs'),
    slug: null,
    display_name: (display_name || 'Anonymous').trim().slice(0, 40) || 'Anonymous',
    category,
    title: title.trim().slice(0, 200),
    context: (context || '').trim().slice(0, 500),
    heat_level: heat_level || 'savage',
    status: 'active',
    creator_id: null,
    roast_count: 0,
    image_url: null,
    created_at: now,
    updated_at: now,
    _fallback: true,
  };
  seat.slug = seat.id;
  seat.share_url = `/hot-seat/${seat.id}`;
  store.seats.set(seat.id, seat);
  store.roastsBySeat.set(seat.id, []);
  return seat;
}

export function getFallbackSeat(id) {
  return getStore().seats.get(id) || null;
}

export function listFallbackRoasts(seatId) {
  return getStore().roastsBySeat.get(seatId) || [];
}

export function createFallbackRoast(seatId, { roast_text, anon_id }) {
  const store = getStore();
  const seat = store.seats.get(seatId);
  if (!seat) return null;
  const roast = {
    id: makeId('roast'),
    hot_seat_id: seatId,
    roast_text: roast_text.trim(),
    anon_id: anon_id || 'Anonymous Roaster',
    is_hidden: false,
    created_at: new Date().toISOString(),
    _fallback: true,
  };
  store.roastsBySeat.get(seatId).unshift(roast);
  seat.roast_count = (seat.roast_count || 0) + 1;
  seat.updated_at = new Date().toISOString();
  return roast;
}

export function isFallbackId(id) {
  return typeof id === 'string' && (id.startsWith('hs-') || id.startsWith('roast-'));
}

// ── Reactions (fallback) ────────────────────────────────────

function emptyCounts() {
  return { funny: 0, savage: 0, fatal: 0, total: 0 };
}

function countsForRoast(roastId) {
  const byParticipant = getStore().reactionsByRoast.get(roastId);
  const counts = emptyCounts();
  if (byParticipant) {
    for (const type of byParticipant.values()) {
      if (counts[type] !== undefined) counts[type]++;
      counts.total++;
    }
  }
  return counts;
}

/** Aggregate reaction counts + this participant's own reactions for a seat. */
export function listFallbackReactions(seatId, participantId) {
  const reactions = {};
  const participantReactions = {};
  if (!getStore().seats.has(seatId)) {
    return { reactions, participantReactions };
  }
  for (const roast of listFallbackRoasts(seatId)) {
    const counts = countsForRoast(roast.id);
    if (counts.total > 0) reactions[roast.id] = counts;
    const mine = getStore().reactionsByRoast.get(roast.id)?.get(participantId);
    if (mine) participantReactions[roast.id] = mine;
  }
  return { reactions, participantReactions };
}

/**
 * Toggle a reaction on a fallback roast.
 * Returns null when the roast doesn't exist in the fallback store.
 */
export function toggleFallbackReaction(seatId, roastId, participantId, reactionType) {
  const store = getStore();
  const roast = listFallbackRoasts(seatId).find(r => r.id === roastId);
  if (!roast) return null;

  let byParticipant = store.reactionsByRoast.get(roastId);
  if (!byParticipant) {
    byParticipant = new Map();
    store.reactionsByRoast.set(roastId, byParticipant);
  }

  const current = byParticipant.get(participantId);
  let action;
  if (current === reactionType) {
    byParticipant.delete(participantId);
    action = 'removed';
  } else {
    byParticipant.set(participantId, reactionType);
    action = current ? 'changed' : 'added';
  }

  return {
    action,
    reaction_type: byParticipant.get(participantId) || null,
    counts: countsForRoast(roastId),
  };
}

/**
 * True when a Supabase error means "table doesn't exist / schema not applied".
 * PostgREST returns PGRST205 when the table isn't in the schema cache.
 */
export function isMissingTableError(err) {
  if (!err) return false;
  const code = err.code || err?.code;
  const msg = String(err.message || err.hint || err.details || '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    /could not find the table|relation .* does not exist|schema cache/i.test(msg)
  );
}
