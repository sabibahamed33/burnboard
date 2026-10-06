'use client';

import { useState, useEffect } from 'react';

/** True when the OS requests reduced motion. Safe for SSR. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Reactive reduced-motion hook for components that gate decorative animation. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(prefersReducedMotion());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/** Best-effort haptic tick (native only, never throws on web). */
export async function hapticTick() {
  try {
    // Runtime-only access: no static import, so web bundles never resolve it.
    const plugins = typeof window !== 'undefined' ? window.Capacitor?.Plugins : undefined;
    const haptics = plugins?.Haptics;
    if (haptics?.vibrate) await haptics.vibrate();
  } catch {
    /* web or unavailable — silent */
  }
}

/** Trailing-edge debounce for search-style inputs. */
export function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Debounced-value hook (e.g. search query → network). */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
