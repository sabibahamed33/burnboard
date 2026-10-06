import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Ghost } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center p-4 font-mono text-center">
      <div className="glass-strong w-full max-w-md space-y-5 rounded-3xl p-8 animate-scale-in">
        <div className="glass-soft mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-zinc-400" aria-hidden>
          <Ghost className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <div className="type-micro font-bold uppercase tracking-widest text-[#ff4d00]">404 Error</div>
          <h1 className="type-h1 uppercase">
            This profile escaped the roast
          </h1>
        </div>
        <p className="type-secondary">
          The target profile or roast you are looking for has been deleted, purged, or was never submitted.
        </p>
        <Link
          href="/"
          className="btn-burn inline-flex items-center gap-2 px-5 py-2.5 text-xs rounded-xl pressable"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Active Feed</span>
        </Link>
      </div>
    </div>
  );
}
