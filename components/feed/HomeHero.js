'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Flame, ArrowRight, Users, X } from 'lucide-react';

const DISMISS_KEY = 'burnboard_home_hero_dismissed';

function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * HomeHero — welcome banner for /home (dismissible, real copy only).
 *
 * Signed-in viewers get a greeting with the two primary next actions;
 * signed-out visitors get the brand promise. No stats, no imagery, no
 * fabricated social proof — typography and glow only.
 */
export default function HomeHero({ signedIn }) {
  const [hidden, setHidden] = useState(dismissed);

  if (hidden) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setHidden(true);
  };

  return (
    <section
      aria-label={signedIn ? 'Welcome back' : 'Welcome to BurnBoard'}
      className="relative overflow-hidden rounded-3xl border border-[#ff4d00]/25 bg-gradient-to-br from-[#2a1200] via-[#140a06] to-[#0a0a0a] p-5 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,77,0,0.25),transparent_60%)]"
      />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome banner"
        className="absolute right-3 top-3 flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="relative space-y-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold text-[#ff4d00]">
          <Flame className="h-4 w-4 fill-[#ff4d00]/20" aria-hidden="true" />
          {signedIn ? 'Welcome back' : 'Welcome to BurnBoard'}
        </p>
        <h2 className="max-w-md text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
          Real people. <span className="text-[#ff4d00]">Real roasts.</span>
          <br />
          No AI. Just humans.
        </h2>
        <p className="max-w-md text-xs leading-relaxed text-zinc-400">
          Discover, roast, and connect with the realest people on the internet.
          Your next favorite roast is waiting.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {signedIn ? (
            <>
              <Link
                href="/explore"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
              >
                Explore Feed <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/discover"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-5 text-xs font-bold text-zinc-200 transition-all hover:border-white/30 hover:text-white"
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Find Friends
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
              >
                Join BurnBoard <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-5 text-xs font-bold text-zinc-200 transition-all hover:border-white/30 hover:text-white"
              >
                Explore first
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
