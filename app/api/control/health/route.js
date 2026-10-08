import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, controlRateLimit, SECTION_ROLES } from '@/lib/staff';
import { getCacheStats } from '@/lib/cache';
import { getRateLimitStats } from '@/lib/serverRateLimit';

/**
 * GET /api/control/health — system health from REAL signals (operations+).
 * Application, database (ping + queue depths), cache, and rate-limiter
 * state. No secrets, no env values, provider-neutral wording.
 * Anything unreachable is reported as unavailable — never fabricated.
 */
export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.health);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const health = {
    app: { status: 'ok' },
    database: { status: 'unknown', latencyMs: null },
    queues: { open_reports: null, escalated_reports: null },
    cache: null,
    rate_limiter: null,
    fetchedAt: new Date().toISOString(),
  };

  const t0 = Date.now();
  try {
    const { error } = await staff.client.from('hot_seats').select('id', { count: 'exact', head: true }).limit(1);
    health.database.status = error ? 'error' : 'ok';
    health.database.latencyMs = Date.now() - t0;
  } catch {
    health.database.status = 'error';
  }
  try {
    // Queue depths via the staff-gated definer (least-privilege safe for
    // non-moderator operations staff).
    const { data } = await staff.client.rpc('staff_platform_overview');
    if (data?.success !== false && data) {
      health.queues.open_reports = data.open_reports ?? null;
      health.queues.escalated_reports = data.escalated_reports ?? null;
    }
  } catch {}
  try {
    health.cache = getCacheStats();
  } catch {}
  try {
    health.rate_limiter = getRateLimitStats();
  } catch {}

  return NextResponse.json({ success: true, health });
}
