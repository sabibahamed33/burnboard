'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * LevelUpWatcher — global, lightweight level-up celebration.
 *
 * After navigation, it compares the signed-in user's current level against
 * the last level seen on this device. On an upgrade it shows a premium,
 * non-blocking celebration: confetti (unless reduced motion is preferred)
 * plus a dismissible banner. No realtime subscription, no polling loop —
 * one cheap read per navigation, skipped for signed-out visitors.
 *
 * Anti-dark-pattern rules: celebrates progress only. No urgency, no shame,
 * no blocking, auto-dismisses, respects reduced motion.
 */

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function storageKey(userId) {
  return `burnboard_level:${userId}`;
}

export default function LevelUpWatcher() {
  const pathname = usePathname();
  const [celebration, setCelebration] = useState(null); // { oldLevel, newLevel }
  const checkedRef = useRef(false);

  const check = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const res = await fetch(`/api/reputation?type=user&user_id=${user.id}`);
      if (!res.ok) return;
      const data = await res.json();
      const currentLevel = data?.profile?.level || null;
      if (!currentLevel) return;

      const key = storageKey(user.id);
      let previous = null;
      try {
        previous = localStorage.getItem(key);
      } catch {}
      if (previous && previous !== currentLevel) {
        // Level names order by the central curve; only celebrate upgrades.
        // A downgrade (recalc) just re-syncs silently.
        const order = ['Spark', 'Ember', 'Flame', 'Blaze', 'Inferno', 'Supernova', 'Legend'];
        if (order.indexOf(currentLevel) > order.indexOf(previous)) {
          setCelebration({ oldLevel: previous, newLevel: currentLevel });
          if (!prefersReducedMotion()) {
            try {
              const confetti = (await import('canvas-confetti')).default;
              confetti({
                particleCount: 90,
                spread: 70,
                origin: { y: 0.25 },
                colors: ['#ff4d00', '#ffb199', '#ffffff', '#f97316'],
                disableForReducedMotion: true,
              });
            } catch {}
          }
        }
      }
      try {
        localStorage.setItem(key, currentLevel);
      } catch {}
    } catch {}
  }, []);

  useEffect(() => {
    // Skip the very first mount (baseline sync only, never celebrate).
    if (!checkedRef.current) {
      checkedRef.current = true;
      if (!isSupabaseConfigured || !supabase) return;
      supabase.auth.getUser().then(({ data }) => {
        const user = data?.user;
        if (!user) return;
        fetch(`/api/reputation?type=user&user_id=${user.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const level = d?.profile?.level;
            if (level) {
              try {
                if (!localStorage.getItem(storageKey(user.id))) {
                  localStorage.setItem(storageKey(user.id), level);
                }
              } catch {}
            }
          })
          .catch(() => {});
      });
      return;
    }
    check();
  }, [pathname, check]);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => setCelebration(null), 6000);
    return () => clearTimeout(t);
  }, [celebration]);

  if (!celebration) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="bg-[#111]/95 backdrop-blur-md border border-[#ff4d00]/50 rounded-2xl px-4 py-3 shadow-[0_0_30px_rgba(255,77,0,0.35)] flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">⚡</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white uppercase tracking-wider">
            Level up — {celebration.newLevel}
          </p>
          <p className="text-[11px] font-mono text-zinc-400">
            {celebration.oldLevel} → {celebration.newLevel} · progress saved on your profile
          </p>
        </div>
        <button
          onClick={() => setCelebration(null)}
          aria-label="Dismiss level-up celebration"
          className="p-2 rounded-lg text-zinc-500 hover:text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
