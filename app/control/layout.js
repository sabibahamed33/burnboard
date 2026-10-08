'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Loader2, LayoutGrid, Flag, Activity, Users, ScrollText, ToggleLeft, Siren } from 'lucide-react';

/**
 * /control layout — INTERNAL staff shell (not a public feature).
 * Server-side role checks live in every /api/control route; this shell only
 * decides what to RENDER. Non-staff see a denial screen, never content.
 */

const NAV = [
  { href: '/control', label: 'Hub', icon: LayoutGrid, exact: true },
  { href: '/control/overview', label: 'Overview', icon: Activity },
  { href: '/admin/moderation', label: 'Moderation', icon: Shield },
  { href: '/control/users', label: 'Users', icon: Users },
  { href: '/control/audit', label: 'Audit Logs', icon: ScrollText },
  { href: '/control/flags', label: 'Flags', icon: ToggleLeft },
  { href: '/control/incidents', label: 'Incidents', icon: Siren },
  { href: '/control/health', label: 'Health', icon: Activity },
  { href: '/admin/security', label: 'Security', icon: Flag },
];

export default function ControlLayout({ children }) {
  const pathname = usePathname();
  const [state, setState] = useState({ loading: true, roles: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/control/me', { cache: 'no-store' });
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setState({ loading: false, roles: data.roles || [], error: '' });
          } else {
            setState({ loading: false, roles: null, error: res.status === 401 ? 'Sign in with your staff account.' : 'Staff access required. This area is not public.' });
          }
        }
      } catch {
        if (!cancelled) setState({ loading: false, roles: null, error: 'Something went wrong. Please try again.' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-6xl items-center justify-center px-4">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading" />
      </div>
    );
  }

  if (!state.roles) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <Shield className="h-8 w-8 text-zinc-600" />
        <h1 className="text-lg font-black text-white">Restricted area</h1>
        <p className="text-sm text-zinc-400">{state.error}</p>
        <Link href="/" className="mt-2 flex min-h-[44px] items-center rounded-2xl bg-white px-5 text-sm font-bold text-black">
          Back to BurnBoard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black tracking-wider text-white">
          <Shield className="h-4 w-4 text-emerald-400" /> CONTROL CENTER
          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono font-normal text-[10px] text-zinc-400">internal</span>
        </span>
        <span className="ml-auto hidden font-mono text-[11px] text-zinc-500 sm:block" aria-label="Your staff roles">
          {state.roles.join(' · ')}
        </span>
      </header>
      <nav aria-label="Control Center" className="mb-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all ${
                active ? 'bg-white text-black' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
