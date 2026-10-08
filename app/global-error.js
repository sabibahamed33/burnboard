'use client';

import React from 'react';

/**
 * Global error boundary (last resort). A failure anywhere must never leave
 * a blank screen: reset the boundary or reload, core nav stays reachable.
 */
export default function GlobalError({ error, reset }) {
  React.useEffect(() => {
    try {
      console.error('[GlobalError]', error?.message || error);
    } catch {}
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0a] text-[#f0f0f0] min-h-screen font-sans">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-4xl" aria-hidden="true">🔥</p>
          <h1 className="text-lg font-black text-white">Something went wrong.</h1>
          <p className="text-sm text-zinc-400">Please try again — your account is safe.</p>
          <div className="flex gap-2">
            <button
              onClick={() => reset?.()}
              className="min-h-[44px] rounded-2xl bg-white px-5 text-sm font-bold text-black"
            >
              Try again
            </button>
            <a
              href="/"
              className="flex min-h-[44px] items-center rounded-2xl border border-white/15 px-5 text-sm font-bold text-zinc-200"
            >
              Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
