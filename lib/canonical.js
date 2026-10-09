/**
 * BurnBoard — canonical public URLs (single routing authority).
 *
 * Every public object has exactly ONE canonical URL. Share surfaces
 * (Copy Link, native share, message cards, Open Graph) must use these —
 * never temporary preview URLs, internal API URLs, or query-parameter
 * variants. Query forms (e.g. /battle?battle=ID) are legacy aliases that
 * canonicalize to the path form on load.
 *
 * Photos are photo-content posts: their canonical URL is /post/:id.
 * (No separate /photo route — that would be a duplicate routing system.)
 */

export function getSiteBase() {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SITE_URL) {
    return String(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'https://burnboard.app';
}

function cleanSegment(value, max = 120) {
  const s = String(value || '').trim();
  if (!s || s.includes('/') || s.includes('?') || s.includes('#')) return null;
  return s.slice(0, max);
}

/**
 * Build the canonical path for a public resource.
 * Returns null when the identifier is malformed (callers render not-found).
 */
export function canonicalPathFor(resourceType, resourceId) {
  const id = cleanSegment(resourceId);
  if (!id) return null;
  switch (resourceType) {
    case 'profile':
      return `/u/${id.toLowerCase()}`;
    case 'social_post':
    case 'photo':
      return `/post/${id}`;
    case 'roast':
      return `/r/${id}`;
    case 'community':
      return `/c/${id.toLowerCase()}`;
    case 'battle':
      return `/battle/${id}`;
    case 'challenge':
      return `/challenges/${id.toLowerCase()}`;
    case 'topic':
      return `/topic/${id.toLowerCase()}`;
    case 'hashtag':
      return `/hashtag/${id.toLowerCase().replace(/^#+/, '')}`;
    default:
      return null;
  }
}

export function canonicalUrlFor(resourceType, resourceId, base) {
  const path = canonicalPathFor(resourceType, resourceId);
  if (!path) return null;
  return `${base || getSiteBase()}${path}`;
}
