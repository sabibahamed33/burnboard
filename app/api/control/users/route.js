import { NextResponse } from 'next/server';
import { requireStaff, staffDenied, auditAction, controlRateLimit, SECTION_ROLES } from '@/lib/staff';

/**
 * GET /api/control/users?q=... — least-privilege USER lookup (support+).
 * Safe fields only: id, username, display name, bio, avatar, ban state,
 * follower count, creation date + active restrictions. Never emails,
 * auth data, or message contents. Every lookup is audited.
 */
export async function GET(request) {
  const staff = await requireStaff(request, SECTION_ROLES.users);
  if (!staff.ok) return staffDenied(staff);
  const limited = controlRateLimit(request, staff.userId);
  if (limited?.blocked) return NextResponse.json({ error: limited.response.error }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const userId = (searchParams.get('user_id') || '').trim();
  if (q.length < 2 && !userId) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 });
  }

  let users = [];
  try {
    if (userId) {
      // Exact-ID path: RLS-scoped safe read (public fields only; banned
      // accounts stay invisible here — use text search for full lookup).
      const { data: prof } = await staff.client
        .from('user_profiles')
        .select('id, username, display_name, bio, avatar_url, is_banned, follower_count, created_at')
        .eq('id', userId)
        .maybeSingle();
      if (prof) users = [prof];
    } else {
      const { data } = await staff.client.rpc('staff_user_lookup', { p_query: q, p_limit: 10 });
      if (data?.success !== false) users = data?.users || [];
    }
  } catch {}

  // Attach active restrictions per returned user (bounded, fail-soft).
  const enriched = [];
  for (const u of users.slice(0, 10)) {
    let restrictions = [];
    try {
      const { data } = await staff.client.rpc('staff_user_restrictions', { p_user: u.id });
      if (data?.success !== false) restrictions = data?.restrictions || [];
    } catch {}
    enriched.push({ ...u, restrictions });
  }

  auditAction(staff.client, {
    action: 'CONTROL_USER_LOOKUP',
    targetType: 'user_search',
    result: 'ok',
    metadata: { q: q ? q.slice(0, 40) : null, exact: !!userId, count: enriched.length },
  });
  return NextResponse.json({ success: true, users: enriched });
}
