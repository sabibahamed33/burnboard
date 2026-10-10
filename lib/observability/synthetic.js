/**
 * BURNBOARD Observability — safe anonymous synthetic checks.
 *
 * Covers the journeys that can run WITHOUT credentials (no writes, no
 * auth, no PII): homepage, health endpoints, feed tabs, trending API,
 * search + suggest, and the negative check that staff APIs reject
 * anonymous callers. Authenticated journeys (login/session/logout,
 * disposable signup, post/comment/follow) REQUIRE a dedicated test
 * account + TEST_* credentials, which are not configured — those checks
 * report `configured: false` ("Monitoring not configured") instead of
 * pretending to pass.
 *
 * Bounded: each check has an 8s timeout; the whole run is capped.
 */

const CHECK_TIMEOUT_MS = 8000;

async function timedFetch(url, { method = 'GET', headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { method, headers, signal: controller.signal, redirect: 'manual' });
    // Drain a bounded prefix so sockets close promptly.
    try {
      await res.text().then((t) => t.slice(0, 4096));
    } catch {}
    return { status: res.status, ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function checkResult(name, category, outcome) {
  return {
    name,
    category,
    ok: !!outcome.ok,
    status: outcome.status ?? null,
    ms: outcome.ms ?? null,
    detail: outcome.detail || null,
    configured: outcome.configured !== false,
    at: new Date().toISOString(),
  };
}

export const SYNTHETIC_DEFS = [
  { name: 'homepage', category: 'availability', path: '/', expect: 200 },
  { name: 'health_basic', category: 'health', path: '/api/health', expect: 200 },
  { name: 'health_detail', category: 'health', path: '/api/health?detail=true', expect: [200, 503] },
  { name: 'feed_latest', category: 'feed', path: '/api/feed?tab=latest&limit=2', expect: 200 },
  { name: 'feed_trending', category: 'feed', path: '/api/feed?tab=trending&limit=2', expect: 200 },
  { name: 'feed_rising', category: 'feed', path: '/api/feed?tab=rising&limit=2', expect: 200 },
  { name: 'trending_api', category: 'discovery', path: '/api/trending?type=all&window=today&limit=2', expect: 200 },
  { name: 'explore_page', category: 'discovery', path: '/explore', expect: 200 },
  { name: 'search_api', category: 'discovery', path: '/api/search?q=burn&limit=2', expect: 200 },
  { name: 'search_suggest', category: 'discovery', path: '/api/search/suggest?q=bu', expect: 200 },
  // Negative control: staff API must reject anonymous callers (401/403/503).
  { name: 'protected_rejects_anonymous', category: 'authz', path: '/api/control/me', expect: [401, 403, 503], negative: true },
  // Error pipeline reachable: ingest endpoint exists (405 on GET proves it).
  { name: 'error_pipeline', category: 'observability', path: '/api/errors', expect: [405], pipeline: true },
];

// Authenticated journeys — documented, never faked.
export const AUTH_JOURNEY_PLACEHOLDERS = [
  { name: 'login_test_account', category: 'auth', configured: false, detail: 'Requires TEST_USER_EMAIL/TEST_USER_PASSWORD — not configured.' },
  { name: 'session_persistence', category: 'auth', configured: false, detail: 'Requires test account session — not configured.' },
  { name: 'logout', category: 'auth', configured: false, detail: 'Requires test account session — not configured.' },
  { name: 'signup_disposable', category: 'auth', configured: false, detail: 'Requires disposable test identity policy — not configured.' },
  { name: 'profile_loading', category: 'auth', configured: false, detail: 'Requires test account — not configured.' },
  { name: 'post_comment_follow', category: 'content', configured: false, detail: 'Requires test account + content-cleanup policy — not configured.' },
];

export async function runSyntheticChecks(baseUrl) {
  const results = [];
  const base = String(baseUrl || '').replace(/\/$/, '');
  for (const def of SYNTHETIC_DEFS) {
    try {
      const { status, ms } = await timedFetch(`${base}${def.path}`);
      const expected = Array.isArray(def.expect) ? def.expect : [def.expect];
      const ok = expected.includes(status);
      results.push(checkResult(def.name, def.category, {
        ok,
        status,
        ms,
        detail: ok ? null : `Expected ${expected.join('/')} got ${status}`,
      }));
    } catch (err) {
      results.push(checkResult(def.name, def.category, {
        ok: false,
        status: null,
        ms: null,
        detail: err?.name === 'AbortError' ? 'Timeout after 8s' : String(err?.message || 'fetch failed').slice(0, 160),
      }));
    }
  }
  for (const p of AUTH_JOURNEY_PLACEHOLDERS) {
    results.push({ ...p, ok: false, status: null, ms: null, at: new Date().toISOString() });
  }
  const passed = results.filter((r) => r.ok).length;
  const runnable = results.filter((r) => r.configured !== false);
  return {
    at: new Date().toISOString(),
    baseUrl: base,
    passed,
    runnable: runnable.length,
    runnablePassed: runnable.filter((r) => r.ok).length,
    total: results.length,
    checks: results,
  };
}

// In-memory last-run (per-instance; dashboard shows freshness honestly).
let lastRun = null;
const consecutiveFails = new Map(); // check name -> count

export function storeSyntheticRun(run) {
  try {
    lastRun = run;
    for (const c of run.checks || []) {
      if (c.configured === false) continue;
      consecutiveFails.set(c.name, c.ok ? 0 : (consecutiveFails.get(c.name) || 0) + 1);
    }
  } catch {}
}

export function getLastSyntheticRun() {
  return lastRun;
}

export function getConsecutiveFails(name) {
  return consecutiveFails.get(name) || 0;
}
