import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, controlRateLimit, SECTION_ROLES } from '@/lib/staff';

/**
 * GET /api/control/audit?limit=&offset= — immutable audit trail (admin+).
 * Reads admin_audit_log via the staff-gated definer RPC plus recent
 * moderation_actions. No UPDATE/DELETE path exists anywhere.
 */
export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.audit);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  let entries = [];
  let total = 0;
  try {
    const { data } = await staff.client.rpc('staff_audit_list', { p_limit: limit, p_offset: offset });
    if (data?.success !== false) {
      entries = data?.entries || [];
      total = data?.total || 0;
    }
  } catch {}

  let moderation = [];
  try {
    const { data } = await staff.client
      .from('moderation_actions')
      .select('id, action_type, target_type, target_id, previous_state, new_state, moderator_id, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    moderation = data || [];
  } catch {}

  return NextResponse.json({ success: true, entries, total, moderation });
}
