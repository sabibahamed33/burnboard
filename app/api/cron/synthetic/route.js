import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/adminGate';
import { runSyntheticChecks, storeSyntheticRun } from '@/lib/observability/synthetic';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/synthetic — scheduled safe smoke run (CRON_SECRET gated).
 * Anonymous checks only: homepage, health, feed tabs, trending, search,
 * negative authz control. Authenticated journeys stay not-configured until
 * TEST_* credentials exist. Evaluates alert rules after storing the run.
 */
export async function GET(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const base = `${url.protocol}//${url.host}`;
    const run = await runSyntheticChecks(base);
    storeSyntheticRun(run);
    try {
      const { evaluateAlerts } = await import('@/lib/observability/alerts');
      evaluateAlerts().catch(() => {});
    } catch {}
    return NextResponse.json(
      { success: true, at: run.at, runnablePassed: run.runnablePassed, runnable: run.runnable },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json({ error: 'Synthetic run failed.' }, { status: 500 });
  }
}
