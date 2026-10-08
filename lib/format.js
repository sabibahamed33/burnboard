/**
 * BURNBOARD — Locale-aware formatting (single choke point).
 *
 * All user-visible dates, times, numbers, and currencies flow through here
 * so every locale gets correct rendering without scattered Intl calls.
 * Backend timestamps stay ISO UTC; display converts per user locale.
 *
 * No fake data: currency formatting only formats values the caller
 * supplies — it never invents prices.
 */

const LOCALE_MAP = {
  en: 'en-US',
  bn: 'bn-BD',
  hi: 'hi-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  ar: 'ar-EG',
};

export function intlLocale(lang) {
  if (!lang || typeof lang !== 'string') return 'en-US';
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return LOCALE_MAP[base] || 'en-US';
}

function safeDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Locale-aware date (e.g. 8 Oct 2026 / ৮ অক্টোবর ২০২৬). */
export function formatDate(value, lang, options = {}) {
  const d = safeDate(value);
  if (!d) return '';
  try {
    return d.toLocaleDateString(intlLocale(lang), { month: 'short', day: 'numeric', ...options });
  } catch {
    return d.toLocaleDateString('en-US', options);
  }
}

/** Locale-aware time, timezone-aware when `timeZone` is provided. */
export function formatTime(value, lang, options = {}) {
  const d = safeDate(value);
  if (!d) return '';
  try {
    return d.toLocaleTimeString(intlLocale(lang), { hour: 'numeric', minute: '2-digit', ...options });
  } catch {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

/** Locale-aware date + time. Pass IANA `timeZone` to render local time. */
export function formatDateTime(value, lang, options = {}) {
  const d = safeDate(value);
  if (!d) return '';
  try {
    return d.toLocaleString(intlLocale(lang), {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options,
    });
  } catch {
    return d.toLocaleString('en-US', options);
  }
}

const RTF_UNITS = [
  [60, 'second'],
  [3600, 'minute'],
  [86400, 'hour'],
  [86400 * 7, 'day'],
  [86400 * 30, 'week'],
  [86400 * 365, 'month'],
];

/**
 * Localized relative time ("5m" style short, or long "5 minutes ago").
 * Falls back to short manual form when Intl.RelativeTimeFormat is missing.
 */
export function formatRelative(value, lang, style = 'short') {
  const d = safeDate(value);
  if (!d) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 10) return style === 'short' ? 'now' : 'Just now';
  try {
    const rtf = new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: 'auto', style: style === 'short' ? 'narrow' : 'long' });
    let remaining = diffSec;
    let unit = 'second';
    let amount = diffSec;
    for (const [limit, name] of RTF_UNITS) {
      if (diffSec < limit) break;
      unit = name;
    }
    const divisors = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
    if (diffSec >= 86400 * 365) unit = 'year';
    amount = Math.max(1, Math.floor(diffSec / (divisors[unit] || 1)));
    void remaining;
    return rtf.format(-amount, unit);
  } catch {
    if (diffSec < 60) return 'now';
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d`;
    return formatDate(d, lang);
  }
}

/** Locale-aware full number (followers, votes, XP…). Never manual commas. */
export function formatNumber(n, lang) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  try {
    return new Intl.NumberFormat(intlLocale(lang)).format(num);
  } catch {
    return String(Math.trunc(num));
  }
}

/** Locale-aware compact number (1.2K style per locale). */
export function formatCompact(n, lang) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  try {
    return new Intl.NumberFormat(intlLocale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(num);
  } catch {
    return String(Math.trunc(num));
  }
}

/**
 * Currency architecture hook (Phase 17): formats a REAL amount in a REAL
 * currency for display. Never called with invented values anywhere.
 */
export function formatCurrency(amount, currency, lang) {
  const num = Number(amount);
  if (!Number.isFinite(num) || !currency) return '';
  try {
    return new Intl.NumberFormat(intlLocale(lang), { style: 'currency', currency: String(currency).toUpperCase() }).format(num);
  } catch {
    return `${num} ${currency}`;
  }
}
