/**
 * BURNBOARD Observability — grouped in-memory error store (Stage A/B).
 *
 * Same tradeoff as lib/metrics.js and lib/cache.js: per-instance, zero
 * external dependencies, stable API so a Stage B promotion to a shared
 * store only changes this module's internals. Fail-soft: every method
 * guards against throwing so observability can never crash a request.
 *
 * Privacy: only REDACTED payloads are ever recorded. Callers must redact
 * before calling (app/api/errors does this server-side; server callers
 * use lib/observability/serverErrors.js which redacts the same way).
 * Stacks are server-visible only — the dashboard API truncates them.
 */

const MAX_GROUPS = 200;
const MAX_RECENT = 500;

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// kind → { category, severity, incidentFamily }
const KIND_TAXONOMY = {
  // Auth — signup/login/session failures page the on-call.
  auth_signup_failed: { category: 'auth', severity: 'high' },
  auth_login_failed: { category: 'auth', severity: 'high' },
  auth_session_failed: { category: 'auth', severity: 'high' },
  auth_callback_failed: { category: 'auth', severity: 'high' },
  auth_loop_suspected: { category: 'auth', severity: 'critical' },
  profile_init_failed: { category: 'auth', severity: 'high' },
  // Content surfaces.
  feed_failed: { category: 'feed', severity: 'high' },
  explore_failed: { category: 'discovery', severity: 'medium' },
  trending_failed: { category: 'discovery', severity: 'medium' },
  search_failed: { category: 'discovery', severity: 'medium' },
  post_failed: { category: 'content', severity: 'medium' },
  comment_failed: { category: 'content', severity: 'medium' },
  reaction_failed: { category: 'content', severity: 'low' },
  follow_failed: { category: 'social', severity: 'medium' },
  // Realtime / resources / server.
  realtime_failed: { category: 'realtime', severity: 'medium' },
  resource_error: { category: 'resources', severity: 'low' },
  api_error: { category: 'api', severity: 'medium' },
  server_exception: { category: 'server', severity: 'high' },
  web_vital: { category: 'performance', severity: 'low' },
  window_error: { category: 'client', severity: 'medium' },
  unhandled_rejection: { category: 'client', severity: 'medium' },
  route_error_boundary: { category: 'client', severity: 'medium' },
  global_error_boundary: { category: 'client', severity: 'high' },
};

function classify(kind) {
  return KIND_TAXONOMY[kind] || { category: 'client', severity: 'medium' };
}

// Normalize a message so repeats group: strip numbers, ids, urls, hashes.
function normalizeMessage(msg) {
  return String(msg || 'unknown')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8,}-[0-9a-f-]{4,}/gi, '<id>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function fingerprint({ kind, route, message }) {
  return `${kind || 'unknown'}|${route || '/'}|${normalizeMessage(message)}`;
}

const groups = new Map(); // fingerprint -> group
const recent = []; // ring of recent redacted events (bounded)

export function recordError(event) {
  try {
    const kind = String(event?.kind || 'client_error').slice(0, 60);
    const { category, severity } = classify(kind);
    const route = String(event?.route || '/').slice(0, 160);
    const fp = fingerprint({ kind, route, message: event?.message });
    const now = new Date().toISOString();
    const nowMs = Date.now();

    let group = groups.get(fp);
    if (!group) {
      if (groups.size >= MAX_GROUPS) {
        // Evict the oldest-quiet group rather than growing unbounded.
        let oldestKey = null;
        let oldestSeen = Infinity;
        for (const [k, g] of groups) {
          if (g.lastSeenMs < oldestSeen) {
            oldestSeen = g.lastSeenMs;
            oldestKey = k;
          }
        }
        if (oldestKey) groups.delete(oldestKey);
      }
      group = {
        fingerprint: fp,
        kind,
        category,
        severity: event?.severity && SEVERITIES.includes(event.severity) ? event.severity : severity,
        route,
        message: normalizeMessage(event?.message),
        firstSeen: now,
        firstSeenMs: nowMs,
        lastSeen: now,
        lastSeenMs: nowMs,
        count: 0,
        statusCodes: {},
        lastAlertAt: 0,
        recoveredNotified: true,
      };
      groups.set(fp, group);
    }
    group.count += 1;
    group.lastSeen = now;
    group.lastSeenMs = nowMs;
    // A group that fires again after 30m quiet is "new" for alerting.
    if (nowMs - group.lastAlertAt > 30 * 60 * 1000) group.recoveredNotified = false;
    const sc = event?.statusCode;
    if (sc !== undefined && sc !== null) {
      const key = String(sc).slice(0, 8);
      group.statusCodes[key] = (group.statusCodes[key] || 0) + 1;
    }
    if (event?.stack && !group.stack) {
      group.stack = String(event.stack).slice(0, 2000);
    }

    recent.unshift({
      fingerprint: fp,
      kind,
      category,
      severity: group.severity,
      route,
      message: normalizeMessage(event?.message),
      statusCode: sc ?? null,
      correlationId: event?.correlationId || null,
      at: now,
      atMs: nowMs,
    });
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
    return group;
  } catch {
    return null;
  }
}

const WINDOWS = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3 };

export function listGroups({ window = '24h', severity = null } = {}) {
  try {
    const span = WINDOWS[window] || WINDOWS['24h'];
    const cutoff = Date.now() - span;
    const out = [];
    for (const g of groups.values()) {
      if (g.lastSeenMs < cutoff) continue;
      if (severity && SEVERITIES.includes(severity) && g.severity !== severity) continue;
      const { stack, ...rest } = g;
      out.push({
        ...rest,
        // Stacks stay server-side; dashboard shows presence only.
        hasStack: !!stack,
      });
    }
    return out.sort((a, b) => b.count - a.count || b.lastSeenMs - a.lastSeenMs);
  } catch {
    return [];
  }
}

export function errorStats(window = '24h') {
  try {
    const span = WINDOWS[window] || WINDOWS['24h'];
    const cutoff = Date.now() - span;
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const byCategory = {};
    let total = 0;
    let activeGroups = 0;
    for (const g of groups.values()) {
      if (g.lastSeenMs < cutoff) continue;
      activeGroups += 1;
      total += g.count;
      bySeverity[g.severity] = (bySeverity[g.severity] || 0) + g.count;
      byCategory[g.category] = (byCategory[g.category] || 0) + g.count;
    }
    // Recent-event rate (last 15m) for spike detection.
    const spikeCutoff = Date.now() - 15 * 60 * 1000;
    let last15m = 0;
    for (const e of recent) {
      if (e.atMs < spikeCutoff) break;
      last15m += 1;
    }
    return { total, activeGroups, bySeverity, byCategory, last15m, window };
  } catch {
    return { total: 0, activeGroups: 0, bySeverity: {}, byCategory: {}, last15m: 0, window };
  }
}

export function recentEvents({ window = '24h', limit = 50 } = {}) {
  try {
    const span = WINDOWS[window] || WINDOWS['24h'];
    const cutoff = Date.now() - span;
    return recent.filter((e) => e.atMs >= cutoff).slice(0, Math.min(limit, 100));
  } catch {
    return [];
  }
}

/** Mark alert state on a group (dedup cooldown + recovery tracking). */
export function markAlerted(fingerprintKey, atMs = Date.now()) {
  try {
    const g = groups.get(fingerprintKey);
    if (g) {
      g.lastAlertAt = atMs;
      g.recoveredNotified = false;
    }
  } catch {}
}

export function markRecovered(fingerprintKey) {
  try {
    const g = groups.get(fingerprintKey);
    if (g) g.recoveredNotified = true;
  } catch {}
}

export { SEVERITIES, WINDOWS };
