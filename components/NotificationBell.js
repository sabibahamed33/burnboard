'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck, X, Flame, Trophy, Swords, Sparkles } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';

// ── Notification Type Config ─────────────────────────────────
const TYPE_CONFIG = {
  follow:           { emoji: '🤝', color: 'text-amber-400' },
  new_roast:        { emoji: '🔥', color: 'text-[#ff4d00]' },
  comment:          { emoji: '💬', color: 'text-sky-400' },
  reply:            { emoji: '↩️', color: 'text-sky-400' },
  mention:          { emoji: '📣', color: 'text-amber-400' },
  reaction_activity:{ emoji: '😂', color: 'text-yellow-400' },
  burn_score_milestone: { emoji: '🔥', color: 'text-[#ff4d00]' },
  battle_invite:    { emoji: '⚔️', color: 'text-blue-400' },
  battle_ready:     { emoji: '⚔️', color: 'text-blue-400' },
  battle_result:    { emoji: '🏆', color: 'text-amber-400' },
  leaderboard_entry:{ emoji: '🏆', color: 'text-amber-400' },
  weekly_recap:     { emoji: '📅', color: 'text-purple-400' },
  community_joined: { emoji: '👋', color: 'text-[#ff4d00]' },
  community_role_changed: { emoji: '🛡️', color: 'text-amber-400' },
  challenge_invite:  { emoji: '🎯', color: 'text-[#ff4d00]' },
  challenge_result:  { emoji: '🏆', color: 'text-amber-400' },
  milestone:         { emoji: '🏆', color: 'text-amber-400' },
  level_up:          { emoji: '⚡', color: 'text-[#ff4d00]' },
  achievement_unlocked: { emoji: '🏆', color: 'text-amber-400' },
  dm:                { emoji: '💬', color: 'text-sky-400' },
  billing:           { emoji: '💳', color: 'text-emerald-400' },
  safety_notice:     { emoji: '🛡️', color: 'text-amber-400' },
};

// ── Time Ago Helper ──────────────────────────────────────────
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
  return `${d}d ago`;
}

// ── Notification Item ────────────────────────────────────────
function NotificationItem({ notification, onRead, onClose }) {
  const config = TYPE_CONFIG[notification.type] || { emoji: '🔔', color: 'text-zinc-400' };
  const isUnread = !notification.is_read;

  const handleClick = async () => {
    if (isUnread) {
      await onRead(notification.id);
    }
    if (notification.link && onClose) {
      onClose();
    }
  };

  return (
    <Link href={notification.link || '#'}>
      <div
        onClick={handleClick}
        className={`flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer hover:bg-[#1a1a1a] ${
          isUnread ? 'bg-[#ff4d00]/5 border border-[#ff4d00]/20' : 'border border-transparent'
        }`}
      >
        {/* Icon */}
        <div className={`text-lg shrink-0 mt-0.5 ${config.color}`}>
          {config.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${isUnread ? 'text-white' : 'text-zinc-300'} leading-relaxed`}>
            {notification.title}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          <span className="text-[10px] text-zinc-600 font-mono mt-1 block">
            {timeAgo(notification.created_at)}
          </span>
        </div>

        {/* Unread Dot */}
        {isUnread && (
          <div className="shrink-0 mt-1">
            <div className="notif-dot w-2 h-2 rounded-full bg-[#ff4d00]" />
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Main Component ───────────────────────────────────────────
export default function NotificationBell({ userId: propUserId }) {
  const [userId, setUserId] = useState(propUserId || null);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const panelRef = useRef(null);
  // Track dropdown state in a ref so the realtime effect below does NOT
  // re-subscribe every time the panel opens/closes. Re-creating a channel
  // with the same name threw "cannot add 'postgres_changes' callbacks ...
  // after 'subscribe()'" and crashed the whole page via the error boundary.
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  // Deduplication: realtime INSERTs can re-deliver (reconnects, polling
  // overlap). One genuine event must never bump the badge twice.
  const seenIdsRef = useRef(new Set());
  const rememberIds = useCallback((list) => {
    const set = seenIdsRef.current;
    for (const n of list || []) {
      if (n?.id) set.add(n.id);
    }
    // Bound memory: keep only the most recent 500 ids.
    if (set.size > 500) {
      const excess = set.size - 500;
      const it = set.values();
      for (let i = 0; i < excess; i += 1) {
        const next = it.next();
        if (next.done) break;
        set.delete(next.value);
      }
    }
  }, []);

  // Account switching: never leak User A's notifications/badge to User B.
  useEffect(() => {
    seenIdsRef.current = new Set();
    setNotifications([]);
    setUnreadCount(0);
    setHasLoaded(false);
  }, [userId]);

  // Auto-detect userId from Supabase auth if not provided
  useEffect(() => {
    if (propUserId !== undefined) return; // Use prop if explicitly passed
    if (!isSupabaseConfigured || !supabase) return;

    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id || null);
      } catch {
        setUserId(null);
      }
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription?.unsubscribe();
  }, [propUserId]);

  // ── Fetch unread count ───────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setUnreadCount(0);
      return;
    }

    try {
      const res = await fetch(`/api/notifications?count=true`);
      const data = await res.json();
      if (data.success) {
        setUnreadCount(data.count || 0);
      }
    } catch {
      // Silent fail for count
    }
  }, [userId]);

  // ── Fetch notifications list ─────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?limit=20`);
      const data = await res.json();
      if (data.success) {
        const list = data.notifications || [];
        rememberIds(list);
        setNotifications(list);
        setUnreadCount(data.count || 0);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [userId, rememberIds]);

  // ── Initial load + polling ───────────────────────────────
  useEffect(() => {
    fetchUnreadCount();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // ── Realtime subscription for new notifications ──────────
  // NOTE: deps are intentionally ONLY [userId] (+stable fetchNotifications).
  // `isOpen` is read via isOpenRef so toggling the dropdown never recreates
  // the channel (recreating the same topic name after subscribe() throws and
  // used to crash Home/Feed right after login). Realtime is best-effort —
  // polling above is the fallback — so failures must never throw to React.
  useEffect(() => {
    if (!userId || !isSupabaseConfigured || !supabase) return;

    return subscribeRealtime(
      supabase,
      `notifications-${userId}`,
      (ch) =>
        ch
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            (payload) => {
              // Deduplicate: ignore re-delivered / already-seen events.
              const incomingId = payload?.new?.id || null;
              if (incomingId) {
                if (seenIdsRef.current.has(incomingId)) return;
                seenIdsRef.current.add(incomingId);
              }
              setUnreadCount(prev => prev + 1);
              if (isOpenRef.current) fetchNotifications();
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            () => {
              if (isOpenRef.current) fetchNotifications();
            }
          )
    );
  }, [userId, fetchNotifications]);

  // ── Click outside to close ───────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // ── Mark single as read ──────────────────────────────────
  const handleMarkRead = async (notificationId) => {
    // Only decrement the badge when we know the row was unread locally —
    // realtime/polling may have already updated the count (no double-count).
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

  // ── Toggle panel ─────────────────────────────────────────
  const handleToggle = () => {
    if (!isOpen && !hasLoaded) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  // Don't render if no user
  if (!userId) return null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-xl hover:bg-[#1a1a1a] transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-5 h-5 text-zinc-400 hover:text-white transition-colors" />
        {unreadCount > 0 && (
          <span key={unreadCount} className="badge-pop absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-[#ff4d00] text-black text-[10px] font-mono font-black rounded-full px-1 shadow-[0_0_8px_rgba(255,77,0,0.5)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="glass-strong anim-modal-in absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] rounded-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#222]">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#ff4d00]" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono text-[#ff4d00] bg-[#ff4d00]/10 px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="p-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors text-zinc-400 hover:text-white"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto max-h-[50vh] p-2 space-y-1">
            {loading && !hasLoaded ? (
              <div className="space-y-2 p-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl">
                    <div className="glass-skeleton w-6 h-6 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="glass-skeleton w-3/4 h-3" />
                      <div className="glass-skeleton w-1/2 h-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length > 0 ? (
              notifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={handleMarkRead}
                  onClose={() => setIsOpen(false)}
                />
              ))
            ) : (
              /* Empty State */
              <div className="text-center py-8 space-y-2">
                <div className="text-3xl">🔥</div>
                <p className="text-sm font-bold text-zinc-400">NOTHING&apos;S BURNING YET</p>
                <p className="text-[11px] text-zinc-500">
                  When new activity happens, it will appear here.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-[#222]">
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="block text-center text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors"
              >
                View All Notifications →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
