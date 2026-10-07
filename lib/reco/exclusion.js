/**
 * BURNBOARD — Session exclusion helpers (dependency-free).
 *
 * The For You feed is re-ranked on every request, so newly published items
 * can shift offsets between pages. To keep pagination duplicate-free AND
 * impression-aware (already-served items are fatigued, not re-served), the
 * client sends the bounded set of ids it has already displayed and the
 * builder filters them before slicing the page.
 *
 * Server identity is table-namespaced (`social_post:<id>` / `roast:<id>`);
 * the client maps its display types to these namespaces before sending.
 */

export const EXCLUDE_MAX = 150;
const KEY_RE = /^(social_post|roast):([A-Za-z0-9_-]{1,120})$/;

/**
 * Parse the `exclude` query param into a Set of `kind:id` keys.
 * Malformed entries are dropped — never throws.
 */
export function parseExcludeParam(raw, max = EXCLUDE_MAX) {
  const set = new Set();
  if (!raw || typeof raw !== 'string') return set;
  for (const part of raw.split(',')) {
    const key = part.trim().slice(0, 140);
    if (KEY_RE.test(key)) set.add(key);
    if (set.size >= max) break;
  }
  return set;
}

/** Server-namespaced key for a normalized candidate ({ kind, id }). */
export function candidateKey(candidate) {
  if (!candidate || !candidate.id || !candidate.kind) return '';
  return `${candidate.kind}:${candidate.id}`;
}

/**
 * Remove already-served candidates. Returns a NEW array; never mutates.
 */
export function excludeSeen(ordered, excludeSet) {
  if (!excludeSet || excludeSet.size === 0) return ordered;
  return (ordered || []).filter((s) => {
    const c = s?.candidate || s;
    return !excludeSet.has(candidateKey(c));
  });
}
