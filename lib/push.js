/**
 * BURNBOARD — Push delivery abstraction (honest capabilities).
 *
 * Current reality:
 *  - Foreground Web Notifications work when the tab is open and the USER
 *    grants permission (Notification.requestPermission + new Notification()).
 *  - There is NO VAPID/Web-Push server, NO background push subscription,
 *    and NO token registration endpoint. Background/closed-tab delivery
 *    is therefore NOT available — this module reports that truthfully.
 *  - Native (non-web) push exists only through the scheduled
 *    process-notifications pipeline for registered device tokens.
 *
 * This module centralizes capability detection + permission handling so a
 * future provider plugs in here without touching call sites. It never
 * fabricates delivery.
 */

export function pushCapabilities() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return { foreground: false, background: false, reason: 'unsupported' };
  }
  return {
    // Foreground toasts while the tab is open (permission-gated).
    foreground: true,
    // No VAPID server / subscription endpoint exists yet.
    background: false,
    reason: 'no-push-server',
    permission: Notification.permission,
  };
}

/** Ask for foreground notification permission (USER gesture required). */
export async function requestForegroundPermission() {
  try {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Notification.permission;
    }
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

/**
 * Best-effort foreground toast. Returns false when not permitted —
 * callers fall back to in-app badges, never to fake delivery claims.
 */
export function showForegroundToast(title, { body, tag } = {}) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    const n = new Notification(title || 'BurnBoard', {
      body: body || '',
      tag: tag || 'burnboard',
      icon: '/icon-192.png',
      badge: '/icon.svg',
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {}
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
