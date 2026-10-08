/**
 * BURNBOARD Personalization — Viewer Interest State
 *
 * Loads everything the ranking engine needs to know about the signed-in
 * viewer in a handful of indexed, parallel queries:
 *   - personalization settings (on/off, interest reset)
 *   - follows → followed creators
 *   - community memberships → joined communities
 *   - explicit interests → selected topics
 *   - affinities → topic / creator / community / content_type scores
 *   - feedback → hidden content + repeated "not interested" scopes
 *
 * All reads go through the SSR client so RLS scopes them to the owner.
 * Returns plain data (maps/sets) — never exposed to any client.
 */

import { CANDIDATE_POOL } from './config';

export const FEEDBACK_HIDE = 'hide';
export const FEEDBACK_NOT_INTERESTED = 'not_interested';

/** Safe single-table fetch: returns rows [] on any failure (fail-soft). */
async function fetchRows(client, table, select, filters = [], extra = {}) {
  try {
    let q = client.from(table).select(select);
    for (const f of filters) q = f(q);
    const { data } = await q;
    return data || [];
  } catch (err) {
    console.error(`[Reco] viewer fetch error (${table}):`, err?.message || err);
    return [];
  }
}

/**
 * Load the viewer's full personalization state.
 * Returns null only when the viewer cannot be resolved (no client/session)
 * so callers can fall back to the generic (non-personalized) feed. When
 * personalization is disabled the state is returned with enabled=false — the
 * Following feed still needs the graph even when For You personalization is
 * turned off.
 */
export async function buildViewerState({ client, userId, locale: localeHint }) {
  if (!client || !userId) return null;

  const normLocale = (v) => {
    if (!v || typeof v !== 'string') return null;
    const base = v.toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2}$/.test(base) ? base : null;
  };

  const state = {
    userId,
    enabled: true,
    locale: normLocale(localeHint),
    follows: new Set(),        // creator ids the user follows
    joinedCommunities: new Set(),
    interests: [],             // [{ topic_id, name, slug }]
    interestsById: new Map(),
    affinities: { topic: new Map(), creator: new Map(), community: new Map(), content_type: new Map() },
    hiddenContent: new Map(),  // 'social_post:<id>' -> action
    negativeCreators: new Map(),   // creatorId -> feedback count
    negativeCommunities: new Map(),
    negativeTypes: new Map(),
    negativeTopics: new Map(),
    coldStart: false,
  };

  // ── Parallel reads (each fails soft to [] on error) ────────
  const [settingsRows, followRows, membershipRows, interestRows, affinityRows, feedbackRows] = await Promise.all([
    (async () => {
      try {
        const { data } = await client
          .from('user_personalization')
          .select('enabled, interests_selected')
          .eq('user_id', userId)
          .maybeSingle();
        return data || null;
      } catch (err) {
        console.error('[Reco] viewer settings error:', err?.message || err);
        return null;
      }
    })(),
    fetchRows(client, 'follows', 'following_id', [q => q.eq('follower_id', userId).order('created_at', { ascending: false }).limit(CANDIDATE_POOL.followingAuthorLimit)]),
    fetchRows(client, 'community_members', 'community_id', [q => q.eq('user_id', userId).eq('membership_status', 'active').limit(300)]),
    fetchRows(client, 'user_interests', 'topic_id, topics(id, name, slug)', [q => q.eq('user_id', userId).limit(60)]),
    fetchRows(client, 'user_affinities', 'dimension, key, label, positive, negative, signal_count, last_positive_at', [q => q.eq('user_id', userId).limit(500)]),
    fetchRows(client, 'rec_feedback', 'target_type, target_id, action, scope, updated_at', [q => q.eq('user_id', userId).order('updated_at', { ascending: false }).limit(500)]),
  ]);

  if (settingsRows) state.enabled = settingsRows.enabled !== false;

  for (const f of followRows || []) {
    if (f.following_id && f.following_id !== userId) state.follows.add(f.following_id);
  }
  for (const m of membershipRows || []) state.joinedCommunities.add(m.community_id);

  for (const row of interestRows || []) {
    const topic = row.topics;
    if (!topic) continue;
    state.interests.push({ topic_id: row.topic_id, name: topic.name, slug: topic.slug });
    state.interestsById.set(String(row.topic_id), topic.name);
  }

  for (const row of affinityRows || []) {
    const map = state.affinities[row.dimension];
    if (map) map.set(row.key, row);
  }

  for (const row of feedbackRows || []) {
    state.hiddenContent.set(`${row.target_type}:${row.target_id}`, row.action);
    if (row.action === FEEDBACK_NOT_INTERESTED) {
      const scope = row.scope || {};
      if (scope.author_id) {
        state.negativeCreators.set(String(scope.author_id), (state.negativeCreators.get(String(scope.author_id)) || 0) + 1);
      }
      if (scope.community_id) {
        state.negativeCommunities.set(String(scope.community_id), (state.negativeCommunities.get(String(scope.community_id)) || 0) + 1);
      }
      if (scope.content_type) {
        state.negativeTypes.set(String(scope.content_type), (state.negativeTypes.get(String(scope.content_type)) || 0) + 1);
      }
      for (const tid of Array.isArray(scope.topic_ids) ? scope.topic_ids : []) {
        if (tid) state.negativeTopics.set(String(tid), (state.negativeTopics.get(String(tid)) || 0) + 1);
      }
    }
  }

  const hasGraph = state.follows.size > 0
    || state.joinedCommunities.size > 0
    || state.interests.length > 0
    || Object.values(state.affinities).some(map => map.size > 0);

  state.coldStart = !hasGraph;

  // Viewer coarse locale (account preference wins, hint is fallback).
  // Coarse 2-letter signal, server-side ranking only — never exposed.
  try {
    const { data: prof } = await client
      .from('user_profiles')
      .select('locale')
      .eq('id', userId)
      .maybeSingle();
    state.locale = normLocale(prof?.locale) || state.locale;
  } catch {}

  return state;
}
