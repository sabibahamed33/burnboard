'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  User, Shield, Bell, Languages, SlidersHorizontal, Wallet,
  Link2, Lock, Search, ChevronRight, Loader2,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * /settings — Settings home hub (real destinations only).
 *
 * Every row links to a working settings surface. Sections without
 * underlying functionality are not listed — no decorative entries.
 */
const SECTIONS = [
  {
    href: '/settings/profile',
    icon: User,
    title: 'Profile',
    desc: 'Name, username, bio, photo, website, location.',
    keywords: 'account profile edit username bio avatar name',
  },
  {
    href: '/settings/safety',
    icon: Shield,
    title: 'Safety & Privacy',
    desc: 'Blocked and muted users, who can interact with you, reports, appeals.',
    keywords: 'privacy block mute report appeal safety interactions roast comment mention tag message',
  },
  {
    href: '/settings/notifications',
    icon: Bell,
    title: 'Notifications',
    desc: 'Choose what activity you want to hear about.',
    keywords: 'notifications alerts push email notify',
  },
  {
    href: '/settings/language',
    icon: Languages,
    title: 'Language',
    desc: 'Display language for the BurnBoard interface.',
    keywords: 'language locale region বাংলা español arabic',
  },
  {
    href: '/settings/personalization',
    icon: SlidersHorizontal,
    title: 'Feed & Content',
    desc: 'Personalization, interests, and content preferences.',
    keywords: 'feed content interests topics personalization discovery',
  },
  {
    href: '/settings/security',
    icon: Lock,
    title: 'Security',
    desc: 'Password, sign-in method, this session, sign out.',
    keywords: 'security password session sign out logout account recovery',
  },
  {
    href: '/settings/billing',
    icon: Wallet,
    title: 'Billing',
    desc: 'Subscriptions and payment status.',
    keywords: 'billing subscription premium payment',
  },
  {
    href: '/settings/apps',
    icon: Link2,
    title: 'Connected Apps',
    desc: 'Third-party apps with access to your account.',
    keywords: 'apps connected third party revoke permissions oauth',
  },
];

export default function SettingsHubPage() {
  const [query, setQuery] = useState('');
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isSupabaseConfigured || !supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        const res = await fetch(`/api/profile?user_id=${encodeURIComponent(user.id)}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data.profile) setMe(data.profile);
      } catch {} finally {
        if (!cancelled) setLoadingMe(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) =>
      `${s.title} ${s.desc} ${s.keywords}`.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-28 pt-6 sm:pb-16">
      <header className="space-y-1 px-0.5">
        <h1 className="text-[22px] font-black tracking-tight text-white">Settings</h1>
        <p className="text-[13px] text-zinc-400">Control your BurnBoard experience.</p>
      </header>

      {/* Profile shortcut (real data) */}
      <section aria-label="Your profile" className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
        {loadingMe ? (
          <div className="flex animate-pulse items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-white/10" />
              <div className="h-3 w-1/4 rounded bg-white/5" />
            </div>
          </div>
        ) : me ? (
          <div className="flex items-center gap-3">
            <Avatar username={me.username} size="md" src={me.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                {me.displayName || `@${me.username}`}
              </p>
              <p className="truncate font-mono text-[11px] text-zinc-500">@{me.username}</p>
            </div>
            <Link
              href={me.username ? `/u/${me.username}` : '/settings/profile'}
              className="flex min-h-[44px] shrink-0 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 transition-all hover:border-white/25 hover:text-white"
            >
              View Profile
            </Link>
            <Link
              href="/settings/profile"
              className="flex min-h-[44px] shrink-0 items-center rounded-xl bg-white px-3 text-xs font-bold text-black transition-all hover:bg-zinc-200"
            >
              Edit
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">Sign in to manage your settings.</p>
            <Link
              href="/auth"
              className="flex min-h-[44px] shrink-0 items-center rounded-xl bg-white px-4 text-xs font-bold text-black"
            >
              Sign in
            </Link>
          </div>
        )}
      </section>

      {/* Search settings (client-side filter — no backend needed) */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings (e.g. “who can message me?”)"
          aria-label="Search settings"
          className="min-h-[48px] w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 backdrop-blur-xl focus:border-[#ff4d00]/60 focus:outline-none"
        />
      </div>

      {/* Sections */}
      <nav aria-label="Settings sections" className="space-y-2">
        {filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
            No settings match “{query.trim()}”.
          </p>
        )}
        {filtered.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-all hover:border-white/25 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Icon className="h-[18px] w-[18px] text-zinc-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">{s.title}</span>
                <span className="block truncate text-xs text-zinc-500">{s.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />
            </Link>
          );
        })}
      </nav>

      <p className="px-1 font-mono text-[11px] leading-relaxed text-zinc-600">
        Safety notices and critical account messages always stay on — muting the world never mutes your own account safety.
      </p>
    </div>
  );
}
