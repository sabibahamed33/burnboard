/**
 * BURNBOARD — Centralized Sharing (Master Prompt 14)
 *
 * One place for share UX + REAL share attribution. Every successful share
 * action records a server-validated `shares` row (channel, resource, actor).
 * Anonymous visitors can share too (actor_id NULL) — but can never
 * impersonate a signed-in user (RLS). No fake shares, no dependence on a
 * single social platform.
 */

export const SHARE_RESOURCE_TYPES = [
  'social_post', 'photo', 'roast', 'profile', 'community', 'challenge', 'battle', 'topic', 'hashtag',
];

const VALID_CHANNELS = ['native', 'copy', 'clipboard', 'x', 'facebook', 'whatsapp', 'telegram', 'sms', 'email', 'link', 'other'];

/**
 * Record a real share event (fire-and-forget). Never throws.
 */
export async function trackShare({ resourceType, resourceId, channel = 'other', idempotencyKey } = {}) {
  if (!resourceType || !resourceId) return;
  if (!SHARE_RESOURCE_TYPES.includes(resourceType)) return;
  if (!VALID_CHANNELS.includes(channel)) channel = 'other';
  try {
    await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_type: resourceType, resource_id: resourceId, channel, idempotency_key: idempotencyKey || null }),
    });
  } catch {
    // Sharing attribution is non-critical — never break the share UX.
  }
}

/**
 * Share a resource via the native share sheet (mobile/desktop) or the
 * clipboard. Tracks the real channel used. Returns the channel used.
 */
export async function shareResource({ resourceType, resourceId, url, title, text, idempotencyKey } = {}) {
  const sharableUrl = url || (typeof window !== 'undefined' ? window.location.href : 'https://burnboard.app');
  const shareTitle = title || 'BurnBoard 🔥';
  const shareText = text || 'Check this out on BurnBoard';
  let channel = 'other';

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const payload = { title: shareTitle, text: shareText, url: sharableUrl };
      if (navigator.canShare(payload)) {
        await navigator.share(payload);
        channel = 'native';
      }
    } catch (err) {
      // AbortError = user dismissed the share sheet — not a share, no tracking.
      if (err?.name === 'AbortError') return null;
    }
  }

  if (channel === 'other') {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${sharableUrl}`);
      channel = 'clipboard';
    } catch {
      // Last-resort: expose the link via a prompt (rare).
      channel = 'link';
      // eslint-disable-next-line no-alert
      window.prompt?.('Copy this BurnBoard link', sharableUrl);
    }
  }

  await trackShare({ resourceType, resourceId, channel, idempotencyKey });
  return channel;
}