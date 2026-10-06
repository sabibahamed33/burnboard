'use client';

/**
 * Safe Supabase Realtime subscription helper.
 *
 * Why this exists:
 * - `supabase.channel(name)` returns a CACHED channel when the same topic
 *   name is requested twice. Calling `.on('postgres_changes', ...)` on an
 *   already-subscribed channel throws:
 *     "cannot add 'postgres_changes' callbacks ... after 'subscribe()'".
 *   That exception used to escape React effects and crash the whole page
 *   via the Next.js error boundary ("THIS ROAST WAS TOO BRUTAL").
 * - React 18 StrictMode double-mounts effects in dev, and several components
 *   re-created channels on unrelated state changes (e.g. dropdown open),
 *   which made the collision almost guaranteed after login.
 *
 * This helper:
 *  1. Gives every mount a UNIQUE channel name (base + random suffix) so two
 *     mounts can never share a cached subscribed channel.
 *  2. Wraps channel creation in try/catch — realtime is best-effort and must
 *     NEVER throw into React and crash the page.
 *  3. Returns a cleanup function that safely unsubscribes / removes the
 *     channel without throwing.
 *
 * Usage:
 *   useEffect(() => {
 *     if (!isSupabaseConfigured || !supabase || !userId) return;
 *     return subscribeRealtime(supabase, `notifications-${userId}`, (ch) =>
 *       ch
 *         .on('postgres_changes', { event: 'INSERT', ... }, handler)
 *         .on('postgres_changes', { event: 'UPDATE', ... }, handler)
 *     );
 *   }, [userId]);
 */

let channelSeq = 0;

export function subscribeRealtime(supabase, baseName, build, onStatus) {
  if (!supabase || typeof supabase.channel !== 'function') {
    return () => {};
  }

  let channel = null;

  try {
    channelSeq += 1;
    const suffix =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : `${Date.now().toString(36)}-${channelSeq}`;
    const uniqueName = `${baseName}:${suffix}`;

    const built = build(supabase.channel(uniqueName));
    channel = built && typeof built.subscribe === 'function' ? built : null;
    if (!channel) return () => {};

    const result = channel.subscribe(
      typeof onStatus === 'function' ? onStatus : undefined
    );
    // subscribe() may return a promise in some versions — swallow rejections.
    if (result && typeof result.catch === 'function') {
      result.catch((err) => {
        console.warn('[Realtime] subscribe failed (non-fatal):', err?.message || err);
      });
    }
  } catch (err) {
    // NEVER let realtime crash the page — log and continue with polling.
    console.warn('[Realtime] subscription failed (non-fatal):', err?.message || err);
    channel = null;
  }

  return () => {
    if (!channel) return;
    try {
      const res = supabase.removeChannel(channel);
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // Cleanup must never throw.
    }
  };
}
