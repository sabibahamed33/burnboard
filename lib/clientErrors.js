/**
 * BURNBOARD — Client error reporter (Phase 2 observability).
 *
 * Lightweight, privacy-safe: sends diagnostics to POST /api/errors with
 * redaction done server-side too. Never sends passwords, tokens, cookies,
 * or message bodies. Fire-and-forget, bounded, never blocks UI.
 */

function correlationId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function reportClientError(event) {
  try {
    if (typeof window === 'undefined') return;
    const payload = {
      kind: event?.kind || 'client_error',
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      message: String(event?.message || 'Unknown error').slice(0, 500),
      stack: typeof event?.stack === 'string' ? event.stack.slice(0, 2000) : undefined,
      operation: event?.operation,
      statusCode: event?.statusCode,
      correlationId: event?.correlationId || correlationId(),
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon('/api/errors', new Blob([body], { type: 'application/json' }));
        return;
      } catch {}
    }
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function installGlobalErrorReporters() {
  if (typeof window === 'undefined') return () => {};
  if (window.__bbErrorReportersInstalled) return () => {};
  window.__bbErrorReportersInstalled = true;
  const onError = (e) => {
    // Resource failures (img/script/link) surface as ErrorEvents with a
    // target but no message — classify separately, never as JS exceptions.
    try {
      const t = e?.target;
      if (t && t !== window && (t.tagName === 'IMG' || t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
        const src = (t.currentSrc || t.src || t.href || '').slice(0, 200);
        reportClientError({
          kind: 'resource_error',
          message: `resource failed: ${t.tagName} ${src || '(unknown src)'}`,
          operation: 'resource.onerror',
        });
        return;
      }
    } catch {}
    reportClientError({
      kind: 'window_error',
      message: e?.message || 'Window error',
      stack: e?.error?.stack,
      operation: 'window.onerror',
    });
  };
  const onRejection = (e) => {
    const reason = e?.reason;
    reportClientError({
      kind: 'unhandled_rejection',
      message: reason?.message || String(reason || 'Unhandled rejection'),
      stack: reason?.stack,
      operation: 'unhandledrejection',
    });
  };
  // Capture phase: resource (img/script/link) failures don't bubble,
  // so the listener must capture to classify them separately.
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
