/**
 * BURNBOARD Observability — budgets, thresholds, and alert rules.
 *
 * Budgets are set from observed production behavior (build baseline +
 * health latency) and recorded with their basis so the dashboard can show
 * them honestly. Tighten only after real-user measurements accumulate.
 */

export const PERF_BUDGETS = [
  // Lab/build baseline (measured 2026-10-10 production build).
  { metric: 'shared_js', budget: '100 kB', basis: 'lab', observed: '87.3 kB first-load shared' },
  { metric: 'explore_first_load', budget: '230 kB', basis: 'lab', observed: '206 kB' },
  { metric: 'home_first_load', budget: '260 kB', basis: 'lab', observed: '233 kB' },
  // API latency (observed: health-detail DB ping ~1100ms cold, ~100-300ms warm).
  { metric: 'api_p95', budget: '1500 ms', basis: 'observed', observed: 'health detail ~1177ms cold' },
  { metric: 'feed_initial_load', budget: '2500 ms', basis: 'observed', observed: 'to be measured via synthetic runs' },
  { metric: 'explore_search_latency', budget: '1500 ms', basis: 'observed', observed: 'to be measured via synthetic runs' },
  // Web-vitals targets (standard "good" thresholds; RUM pending).
  { metric: 'LCP', budget: '2500 ms', basis: 'standard', observed: 'RUM pending — no field data yet' },
  { metric: 'INP', budget: '200 ms', basis: 'standard', observed: 'RUM pending — no field data yet' },
  { metric: 'CLS', budget: '0.1', basis: 'standard', observed: 'RUM pending — no field data yet' },
  { metric: 'js_error_rate', budget: '< 1% of page views', basis: 'standard', observed: 'pending client-error volume' },
];

// Error-spike and latency rules. Cooldowns prevent noisy repeats.
export const ALERT_RULES = {
  // A single error group firing >= N times in 15m pages the on-call.
  spike: { windowMs: 15 * 60 * 1000, threshold: 20, cooldownMs: 60 * 60 * 1000 },
  // Any critical-severity group fires immediately (deduped per hour).
  critical: { cooldownMs: 60 * 60 * 1000 },
  // Synthetic check failing twice in a row (stored consecutiveFails >= 2).
  synthetic: { consecutiveFails: 2, cooldownMs: 30 * 60 * 1000 },
  // Auth failure burst: >= 10 auth-category events in 15m.
  authBurst: { windowMs: 15 * 60 * 1000, threshold: 10, cooldownMs: 30 * 60 * 1000 },
};

export const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const RESPONSE_CHECKLIST = [
  '1. Open the incident in /control/incidents and set severity + status.',
  '2. Check /api/health?detail=true and the Vercel deployment status.',
  '3. Correlate: error group first-seen time vs latest deployment commit.',
  '4. If a deployment regressed: prepare rollback (requires operator approval — never auto-rollback).',
  '5. Mitigate (feature flag, revert, or scale), then mark mitigated.',
  '6. Post recovery notification and resolve with a note.',
];
