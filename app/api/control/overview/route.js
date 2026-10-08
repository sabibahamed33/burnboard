import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, auditAction, controlRateLimit, SECTION_ROLES } from '@/lib/staff';

/**
 * GET /api/control/overview — platform operational overview (analyst+).
 * Every metric is best-effort against REAL tables/RPCs. Anything
 * unsupported returns null so the UI shows "Data unavailable" — never
 * fabricated numbers.
 */
export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.overview);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const out = {
    moderation: null,
    growth: null,
    fetchedAt: new Date().toISOString(),
  };

  try {
    const { data } = await staff.client.rpc('staff_platform_overview');
    if (data?.success !== false) out.moderation = data;
  } catch {}
  try {
    const { data } = await staff.client.rpc('get_growth_snapshots', { p_days: 2 });
    if (Array.isArray(data) && data.length) out.growth = data[0];
    else if (data && typeof data === 'object') out.growth = data;
  } catch {}

  auditAction(staff.client, { action: 'CONTROL_OVERVIEW_VIEWED', result: 'ok' });
  return NextResponse.json({ success: true, ...out });
}
