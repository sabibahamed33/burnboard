'use client';

import React from 'react';
import { Flame, RefreshCw } from 'lucide-react';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center p-4 font-mono text-center">
      <div className="glass-strong w-full max-w-md space-y-5 rounded-3xl p-8 animate-scale-in">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400" aria-hidden>
          <Flame className="w-8 h-8 fill-red-500/30" />
        </div>
        <h2 className="type-h1 uppercase">
          This roast was too brutal, try again
        </h2>
        <p className="type-secondary">
          {error?.message || 'A flame error occurred. Your data is safe — please reload and continue.'}
        </p>
        <button
          onClick={() => reset ? reset() : window.location.reload()}
          className="btn-burn inline-flex items-center gap-2 px-5 py-2.5 text-xs rounded-xl pressable"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Extinguish &amp; Reload</span>
        </button>
      </div>
    </div>
  );
}
