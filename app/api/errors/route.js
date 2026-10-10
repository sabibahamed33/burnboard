import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { increment } from '@/lib/metrics';
import { recordError } from '@/lib/observability/errorStore';
import { evaluateAlerts } from '@/lib/observability/alerts';

const log = createLogger('client-errors');

// Sensitive patterns are stripped before logging — passwords, tokens,
// secrets, cookies, and message bodies never reach the logs.
const SENSITIVE_RE = /(password|secret|token|authorization|cookie|session|api[-_]?key|private[-_]?key|refresh[-_]?token|access[-_]?token)/i;

function redact(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (typeof value === 'string') {
    return SENSITIVE_RE.test(value) ? '[REDACTED]' : value.slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 30)) {
      out[k.slice(0, 80)] = SENSITIVE_RE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

// Simple in-memory rate limit: 30 reports / minute / IP.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (hits.get(ip) || []).filter((t) => t > windowStart);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 1000) hits.clear();
  return arr.length > 30;
}

/**
 * POST /api/errors — structured client error ingest.
 * Body: { kind, route, message, stack?, operation?, statusCode?, correlationId?, severity? }
 * Always returns { ok: true } (or 429 when rate-limited) so reporting can
 * never break the user experience. Events are grouped into incidents for
 * the staff observability dashboard; alert rules evaluate fire-and-forget.
 */
export async function POST(req) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json({ ok: false, error: 'Rate limited' }, { status: 429 });
    }
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const clean = redact({
      kind: body.kind,
      route: body.route,
      operation: body.operation,
      statusCode: body.statusCode,
      correlationId: body.correlationId || req.headers.get('x-request-id'),
      message: body.message,
      // Stack kept server-side only, truncated.
      stack: typeof body.stack === 'string' ? body.stack.slice(0, 2000) : undefined,
      ua: (req.headers.get('user-agent') || '').slice(0, 200),
      version: process.env.VERCEL_GIT_COMMIT_SHA
        ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 12)
        : undefined,
    });
    // Severity override honoured only for the known taxonomy values.
    if (['critical', 'high', 'medium', 'low'].includes(body.severity)) {
      clean.severity = body.severity;
    }
    log.error('client_error', {
      ...clean,
      env: process.env.NODE_ENV || 'production',
    });
    increment('client.errors', { kind: String(body.kind || 'client_error').slice(0, 40) });
    // Group into incidents + evaluate alert rules (never blocks response).
    try {
      recordError(clean);
      evaluateAlerts().catch(() => {});
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (err) {
    try {
      log.error('error_ingest_failed', { error: err?.message });
    } catch {}
    return NextResponse.json({ ok: true });
  }
}
