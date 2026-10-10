/**
 * BURNBOARD — Admin access gate (server-side, Master Prompt 26)
 *
 * Single source of truth for every administrative API and dashboard.
 *
 * Security model:
 *   - FAIL CLOSED. There is no default password. If `ADMIN_PASSWORD` is not
 *     set in the environment, admin endpoints return 503 (admin_not_configured)
 *     — they never fall back to a well-known value.
 *   - Timing-safe comparison (sha256 of both sides, timingSafeEqual).
 *   - The cron bearer (`CRON_SECRET`) remains a separate, equally guarded
 *     channel for scheduled jobs / ops dashboards.
 *   - Never import this module from client code — it reads process.env and
 *     uses node:crypto. Client pages must verify through POST /api/admin/verify
 *     and carry the verified secret only in request headers for that session.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/** Is the shared admin secret configured for this deployment? */
export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD;
}

/**
 * Constant-time comparison of a presented secret against ADMIN_PASSWORD.
 * Returns { ok, code }. Lengths are equalized via SHA-256 so timing does not
 * leak the length of either value.
 */
export function verifyAdminSecret(secret) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return { ok: false, code: 'admin_not_configured' };
  if (!secret || typeof secret !== 'string' || secret.length === 0) {
    return { ok: false, code: 'missing' };
  }
  const a = createHash('sha256').update(secret).digest();
  const b = createHash('sha256').update(expected).digest();
  return { ok: timingSafeEqual(a, b), code: 'invalid' };
}

/** Is this request authorized via the cron bearer secret? */
export function isCronAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  try {
    const presented = req.headers.get('authorization') || '';
    // Constant-time like verifyAdminSecret (lengths equalized via SHA-256
    // so timing leaks neither value nor length).
    const a = createHash('sha256').update(presented).digest();
    const b = createHash('sha256').update(`Bearer ${cronSecret}`).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Check an incoming request against the admin gate.
 * Returns { ok: true, via: 'cron' | 'secret' } on success, or
 * { ok: false, status, code } where status is the HTTP status to return:
 *   503 admin_not_configured — ADMIN_PASSWORD is not set (fail closed)
 *   401 unauthorized        — wrong or missing secret
 */
export function checkAdminAccess(req) {
  if (isCronAuthorized(req)) return { ok: true, via: 'cron' };
  if (!adminConfigured()) return { ok: false, status: 503, code: 'admin_not_configured' };
  const provided = req.headers.get('x-admin-password') || '';
  if (provided && verifyAdminSecret(provided).ok) return { ok: true, via: 'secret' };
  return { ok: false, status: 401, code: 'unauthorized' };
}

/** 30d SHORT hash of an IP for security_logs (never store raw IPs). */
export function hashIp(ip) {
  if (!ip) return null;
  return createHash('sha256').update(String(ip)).digest('hex');
}

/**
 * Build the HTTP response for a denied access result (from checkAdminAccess).
 * 503 for not_configured (fail closed, never a default secret),
 * 401 for a wrong or missing secret.
 */
export function adminAccessResponse(access) {
  const status = access?.status === 503 ? 503 : 401;
  const body =
    status === 503
      ? { error: 'Admin access is not configured on this deployment.', code: 'admin_not_configured' }
      : { error: 'Unauthorized', code: access?.code || 'unauthorized' };
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
