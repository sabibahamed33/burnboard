/**
 * BURNBOARD — Executive Infrastructure Dashboard API (Master Prompt 25)
 *
 * GET /api/admin/infrastructure
 *
 * One aggregate view of platform health for the /admin/infrastructure
 * dashboard (roadmap "next step #1": wire /api/metrics into a dashboard):
 *   - traffic     → per-instance request metrics (counts, errors, latency)
 *   - database    → live probe (status + latency)
 *   - cache       → in-memory cache size / freshness
 *   - rateLimiter → active rate-limit keys
 *   - queues      → notification queue depth (pending + processed 24h)
 *   - webhooks    → monetization payment events (pending / failed)
 *   - growth      → DAU/WAU snapshot for context
 *   - alerts      → computed, actionable alerts (no noise, no user data)
 *
 * Aggregate-only: no user-level data ever leaves this endpoint. Protected by
 * the same admin gate as /api/growth/analytics and /api/admin/financials.
 * Every subsystem degrades to a safe "unavailable" result — a failure in
 * one domain never 500s the whole dashboard.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMetrics } from '@/lib/metrics';
import { getCacheStats } from '@/lib/cache';
import { getRateLimitStats } from '@/lib/serverRateLimit';
import { computeGrowthSnapshot } from '@/lib/growth/analytics';
import { checkAdminAccess, adminAccessResponse } from '@/lib/adminGate';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Traffic summary from per-instance request metrics ──────
function summarizeTraffic(metrics) {
  const counters = metrics?.counters || {};
  const durations = metrics?.durations || {};
  let total = 0;
  let errors = 0;
  for (const [key, value] of Object.entries(counters)) {
    if (key.includes('.requests')) total += value;
    if (key.includes('.errors')) errors += value;
  }

  // Average latency across instrumented endpoints (avgMs per duration key).
  let latencyCount = 0;
  let latencyTotal = 0;
  let worstMax = 0;
  for (const entry of Object.values(durations)) {
    latencyCount += entry.count || 0;
    latencyTotal += (entry.avgMs || 0) * (entry.count || 0);
    worstMax = Math.max(worstMax, entry.maxMs || 0);
  }

  return {
    totalRequests: total,
    errors,
    errorRatePct: total > 0 ? Math.round((errors / total) * 1000) / 10 : 0,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencyTotal / latencyCount) : 0,
    worstLatencyMs: worstMax,
    instrumentedEndpoints: Object.keys(durations).length,
    collectedAt: metrics?.timestamp || null,
  };
}

// ── Database probe (live) ──────────────────────────────────
async function probeDatabase(client) {
  if (!client) return { status: 'unconfigured' };
  const start = Date.now();
  try {
    const { error } = await client
      .from('hot_seats')
      .select('id', { count: 'exact', head: true });
    return {
      status: error ? 'degraded' : 'ok',
      latencyMs: Date.now() - start,
      error: error?.message || null,
    };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, error: err?.message || 'probe failed' };
  }
}

// ── Queue depth (notification queue) ───────────────────────
async function probeNotificationQueue(client) {
  if (!client) return { status: 'unavailable' };
  try {
    const { count: pending, error: pendingErr } = await client
      .from('notification_queue')
      .select('id', { count: 'exact', head: true })
      .eq('processed', false);
    // A null count without an error means the table isn't readable/doesn't
    // exist in this project — surface "unavailable", never a false "ok".
    if (pendingErr || pending === null) return { status: 'unavailable' };
    return {
      status: 'ok',
      pending,
      processed24h: null, // exact-count on processed rows is skipped: the
      // pending depth is the actionable signal for backlog alerting.
    };
  } catch {
    return { status: 'unavailable' };
  }
}

// ── Webhook / payment event pipeline ───────────────────────
async function probePaymentEvents(client) {
  if (!client) return { status: 'unavailable' };
  try {
    const { count: pending, error: pendingErr } = await client
      .from('monetization_payment_events')
      .select('id', { count: 'exact', head: true })
      .in('status', ['received', 'processing']);
    if (pendingErr || pending === null) return { status: 'unavailable' };

    const { count: failed, error: failedErr } = await client
      .from('monetization_payment_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed');
    if (failedErr || failed === null) return { status: 'unavailable' };

    return { status: 'ok', pending, failed };
  } catch {
    return { status: 'unavailable' };
  }
}

// ── Alerts (actionable, threshold-based, non-noisy) ────────
function computeAlerts({ traffic, database, queues, webhooks, growth }) {
  const alerts = [];

  if (traffic.errorRatePct > 5) {
    alerts.push({
      type: 'error_rate',
      level: 'warn',
      detail: `Error rate is ${traffic.errorRatePct}% of requests (${traffic.errors} errors / ${traffic.totalRequests}). Check for a failing dependency or deployment regression.`,
    });
  }
  if (traffic.avgLatencyMs > 3000) {
    alerts.push({
      type: 'latency',
      level: 'warn',
      detail: `Average instrumented latency is ${traffic.avgLatencyMs}ms (worst ${traffic.worstLatencyMs}ms). Investigate slow queries or cache misses before users feel it.`,
    });
  }
  if (database.status === 'error' || database.status === 'degraded') {
    alerts.push({
      type: 'database',
      level: 'warn',
      detail: `Database probe is ${database.status} (${database.error || 'latency ' + database.latencyMs + 'ms'}).`,
    });
  }
  if (queues.status === 'ok' && (queues.pending || 0) > 1000) {
    alerts.push({
      type: 'queue_backlog',
      level: 'warn',
      detail: `Notification queue backlog is ${queues.pending} pending items — the queue worker may be behind or stalled.`,
    });
  }
  if (webhooks.status === 'ok') {
    if ((webhooks.pending || 0) > 100) {
      alerts.push({
        type: 'webhook_backlog',
        level: 'warn',
        detail: `${webhooks.pending} payment events are stuck pending processing — fulfillments are delayed.`,
      });
    }
    if ((webhooks.failed || 0) > 0) {
      alerts.push({
        type: 'webhook_failed',
        level: 'warn',
        detail: `${webhooks.failed} payment events failed processing. Review before any retry — never auto-retry financial events without evidence.`,
      });
    }
  }
  if (!growth) {
    alerts.push({
      type: 'growth_snapshot',
      level: 'info',
      detail: 'Growth snapshot unavailable (RPC not present or DB unconfigured). DAU/WAU context will appear once the growth migration is applied.',
    });
  }

  return alerts;
}

export async function GET(req) {
  const access = checkAdminAccess(req);
  if (!access.ok) return adminAccessResponse(access);

  const client = getSupabase();

  // Parallel, failure-soft collection — one broken domain never 500s this.
  const [metrics, database, queues, webhooks, growth] = await Promise.all([
    Promise.resolve(getMetrics()),
    probeDatabase(client),
    probeNotificationQueue(client),
    probePaymentEvents(client),
    computeGrowthSnapshot(client).catch(() => null),
  ]);

  const traffic = summarizeTraffic(metrics);
  const cache = getCacheStats();
  const rateLimiter = getRateLimitStats();

  const alerts = computeAlerts({ traffic, database, queues, webhooks, growth });

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      instance: {
        // Per-instance by design (in-memory metrics): on Vercel each function
        // instance reports its own slice. Aggregation across instances is a
        // Stage-B (Axiom/Grafana) concern — documented, not faked here.
        perInstance: true,
      },
      traffic,
      database,
      cache,
      rateLimiter,
      queues,
      webhooks,
      growth: growth
        ? {
            dau: growth.active?.dau ?? null,
            wau: growth.active?.wau ?? null,
            mau: growth.active?.mau ?? null,
            signups30d: growth.signups?.last30d ?? null,
          }
        : null,
      alerts,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}