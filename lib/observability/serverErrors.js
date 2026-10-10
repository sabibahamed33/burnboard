/**
 * BURNBOARD Observability — server-side error capture helper.
 *
 * Redacts with the same rules as POST /api/errors, records into the
 * grouped store, and bumps metrics. Fire-and-forget safe: never throws,
 * never awaits on the request path (callers should NOT await it).
 */

import { increment } from '@/lib/metrics';
import { recordError } from './errorStore';

const SENSITIVE_RE = /(password|secret|token|authorization|cookie|session|api[-_]?key|private[-_]?key|refresh[-_]?token|access[-_]?token|message|body|text|content|bio|email)/i;

function redactValue(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (typeof value === 'string') {
    return SENSITIVE_RE.test(value) ? '[REDACTED]' : value.slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 30)) {
      out[k.slice(0, 80)] = SENSITIVE_RE.test(k) ? '[REDACTED]' : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function redactErrorData(data) {
  try {
    return redactValue(data);
  } catch {
    return {};
  }
}

/**
 * Capture a server-side exception. Do NOT await in request handlers.
 * @param {object} opts { kind, route, operation, statusCode, correlationId, message, stack }
 */
export function captureServerError(opts = {}) {
  try {
    const clean = redactValue({
      kind: opts.kind || 'server_exception',
      route: opts.route,
      operation: opts.operation,
      statusCode: opts.statusCode,
      correlationId: opts.correlationId,
      message: opts.message,
      stack: typeof opts.stack === 'string' ? opts.stack.slice(0, 2000) : undefined,
      env: process.env.NODE_ENV || 'production',
      version: process.env.VERCEL_GIT_COMMIT_SHA
        ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 12)
        : undefined,
    });
    recordError(clean);
    increment('server.errors', { kind: String(opts.kind || 'server_exception').slice(0, 40) });
  } catch {}
}
