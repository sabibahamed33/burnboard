/**
 * BURNBOARD — Semantic discovery abstraction (honest, lexical today).
 *
 * There is NO vector/embedding infrastructure in this codebase, so this
 * module does NOT fabricate semantic search. It provides:
 *
 *  1. `understandQuery(query)` — taxonomy-backed intent: matches the query
 *     against the REAL topic taxonomy (slugs + multilingual labels) and
 *     returns topic slugs the query relates to. Ranking code may use these
 *     as a soft relevance signal (boost, never filter).
 *  2. `semanticSearch()` — future vector-provider interface. Returns
 *     `{ available: false }` until a real provider is wired. Callers must
 *     treat unavailable as "lexical only", never as an error.
 *
 * Privacy/safety are enforced by callers (RLS + moderation + blocks) on
 * every candidate set — semantic hints never bypass them.
 */

import { allTopicLabels } from './topicLabels';

function baseLang(lang) {
  return String(lang || 'en').toLowerCase().split(/[-_]/)[0];
}

function norm(s) {
  try {
    return String(s || '').normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
  } catch {
    return String(s || '').toLowerCase().trim();
  }
}

/**
 * Map a raw query to related canonical topic slugs using the real
 * multilingual topic taxonomy. Returns [] when nothing matches.
 */
export function understandQuery(query, lang) {
  const q = norm(query);
  if (!q || q.length < 2) return [];
  const labels = allTopicLabels(lang);
  const hits = [];
  for (const { slug, label } of labels) {
    const l = norm(label);
    if (!l) continue;
    // Exact or strong containment either direction (word-ish).
    if (l === q || (q.length >= 4 && l.includes(q)) || (l.length >= 4 && q.includes(l))) {
      hits.push(slug);
    }
  }
  // Also match the canonical English slug itself ("pop-culture" etc).
  for (const { slug } of labels) {
    const s = norm(slug).replace(/-/g, ' ');
    if (s === q && !hits.includes(slug)) hits.push(slug);
  }
  return hits.slice(0, 3);
}

/**
 * Future vector search interface. Honest stub: reports unavailable so
 * callers fall back to lexical ranking. Never throws, never fakes.
 */
export async function semanticSearch() {
  return { available: false, reason: 'no-vector-provider', results: [] };
}

/**
 * Minimal synonym bridge for common discovery intents, grounded in the
 * product's own taxonomy (topics + content types). Conservative: only
 * high-confidence mappings, applied as boost hints alongside the query.
 */
const INTENT_SYNONYMS = {
  photo: ['photography'],
  photography: ['photo'],
  roast: ['roasts', 'burn', 'burns'],
  roasts: ['roast', 'burn', 'burns'],
  battle: ['battles', 'versus', 'vs'],
  battles: ['battle', 'versus', 'vs'],
  challenge: ['challenges', 'contest'],
  challenges: ['challenge', 'contest'],
};

export function intentSynonyms(query) {
  const q = norm(query).replace(/^#+/, '');
  if (!q || q.includes(' ')) return [];
  return INTENT_SYNONYMS[q] || [];
}
