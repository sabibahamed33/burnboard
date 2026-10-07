/**
 * BurnBoard Home Feed — client-side feed identity + merge helpers.
 *
 * Single source of truth for feed item identity so pagination, realtime,
 * refresh, cache restores and re-renders can NEVER produce duplicate cards.
 *
 * Identity is `${type}:${id}` because roasts and social posts live in
 * different tables and may share numeric id spaces.
 *
 * Pure functions with no dependencies — safe to unit-test with plain node.
 */

/** Stable identity for a feed item. */
export function feedItemKey(item) {
  if (!item) return '';
  return `${item.type || 'unknown'}:${item.id}`;
}

/** Build a Set of keys for a list of items. */
export function feedKeySet(items) {
  const set = new Set();
  for (const item of items || []) {
    const key = feedItemKey(item);
    if (key !== 'unknown:undefined' && key !== ':') set.add(key);
  }
  return set;
}

/**
 * Merge freshly fetched items into the existing feed, dropping duplicates.
 * Returns a NEW array; never mutates inputs.
 *
 * @param {Array} prev - current feed items
 * @param {Array} incoming - newly fetched items
 * @param {boolean} isRefresh - when true, incoming replaces prev (still deduped internally)
 */
export function mergeFeedItems(prev, incoming, isRefresh = false) {
  const list = Array.isArray(incoming) ? incoming : [];
  if (isRefresh) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const key = feedItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }
  const seen = feedKeySet(prev);
  const out = Array.isArray(prev) ? prev.slice() : [];
  for (const item of list) {
    const key = feedItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Check whether a realtime payload id is already in the feed.
 * Payloads carry { id, type } minimum.
 */
export function isKnownItem(items, id, type) {
  const key = `${type || 'unknown'}:${id}`;
  for (const item of items || []) {
    if (feedItemKey(item) === key) return true;
  }
  return false;
}
