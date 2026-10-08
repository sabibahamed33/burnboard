'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCheck, Flame, RefreshCw } from 'lucide-react';
import { t } from '@/lib/lang';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';

// ── Notification Type Config ─────────────────────────────────
const TYPE_CONFIG = {
  follow:           { emoji: '🤝', label: 'New Follower', color: 'text-amber-400' },
  new_roast:        { emoji: '🔥', label: 'New Roast', color: 'text-[#ff4d00]' },
  comment:          { emoji: '💬', label: 'Comment', color: 'text-sky-400' },
  reply:            { emoji: '↩️', label: 'Reply', color: 'text-sky-400' },
  mention:          { emoji: '📣', label: 'Mention', color: 'text-amber-400' },
  reaction_activity:{ emoji: '😂', label: 'Reactions', color: 'text-yellow-400' },
  burn_score_milestone: { emoji: '🔥', label: 'Burn Score', color: 'text-[#ff4d00]' },
  battle_invite:    { emoji: '⚔️', label: 'Battle Invite', color: 'text-blue-400' },
  battle_ready:     { emoji: '⚔️', label: 'Battle Ready', color: 'text-blue-400' },
  battle_result:    { emoji: '🏆', label: 'Battle Result', color: 'text-amber-400' },
  leaderboard_entry:{ emoji: '🏆', label: 'Leaderboard', color: 'text-amber-400' },
  weekly_recap:     { emoji: '📅', label: 'Weekly Recap', color: 'text-purple-400' },
  milestone:        { emoji: '🏆', label: 'Milestone', color: 'text-amber-400' },
  // Legacy stored type value (old rows only) — renders as plain Milestone.
  creator_milestone:{ emoji: '🏆', label: 'Milestone', color: 'text-amber-400' },
  community_joined: { emoji: '👋', label: 'Community', color: 'text-[#ff4d00]' },
  community_role_changed: { emoji: '🛡️', label: 'Community Role', color: 'text-amber-400' },
  challenge_invite: { emoji: '🎯', label: 'Challenge Invite', color: 'text-[#ff4d00]' },
  challenge_result: { emoji: '🏆', label: 'Challenge Result', color: 'text-amber-400' },
  level_up:        { emoji: '⚡', label: 'Level Up', color: 'text-[#ff4d00]' },
  achievement_unlocked: { emoji: '🏆', label: 'Achievement', color: 'text-amber-400' },
  dm:              { emoji: '💬', label: 'Message', color: 'text-sky-400' },
  billing:          { emoji: '💳', label: 'Billing', color: 'text-emerald-400' },
  safety_notice:    { emoji: '🛡️', label: 'Safety Notice', color: 'text-amber-400' },
};

// ── Activity Center tabs (server-backed categories; only emitted ones) ─
const FILTERS = [
  { key: 'all', label: 'All', category: null },
  { key: 'mentions', label: 'Mentions', category: 'mentions' },
  { key: 'social', label: 'Social', category: 'social' },
  { key: 'communities', label: 'Communities', category: 'communities' },
  { key: 'battles', label: 'Battles', category: 'battles' },
  { key: 'challenges', label: 'Challenges', category: 'challenges' },
  { key: 'achievements', label: 'Achievements', category: 'achievements' },
  { key: 'messages', label: 'Messages', category: 'messages' },
  { key: 'system', label: 'System', category: 'system' },
];

// ── Time Ago ─────────────────────────────────────────────────
function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'just now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Notification Item ────────────────────────────────────────
function NotificationItem({ notification, onRead }) {
  const config = TYPE_CONFIG[notification.type] || { emoji: '🔔', label: 'Notification', color: 'text-zinc-400' };
  const isUnread = !notification.is_read;
  const isImportant = (notification.priority || 0) >= 2;
  const [gone, setGone] = useState(false);
  const [checking, setChecking] = useState(false);

  const trackOpened = () => {
    try {
      fetch('/api/growth/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'notification_opened', subjectId: notification.id, metadata: { type: notification.type } }),
      }).catch(() => {});
    } catch {}
  };

  // Deleted-target guard: post/roast links are verified against the same
  // RLS-scoped reads as the destination pages. Gone/private content renders
  // a tombstone instead of a broken link. Other destinations (profiles,
  // communities, threads) navigate directly — those pages fail gracefully.
  const handleClick = async (e) => {
    if (isUnread) {
      await onRead(notification.id);
    }
    trackOpened();
    const link = notification.link || '';
    const m = link.match(/^\/(post|r)\/([A-Za-z0-9_-]{1,120})$/);
    if (!m || gone) {
      if (!m) return;
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setChecking(true);
    try {
      const type = m[1] === 'r' ? 'roast' : 'social_post';
      const res = await fetch(`/api/content/exists?type=${type}&id=${encodeURIComponent(m[2])}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.exists === false) {
        setGone(true);
        return;
      }
      window.location.href = link;
    } catch {
      window.location.href = link;
    } finally {
      setChecking(false);
    }
  };

  const inner = (
    <div
      onClick={handleClick}
      role={notification.link ? 'link' : undefined}
      aria-label={isUnread ? `Unread ${config.label}: ${notification.title}` : `${config.label}: ${notification.title}`}
      className={`flex items-center gap-3 rounded-2xl border p-3 transition-all cursor-pointer group active:scale-[0.99] ${
        isUnread
          ? 'border-[#ff4d00]/25 bg-[#ff4d00]/[0.06] hover:border-[#ff4d00]/45'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25'
      }`}
    >
      {/* Icon tile */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg backdrop-blur-xl ${
        isUnread ? 'border-[#ff4d00]/30 bg-[#ff4d00]/10' : 'border-white/10 bg-white/[0.04]'
      }`} aria-hidden="true">
        {config.emoji}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate font-mono text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
            {config.label}
          </span>
          {isImportant && (
            <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px font-mono text-[9px] font-bold uppercase text-amber-300">
              Important
            </span>
          )}
          {isUnread && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff4d00]" aria-hidden="true" />
          )}
        </div>
        <p className={`mt-0.5 line-clamp-2 text-[13px] leading-snug ${isUnread ? 'font-bold text-white' : 'text-zinc-300'}`}>
          {notification.title}
        </p>
        {notification.message && notification.message !== notification.title && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">
            {notification.message}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-600">
            {timeAgo(notification.created_at)}
          </span>
          {gone ? (
            <span className="font-mono text-[10px] text-zinc-500">
              This content is no longer available.
            </span>
          ) : notification.link ? (
            <span className="font-mono text-[10px] text-[#ff4d00] transition-colors group-hover:text-white">
              {checking ? 'Checking…' : 'View →'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  // Links render as anchors for keyboard/screen-reader navigation; the
  // click handler above may intercept for the deleted-target check.
  if (notification.link && !gone) {
    return <a href={notification.link}>{inner}</a>;
  }
  return inner;
}

// ── Main Page ────────────────────────────────────────────────
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [userId, setUserId] = useState(null);
  // Realtime dedup: one genuine event must never render twice.
  const seenIdsRef = useRef(new Set());
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const fetchPage = useCallback(async ({ reset = false, cursorValue = null } = {}) => {
    const active = FILTERS.find((f) => f.key === filterRef.current) || FILTERS[0];
    const params = new URLSearchParams({ limit: '20', sort: 'smart' });
    if (active.category) params.set('category', active.category);
    if (cursorValue) params.set('cursor', JSON.stringify(cursorValue));
    const res = await fetch(`/api/notifications?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || !data.success) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    setCursor(null);
    try {
      const data = await fetchPage({ reset: true });
      const list = data.notifications || [];
      const set = seenIdsRef.current;
      set.clear();
      for (const n of list) {
        if (n?.id) set.add(n.id);
      }
      setNotifications(list);
      setUnreadCount(data.count || 0);
      setCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor && list.length >= 20);
      setPendingNew(0);
    } catch {
      // Never crash the page — show a friendly retry state.
      setError("Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage({ cursorValue: cursor });
      const list = data.notifications || [];
      const set = seenIdsRef.current;
      const fresh = list.filter((n) => {
        if (!n?.id || set.has(n.id)) return false;
        set.add(n.id);
        return true;
      });
      setNotifications((prev) => [...prev, ...fresh]);
      setCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor && list.length >= 20);
    } catch {
      // Keep existing items; user can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, fetchPage, loadingMore]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, filter]);

  // Resolve the signed-in user for the realtime subscription.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data?.user?.id || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const nextId = session?.user?.id || null;
      // Account switching: drop the previous account's state immediately.
      if (nextId !== userId) {
        seenIdsRef.current = new Set();
        setNotifications([]);
        setUnreadCount(0);
        fetchNotifications();
      }
      setUserId(nextId);
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: arrivals never violently reorder the list. At the top they
  // load naturally; scrolled down, a "New activity" pill preserves scroll
  // position until tapped. Updates (read states) refresh silently.
  const [pendingNew, setPendingNew] = useState(0);

  const showNewActivity = useCallback(() => {
    setPendingNew(0);
    fetchNotifications();
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [fetchNotifications]);

  // Realtime: new/updated notifications arrive live, deduplicated by id.
  useEffect(() => {
    if (!userId || !isSupabaseConfigured || !supabase) return;
    return subscribeRealtime(
      supabase,
      `notifications-page-${userId}`,
      (ch) =>
        ch
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            (payload) => {
              const incoming = payload?.new || null;
              if (incoming?.id) {
                if (seenIdsRef.current.has(incoming.id)) return;
                seenIdsRef.current.add(incoming.id);
              }
              try {
                if (typeof window !== 'undefined' && window.scrollY < 240) {
                  fetchNotifications();
                } else {
                  setPendingNew((n) => n + 1);
                  setUnreadCount((c) => c + 1);
                }
              } catch {
                fetchNotifications();
              }
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            () => fetchNotifications()
          )
    );
  }, [userId, fetchNotifications]);

  // ── Mark single as read ──────────────────────────────────
  const handleMarkRead = async (notificationId) => {
    const wasUnread = notifications.some(n => n.id === notificationId && !n.is_read);
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: notificationId }),
      });
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      // Silent fail
    }
  };

  // ── Mark all as read ─────────────────────────────────────
  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Silent fail
    }
  };

  // ── Clear read history (unread items are always kept) ───────
  const handleClearRead = async () => {
    const kept = notifications.filter(n => !n.is_read);
    setNotifications(kept);
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_read: true }),
      });
    } catch {
      // Optimistic; server converges on next load.
    }
  };

  const activeFilter = FILTERS.find(f => f.key === filter) || FILTERS[0];
  // Filtering is server-side (category param); the list renders as returned.
  const visible = notifications;

  // Visibility-aware fallback: realtime can drop on flaky networks — a
  // bounded 60s refetch while the tab is visible keeps counts accurate
  // without new subscriptions or duplicate inserts.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        fetchNotifications();
      }
    }, 60000);
    return () => window.clearInterval(id);
  }, [fetchNotifications]);

  // ── Loading State ────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-2xl mx-auto space-y-6">
          <header className="flex items-center justify-between py-4 border-b border-[#222]">
            <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>BURN BOARD</span>
            </Link>
          </header>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-4 animate-pulse flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#222]" />
                <div className="flex-1 space-y-2">
                  <div className="w-1/4 h-3 bg-[#222] rounded" />
                  <div className="w-3/4 h-4 bg-[#222] rounded" />
                  <div className="w-1/2 h-3 bg-[#1a1a1a] rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────
  if (error && notifications.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-2xl mx-auto space-y-6">
          <header className="flex items-center justify-between py-4 border-b border-[#222]">
            <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>BURN BOARD</span>
            </Link>
          </header>
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
            <div className="text-5xl">📡</div>
            <h2 className="text-lg font-black text-white uppercase tracking-wider">
              Couldn&apos;t load notifications.
            </h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Check your connection and try again — your notifications are safe.
            </p>
            <button
              onClick={fetchNotifications}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_20px_rgba(255,77,0,0.3)] min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" />
              TRY AGAIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Brand header */}
        <header className="flex min-h-[44px] items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5" aria-label="BurnBoard home">
            <Flame className="h-5 w-5 fill-[#ff4d00] text-[#ff4d00]" />
            <span className="text-[15px] font-black tracking-wide text-white">BURNBOARD</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/settings/notifications"
              aria-label="Notification settings"
              className="flex min-h-[40px] items-center rounded-xl px-3 font-mono text-[11px] font-bold text-zinc-400 transition-all hover:bg-white/5 hover:text-white"
            >
              Settings
            </Link>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 font-mono text-[11px] font-bold text-zinc-400 transition-all hover:bg-white/5 hover:text-white"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark All Read
              </button>
            )}
          </div>
        </header>

        {/* Hero */}
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-[28px] font-black leading-none tracking-tight text-white">
            <span aria-hidden="true">🔔</span> Activity
          </h1>
          <p className="text-[13px] text-zinc-400">
            {unreadCount > 0
              ? `${unreadCount > 99 ? '99+' : unreadCount} unread — stay connected to what matters.`
              : 'Stay connected to what matters.'}
          </p>
        </div>

        <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="min-w-0 space-y-5">
        {/* Filter chips */}
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" role="tablist" aria-label="Notification filters">
          {FILTERS.map(f => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-4 text-xs font-bold transition-all active:scale-95 ${
                  active
                    ? 'border-[#ff4d00] bg-[#ff4d00] text-black shadow-[0_0_16px_rgba(255,77,0,0.35)]'
                    : 'border-white/10 bg-white/[0.05] text-zinc-300 backdrop-blur-xl hover:border-white/25 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </nav>

        {/* New activity pill (realtime without reorder violence) */}
        {pendingNew > 0 && (
          <div className="flex justify-center">
            <button
              onClick={showNewActivity}
              className="min-h-[40px] rounded-full border border-[#ff4d00]/50 bg-[#ff4d00]/15 px-4 text-xs font-bold text-[#ff4d00] backdrop-blur-xl transition-all hover:bg-[#ff4d00]/25 active:scale-95"
            >
              {pendingNew} new {pendingNew === 1 ? 'notification' : 'notifications'} — tap to view
            </button>
          </div>
        )}

        {/* Notification List */}
        {visible.length > 0 ? (
          <div className="space-y-2" role="list" aria-label="Notifications">
            {visible.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onRead={handleMarkRead}
              />
            ))}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="min-h-[44px] w-full rounded-2xl border border-white/10 bg-white/[0.03] font-mono text-xs font-bold text-zinc-300 transition-all hover:border-white/25 hover:text-white disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
            <button
              onClick={handleClearRead}
              className="min-h-[44px] w-full rounded-2xl font-mono text-[11px] text-zinc-600 transition-colors hover:text-red-400"
            >
              Clear read notifications
            </button>
          </div>
        ) : notifications.length > 0 ? (
          /* Filtered empty state */
          <div className="space-y-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <div className="text-4xl" aria-hidden="true">🔕</div>
            <h2 className="text-sm font-extrabold tracking-tight text-white">
              Nothing here yet
            </h2>
            <p className="mx-auto max-w-sm text-xs text-zinc-500">
              No {activeFilter.label.toLowerCase()} notifications right now.
            </p>
          </div>
        ) : (
          /* Empty State */
          <div className="space-y-4 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <div className="text-5xl" aria-hidden="true">🔥</div>
            <h2 className="text-lg font-black uppercase tracking-wide text-white">
              {t('notif_empty')}
            </h2>
            <p className="mx-auto max-w-sm text-xs text-zinc-500">
              {t('notif_empty_desc')}
            </p>
            <Link
              href="/hot-seat"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
            >
              <Flame className="w-4 h-4" />
              CREATE YOUR FIRST HOT SEAT
            </Link>
          </div>
        )}
        </div>

        {/* Side panel (desktop): summary + preferences */}
        <aside className="hidden min-w-0 space-y-4 lg:block" aria-label="Activity summary">
          <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-[13px] font-extrabold tracking-tight text-white">Summary</h2>
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-zinc-500">Unread</span>
              <span className="font-bold text-[#ff4d00]">{unreadCount > 99 ? '99+' : unreadCount}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-zinc-500">Shown</span>
              <span className="font-bold text-zinc-200">{visible.length}</span>
            </div>
            <Link
              href="/settings/notifications"
              className="flex min-h-[44px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xs font-bold text-zinc-200 transition-all hover:border-[#ff4d00]/40 hover:text-white"
            >
              Notification settings
            </Link>
            <p className="text-[11px] leading-relaxed text-zinc-600">
              Safety and account notices always stay on — muting the world never mutes your own account safety.
            </p>
          </section>
        </aside>
        </div>

        {/* Footer */}
        <div className="pb-8 pt-2 text-center">
          <Link
            href="/discover"
            className="font-mono text-[11px] text-zinc-500 transition-colors hover:text-[#ff4d00]"
          >
            🔥 Discover trending content
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <Link
            href="/discover"
            className="text-[11px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors"
          >
            🔥 Discover trending content
          </Link>
        </div>
      </div>
    </div>
  );
}
