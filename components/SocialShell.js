'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Flame, Home, Compass, Plus, Swords, Bell, User, Search,
  TrendingUp, Trophy, Calendar, Menu, X, ChevronRight, Users, Sparkles, BarChart3, Gem, BrainCircuit, MessageCircle
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import UnreadBadge from './dm/UnreadBadge';
import LevelUpWatcher from './reputation/LevelUpWatcher';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * SocialShell — Global navigation wrapper for BurnBoard.
 * 
 * Desktop: Fixed left sidebar with logo + nav items + user section
 * Mobile: Fixed bottom tab bar with 5 primary actions
 * 
 * This wraps all pages in a consistent navigation frame.
 * Existing pages continue to work — this is additive.
 */

const NAV_ITEMS = [
  { key: 'home', label: 'Feed', shortLabel: 'Feed', icon: Home, href: '/home' },
  { key: 'explore', label: 'Explore', shortLabel: 'Explore', icon: Compass, href: '/explore' },
  { key: 'create', label: 'Create', shortLabel: 'Create', icon: Plus, href: '/create', accent: true },
  { key: 'battles', label: 'Battles', shortLabel: 'Battles', icon: Swords, href: '/battle' },
  { key: 'leaderboard', label: 'Rankings', shortLabel: 'Rank', icon: Trophy, href: '/leaderboards' },
];

const SECONDARY_ITEMS = [
  { key: 'messages', label: 'Messages', icon: MessageCircle, href: '/messages', badge: true },
  { key: 'communities', label: 'Communities', icon: Users, href: '/c' },
  { key: 'challenges', label: 'Challenges', icon: Sparkles, href: '/challenges' },
  { key: 'weekly', label: 'Weekly Recap', icon: Calendar, href: '/weekly' },
  { key: 'top', label: 'Top Roasts', icon: TrendingUp, href: '/top' },
  { key: 'notifications', label: 'Notifications', icon: Bell, href: '/notifications' },
  { key: 'ai', label: 'Your AI', icon: BrainCircuit, href: '/ai' },
  { key: 'premium', label: 'Premium', icon: Gem, href: '/premium' },
];

export default function SocialShell({ children }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);

  // Track auth state
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const getUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isActive = (href) => {
    if (href === '/home') return pathname === '/home' || pathname === '/';
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  // My Insights is available to every signed-in user — no special account type.
  const secondaryItems = user
    ? [...SECONDARY_ITEMS, { key: 'insights', label: 'My Insights', icon: BarChart3, href: '/insights' }]
    : SECONDARY_ITEMS;

  return (
    <div className="social-shell">
      {/* ═══ Desktop Sidebar — floating glass control layer ═══ */}
      <aside className="hidden lg:flex fixed left-4 top-4 bottom-4 w-[260px] glass-nav rounded-3xl flex-col z-40 overflow-hidden" aria-label="Primary">
        {/* Logo */}
        <div className="p-5 border-b border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-[#ff6a1f] to-[#ff4d00] flex items-center justify-center shadow-[0_0_18px_rgba(255,77,0,0.45)] group-hover:shadow-[0_0_26px_rgba(255,77,0,0.6)] transition-shadow">
              <Flame className="w-5 h-5 text-black fill-black" />
            </div>
            <div>
              <span className="text-sm font-black text-white uppercase tracking-wider">BURN</span>
              <span className="text-sm font-black text-[#ff4d00] uppercase tracking-wider">BOARD</span>
            </div>
          </Link>
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-bold transition-all min-h-[44px] ${
                  item.accent
                    ? 'btn-burn mt-3'
                    : active
                      ? 'glass glass-active text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className={`w-5 h-5 ${item.accent ? 'text-black' : active ? 'text-[#ff4d00]' : ''}`} />
                <span className="font-mono">{item.label}</span>
                {active && !item.accent ? <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#ff4d00] shadow-[0_0_8px_rgba(255,77,0,0.9)]" aria-hidden /> : null}
              </Link>
            );
          })}

          {/* Divider */}
          <div className="h-px bg-white/[0.06] my-3" />

          {/* Secondary Nav */}
          {secondaryItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-2xl text-xs font-mono transition-all min-h-[44px] ${
                  active
                    ? 'glass glass-active text-white'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#ff4d00]' : ''}`} />
                <span>{item.label}</span>
                {item.badge && user && <UnreadBadge />}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-white/[0.06]">
          {user ? (
            <Link
              href={`/u/${user.email?.split('@')[0] || 'user'}`}
              className="glass-soft flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:border-[#ff4d00]/40 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#ff4d00] to-amber-400 flex items-center justify-center text-xs font-black text-black">
                {user.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.email?.split('@')[0] || 'User'}</p>
                <p className="text-[10px] text-zinc-500 font-mono truncate">{user.email}</p>
              </div>
              <NotificationBell />
            </Link>
          ) : (
            <Link
              href="/auth"
              className="btn-glass flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-xs font-mono font-bold text-zinc-200 hover:text-white transition-all"
            >
              <User className="w-4 h-4" />
              Sign In
            </Link>
          )}
        </div>
      </aside>

      {/* ═══ Mobile Bottom Nav — floating glass pill ═══ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe" aria-label="Primary mobile">
        <div className="glass-nav mx-auto mb-3 flex max-w-md items-center justify-around rounded-3xl px-2 py-1.5" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 0px))' }}>
          {NAV_ITEMS.slice(0, 5).map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className={`tactile flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl min-w-[56px] min-h-[52px] justify-center ${
                  item.accent
                    ? '-mt-6'
                    : active ? 'bg-[#ff4d00]/12' : ''
                }`}
              >
                {item.accent ? (
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-b from-[#ff6a1f] to-[#ff4d00] flex items-center justify-center shadow-[0_0_22px_rgba(255,77,0,0.55)] -mb-1 pressable">
                    <Icon className="w-6 h-6 text-black" strokeWidth={2.5} />
                  </div>
                ) : (
                  <span className={`flex h-8 w-12 items-center justify-center rounded-xl ${active ? 'glass glass-active' : ''}`}>
                    <Icon className={`w-5 h-5 ${active ? 'text-[#ff4d00]' : 'text-zinc-500'}`} />
                  </span>
                )}
                <span className={`text-[9px] font-mono font-bold ${item.accent ? 'text-[#ff4d00]' : active ? 'text-[#ff4d00]' : 'text-zinc-500'}`}>
                  {item.shortLabel}
                </span>
                {active && !item.accent ? <span className="h-1 w-1 rounded-full bg-[#ff4d00]" aria-hidden /> : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ═══ Main Content Area ═══ */}
      <main className="social-shell-content">
        {children}
      </main>
      <LevelUpWatcher />
    </div>
  );
}
