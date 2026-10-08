import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';

/**
 * BURNBOARD — Internal staff authorization (Control Center).
 *
 * INTERNAL PRIVILEGED ROLES — never public account types. Every public
 * account remains a USER. Roles are granted by operators in SQL only;
 * no self-service promotion path exists anywhere.
 *
 * Enforcement is always server-side via definer RPCs (my_staff_roles(),
 * has_staff_role()) plus legacy is_admin/is_moderator profile flags.
 * Client-side role flags, hidden UI, localStorage, and URL params are
 * never trusted.
 */

export const STAFF_ROLES = [
  'super_admin',
  'admin',
  'safety_lead',
  'moderator',
  'support',
  'analyst',
  'operations',
];

// Section → minimum roles (least privilege per operational task).
export const SECTION_ROLES = {
  overview: ['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'analyst', 'operations'],
  users: ['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'operations'],
  audit: ['super_admin', 'admin'],
  flags: ['super_admin', 'admin', 'operations'],
  incidents: ['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'analyst', 'operations'],
  incidents_write: ['super_admin', 'admin', 'operations'],
  health: ['super_admin', 'admin', 'operations'],
  me: ['super_admin', 'admin', 'safety_lead', 'moderator', 'support', 'analyst', 'operations'],
};

export function isValidRole(role) {
  return STAFF_ROLES.includes(role);
}

/**
 * Resolve the signed-in caller's staff roles server-side.
 * Returns { ok, client, userId, roles } — ok=false when not staff.
 */
export async function requireStaff(request, allowedRoles) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) {
      return { ok: false, status: 401, error: 'Sign in required' };
    }
    let roles = [];
    try {
      const { data } = await auth.client.rpc('my_staff_roles');
      roles = Array.isArray(data) ? data.filter(isValidRole) : [];
    } catch {
      roles = [];
    }
    // Legacy operator flags (set in SQL only) map to staff roles so
    // existing safety operators keep access without new rows.
    if (!roles.length) {
      try {
        const { data: prof } = await auth.client
          .from('user_profiles')
          .select('is_admin, is_moderator')
          .eq('id', auth.userId)
          .single();
        if (prof?.is_admin) roles = ['admin', 'moderator'];
        else if (prof?.is_moderator) roles = ['moderator'];
      } catch {}
    }
    if (!roles.length || !roles.some((r) => allowedRoles.includes(r))) {
      return { ok: false, status: 403, error: 'Staff access required', client: auth.client, userId: auth.userId, roles };
    }
    return { ok: true, client: auth.client, userId: auth.userId, roles };
  } catch {
    return { ok: false, status: 500, error: 'Something went wrong. Please try again.' };
  }
}

export function staffDenied(result) {
  return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: result.status || 403 });
}

/** Best-effort audit write (never blocks the operation, never throws). */
export async function auditAction(client, { action, targetType = null, targetId = null, result = 'ok', reason = null, metadata = {} }) {
  if (!client || !action) return;
  try {
    await client.rpc('log_admin_action', {
      p_action: String(action).slice(0, 80),
      p_target_type: targetType ? String(targetType).slice(0, 40) : null,
      p_target_id: targetId ? String(targetId).slice(0, 120) : null,
      p_result: result,
      p_reason: reason ? String(reason).slice(0, 500) : null,
      p_metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
  } catch {}
}

/** Standard per-IP + per-user rate-limit gate for control APIs. */
export function controlRateLimit(request, userId, limit = RATE_LIMITS.API_READ) {
  try {
    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(request), 'control_ip'), RATE_LIMITS.API_READ);
    if (ipLimit.blocked) return ipLimit;
    if (userId) {
      const userLimit = rateLimitMiddleware(ipKey(userId, 'control_user'), limit);
      if (userLimit.blocked) return userLimit;
    }
  } catch {}
  return null;
}
