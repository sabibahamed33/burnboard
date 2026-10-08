/**
 * BURNBOARD — Unicode safety helpers (global text robustness).
 *
 * Centralizes safe text canonicalization used by search, hashtags, and
 * identity-adjacent checks:
 *   - NFC normalization (canonically equivalent strings compare equal)
 *   - Bidirectional control stripping (anti-spoofing / layout abuse)
 *   - Zero-width / invisible character stripping
 *   - Mixed-script (homoglyph) detection for spoof-risk signals
 *
 * Display text is NEVER rewritten — these helpers produce comparison keys
 * only. User content, usernames, and community names render exactly as
 * published.
 */

// Invisible / layout-abuse characters removed from comparison keys only.
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u061C\u180E]/g;

/** NFC-normalize any input to a string (never throws). */
export function toNFC(value) {
  try {
    return String(value ?? '').normalize('NFC');
  } catch {
    return String(value ?? '');
  }
}

/**
 * Comparison-safe key: NFC + strip invisible/bidi controls + trim +
 * collapse whitespace. Display original is preserved by callers.
 */
export function comparisonKey(value, maxLen = 200) {
  const nfc = toNFC(value).replace(INVISIBLE_RE, '');
  return nfc.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

/** True when text contains bidi override/embed controls (spoof risk). */
export function hasBidiControls(value) {
  try {
    return /[\u202A-\u202E\u2066-\u2069\u061C]/.test(String(value ?? ''));
  } catch {
    return false;
  }
}

/**
 * Crude mixed-script spoof signal: Latin mixed with Cyrillic or Greek in a
 * short identifier (classic homoglyph-attack shape, e.g. "аdmin").
 * Returns 'latin-cyrillic' | 'latin-greek' | null. Advisory only — never
 * blocks legitimate multilingual names.
 */
export function mixedScriptSignal(value) {
  let s = '';
  try {
    s = String(value ?? '');
  } catch {
    return null;
  }
  const hasLatin = /[A-Za-z]/.test(s);
  if (!hasLatin) return null;
  if (/[\u0400-\u04FF]/.test(s)) return 'latin-cyrillic';
  if (/[\u0370-\u03FF]/.test(s)) return 'latin-greek';
  return null;
}

/**
 * Sanitize a search query: comparison-safe + drop PostgREST `or()` syntax
 * breakers and LIKE wildcards. User wildcards are never honored.
 */
export function sanitizeSearchQuery(q, maxLen = 80) {
  const key = comparisonKey(q, maxLen);
  return key.replace(/[,()"%_\\]/g, '').trim();
}
