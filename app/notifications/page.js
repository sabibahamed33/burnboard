'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Bell, ArrowLeft, CheckCheck, Flame, Loader2, RefreshCw } from 'lucide-react';
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
  creator_milestone:{ emoji: '🏆', label: 'Milestone', color: 'text-amber-400' },
  community_joined: { emoji: '👋', label: 'Community', color: 'text-[#ff4d00]' },
  community_role_changed: { emoji: '🛡️', label: 'Community Role', color: 'text-amber-400' },
  challenge_invite: { emoji: '🎯', label: 'Challenge Invite', color: 'text-[#ff4d00]' },
  challenge_result: { emoji: '🏆', label: 'Challenge Result', color: 'text-amber-400' },
  billing:          { emoji: '💳', label: 'Billing', color: 'text-emerald-400' },
};

// ── Filter Tabs (only categories the product actually emits) ─
const FILTERS = [
  { key: 'all', label: 'All', types: null },
  { key: 'followers', label: 'Followers', types: ['follow'] },
  { key: 'reactions', label: 'Reactions', types: ['reaction_activity', 'burn_score_milestone'] },
  { key: 'comments', label: 'Comments', types: ['comment', 'reply'] },
  { key: 'mentions', label: 'Mentions', types: ['mention'] },
  { key: 'battles', label: 'Battles', types: ['battle_invite', 'battle_ready', 'battle_result'] },
  { key: 'communities', label: 'Communities', types: ['community_joined', 'community_role_changed', 'community_join_request', 'community_join_approved'] },
  { key: 'challenges', label: 'Challenges', types: ['challenge_invite', 'challenge_result'] },
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

  const handleClick = async () => {
    if (isUnread) {
      await onRead(notification.id);
    }
  };

  return (
    <Link href={notification.link || '#'}>
      <div
        onClick={handleClick}
        className={`flex items-start gap-4 p-4 rounded-2xl transition-all cursor-pointer group ${
          isUnread 
            ? 'bg-[#ff4d00]/5 border border-[#ff4d00]/20 hover:border-[#ff4d00]/40' 
            : 'bg-[#111] border border-[#222] hover:border-[#333]'
        }`}
      >
        {/* Icon */}
        <div className={`text-2xl shrink-0 mt-0.5 ${config.color}`}>
          {config.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${config.color}`}>
              {config.label}
            </span>
            {isUnread && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d00] animate-pulse" />
            )}
          </div>
          <p className={`text-sm leading-relaxed ${isUnread ? 'text-white font-bold' : 'text-zinc-300'}`}>
            {notification.title}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {notification.message}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-zinc-600 font-mono">
              {timeAgo(notification.created_at)}
            </span>
            {notification.link && (
              <span className="text-[10px] font-mono text-[#ff4d00] group-hover:text-white transition-colors">
                View →
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
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

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/notifications?limit=50');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Request failed');
      }
      if (data.success) {
        const list = data.notifications || [];
        const set = seenIdsRef.current;
        for (const n of list) {
          if (n?.id) set.add(n.id);
        }
        setNotifications(list);
        setUnreadCount(data.count || 0);
      } else {
        throw new Error('Request failed');
      }
    } catch {
      // Never crash the page — show a friendly retry state.
      setError("Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

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
              fetchNotifications();
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

  const activeFilter = FILTERS.find(f => f.key === filter) || FILTERS[0];
  const visible = activeFilter.types
    ? notifications.filter(n => activeFilter.types.includes(n.type))
    : notifications;

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
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between py-4 border-b border-[#222]">
          <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>BURN BOARD</span>
          </Link>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold text-zinc-400 hover:text-white hover:bg-[#1a1a1a] transition-all min-h-[44px]"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark All Read
            </button>
          )}
        </header>

        {/* Title */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
            <Bell className="w-6 h-6 fill-[#ff4d00]" />
            <h1 className="text-xl font-black uppercase tracking-wider font-mono">{t('notif_title')}</h1>
          </div>
          <p className="text-xs text-zinc-400 font-mono">
            {unreadCount > 0 
              ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up!'
            }
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Notification filters">
          {FILTERS.map(f => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[11px] font-mono font-bold transition-all min-h-[40px] ${
                  active
                    ? 'bg-[#ff4d00] text-black shadow-[0_0_12px_rgba(255,77,0,0.3)]'
                    : 'bg-[#111] border border-[#222] text-zinc-400 hover:text-white hover:border-[#333]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Notification List */}
        {visible.length > 0 ? (
          <div className="space-y-2">
            {visible.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onRead={handleMarkRead}
              />
            ))}
          </div>
        ) : notifications.length > 0 ? (
          /* Filtered empty state */
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-3">
            <div className="text-4xl">🔕</div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              Nothing here yet
            </h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              No {activeFilter.label.toLowerCase()} notifications right now.
            </p>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
            <div className="text-5xl">🔥</div>
            <h2 className="text-lg font-black text-white uppercase tracking-wider">
              {t('notif_empty')}
            </h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              {t('notif_empty_desc')}
            </p>
            <Link
              href="/hot-seat"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_20px_rgba(255,77,0,0.3)] min-h-[44px]"
            >
              <Flame className="w-4 h-4" />
              CREATE YOUR FIRST HOT SEAT
            </Link>
          </div>
        )}

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
