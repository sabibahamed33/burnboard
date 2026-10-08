'use client';

import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';

export default function OfflinePage() {
  const [profileCount, setProfileCount] = useState(0);

  useEffect(() => {
    // Read real count from localStorage (last known from DataStore)
    try {
      const count = parseInt(localStorage.getItem('burnboard_profile_count') || '0', 10);
      setProfileCount(count);
    } catch {}
    // Recover automatically when the connection returns — no blind reload
    // loops: only navigate when actually back online.
    const goOnline = () => {
      try {
        if (navigator.onLine) window.location.href = '/';
      } catch {}
    };
    window.addEventListener('online', goOnline);
    return () => window.removeEventListener('online', goOnline);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4 font-mono text-center space-y-6">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-[#ff4d00]/10 border border-[#ff4d00]/30 flex items-center justify-center">
          <span className="text-4xl">😵</span>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
          You&apos;re Offline
        </h1>
        <p className="text-sm sm:text-base text-zinc-300 max-w-md leading-relaxed">
          Go touch grass, then come back to get roasted.
        </p>
        {profileCount > 0 && (
          <p className="text-xs text-zinc-500 mt-2">
            {profileCount} {profileCount === 1 ? 'person' : 'people'} waiting to roast you 🔥
          </p>
        )}
      </div>

      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-mono font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(255,77,0,0.4)] active:scale-95"
      >
        Retry 🔥
      </button>

      <a href="/" className="text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
        Back to home
      </a>

      <div className="text-[10px] text-zinc-600 font-mono mt-8">
        BURNBOARD © 2025 — No AI. Just Offline Humans.
      </div>
    </div>
  );
}
