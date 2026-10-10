import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, controlRateLimit, SECTION_ROLES } from '@/lib/staff';
import { getMetrics } from '@/lib/metrics';
import { listGroups, errorStats, recentEvents } from '@/lib/observability/errorStore';
import { PERF_BUDGETS } from '@/lib/observability/budgets';
import { getLastSyntheticRun, runSyntheticChecks, storeSyntheticRun } from '@/lib/observability/synthetic';
import { alertingConfigured, pendingAlerts } from '@/lib/observability/alerts';
import { getCacheStats } from '@/lib/cache';
import { getRateLimitStats } from '@/lib/serverRateLimit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/control/observability — unified real-telemetry snapshot (operations+).
 * Query: ?window=1h|24h|7d&severity=critical|high|medium|low
 * All sections report "unavailable" honestly when their source has no data.
 * No secrets, no env values, no user content, no stacks (presence flag only).
 */
export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.health);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const window = ['1h', '24h', '7d'].includes(searchParams.get('window')) ? searchParams.get('window') : '24h';
  const severity = ['critical', 'high', 'medium', 'low'].includes(searchParams.get('severity'))
    ? searchParams.get('severity')
    : null;

  const database = { status: 'unknown', latencyMs: null };
  try {
    const t0 = Date.now();
    const { error } = await staff.client.from('hot_seats').select('id', { count: 'exact', head: true }).limit(1);
    database.status = error ? 'error' : 'ok';
    database.latencyMs = Date.now() - t0;
  } catch {
    database.status = 'error';
  }

  let metrics = null;
  try {
    metrics = getMetrics();
  } catch {}

  let cache = null;
  try {
    cache = getCacheStats();
  } catch {}
  let rateLimiter = null;
  try {
    rateLimiter = getRateLimitStats();
  } catch {}

  const synthetic = getLastSyntheticRun();

  return NextResponse.json(
    {
      success: true,
      fetchedAt: new Date().toISOString(),
      window,
      deployment: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA
          ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 12)
          : 'unavailable',
        env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
        // Build/deploy outcome for THIS instance: it is serving, so it built.
        build: 'success',
        status: 'serving',
      },
      health: { app: { status: 'ok' }, database },
      errors: {
        stats: errorStats(window),
        groups: listGroups({ window, severity }),
        recent: recentEvents({ window, limit: 30 }),
      },
      metrics,
      cache,
      rateLimiter,
      synthetic: synthetic || { status: 'never_run', detail: 'No synthetic run yet on this instance.' },
      alerts: {
        configured: alertingConfigured(),
        pending: pendingAlerts(20),
      },
      budgets: PERF_BUDGETS,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * POST /api/control/observability — run synthetic checks on demand (operations+).
 * Safe anonymous subset only; authenticated journeys report not-configured.
 */
export async function POST(request) {
  const staff = await requireStaff(request, SECTION_ROLES.health);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId, undefined);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  try {
    const url = new URL(request.url);
    const base = `${url.protocol}//${url.host}`;
    const run = await runSyntheticChecks(base);
    storeSyntheticRun(run);
    try {
      const { evaluateAlerts } = await import('@/lib/observability/alerts');
      evaluateAlerts().catch(() => {});
    } catch {}
    return NextResponse.json({ success: true, run }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: 'Synthetic run failed.' }, { status: 500 });
  }
}
