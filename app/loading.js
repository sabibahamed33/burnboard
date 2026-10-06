'use client';

import React from 'react';
import { Flame, Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center p-4 font-mono space-y-4 bb-container">
      <div className="glass-strong relative flex h-20 w-20 items-center justify-center rounded-3xl" role="status" aria-label="Loading">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff4d00]/20 text-[#ff4d00] animate-pulse">
          <Flame className="w-7 h-7 fill-[#ff4d00]" />
        </div>
        <Loader2 className="absolute -top-1 -right-1 h-5 w-5 animate-spin text-[#ff4d00]" />
      </div>
      <h2 className="type-h3 tracking-wide text-zinc-200 animate-pulse">
        Sharpening the knives...
      </h2>
      <div className="w-full max-w-xs space-y-2" aria-hidden>
        <div className="glass-skeleton h-3 w-full" />
        <div className="glass-skeleton h-3 w-3/4" />
      </div>
      <p className="type-micro">
        Preparing 100% human-crafted burns
      </p>
    </div>
  );
}
