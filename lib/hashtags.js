/**
 * BURNBOARD — Hashtag utilities (no storage layer).
 *
 * Hashtags are explicit user-created labels extracted from content text at
 * read time. There is no hashtags table: tags are normalized on
 * extraction so #Gaming / #gaming / #GAMING always collapse to one
 * concept (`gaming`), and search aggregates counts from real matched
 * rows — never fabricated.
 */

// Match #tag (# followed by letters/numbers/underscore, unicode-aware).
const TAG_RE = /#([\p{L}\p{N}_]{2,40})/gu;

// Max tags taken from a single text (anti-spam cap for aggregation).
export const MAX_TAGS_PER_TEXT = 10;

/**
 * Normalize a raw tag to its canonical form. Returns null when malformed.
 * NFC-normalized + invisible/bidi controls stripped so visually identical
 * tags collapse safely; the user's original display text is never altered.
 */
export function normalizeTag(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let clean = raw.replace(/^#+/, '').trim().toLowerCase();
  try {
    clean = clean.normalize('NFC').replace(/[̀-ͯ‌-‏‪-‮⁦-⁯﻿]/g, '');
  } catch {}
  if (!/^[\p{L}\p{N}_]{2,40}$/u.test(clean)) return null;
  return clean;
}

/**
 * Extract unique canonical tags from text, preserving first-seen order.
 */
export function extractTags(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
  const seen = new Set();
  // Fresh regex instance per call (global regexes are stateful).
  const re = new RegExp(TAG_RE.source, TAG_RE.flags);
  let match;
  while ((match = re.exec(text)) !== null && found.length < MAX_TAGS_PER_TEXT) {
    const tag = normalizeTag(match[1]);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      found.push(tag);
    }
  }
  return found;
}

/**
 * Aggregate tag usage across rows: { tag, count, authors } sorted by
 * count desc. `getText`/`getAuthorId` adapt arbitrary row shapes.
 */
export function aggregateTags(rows, { getText, getAuthorId } = {}) {
  const stats = new Map();
  for (const row of rows || []) {
    const text = getText ? getText(row) : row?.content_text || row?.roast_text || '';
    const authorId = getAuthorId ? getAuthorId(row) : row?.user_id || null;
    for (const tag of extractTags(text)) {
      let entry = stats.get(tag);
      if (!entry) {
        entry = { tag, count: 0, authors: new Set() };
        stats.set(tag, entry);
      }
      entry.count += 1;
      if (authorId) entry.authors.add(authorId);
    }
  }
  return [...stats.values()]
    .map((e) => ({ tag: e.tag, count: e.count, authors: e.authors.size }))
    .sort((a, b) => b.count - a.count || b.authors - a.authors);
}

/**
 * Lightweight query normalization for search: lowercase, trim, collapse
 * whitespace. Also strips a leading # (hashtag searches).
 */
export function normalizeQuery(q) {
  return String(q || '').replace(/^#+/, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
