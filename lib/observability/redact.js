/**
 * BURNBOARD Observability — shared sensitive-data redactor (no dependencies).
 *
 * Single source of truth for telemetry redaction. Never logs passwords,
 * tokens, secrets, cookies, private message content, or personal data.
 * Importable from both server routes and plain-node security tests.
 */

const SENSITIVE_RE = /(password|secret|token|authorization|cookie|session|api[-_]?key|private[-_]?key|refresh[-_]?token|access[-_]?token|message|body|text|content|bio|email|phone|address)/i;

export function redactValue(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (typeof value === 'string') {
    return SENSITIVE_RE.test(value) ? '[REDACTED]' : value.slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 30)) {
      out[String(k).slice(0, 80)] = SENSITIVE_RE.test(k) ? '[REDACTED]' : redactValue(v, depth + 1);
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
