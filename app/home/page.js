'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flame, TrendingUp, Clock, Loader2, Zap, RefreshCw, UserPlus, PenLine, Camera, Swords, Sparkles, Rocket, Search, X, MessageCircle, Plus, Smile } from 'lucide-react';
import { FeedCard } from '@/components/feed';
import InterestPicker from '@/components/feed/InterestPicker';
import ForYouRails from '@/components/feed/ForYouRails';
import HomeHero from '@/components/feed/HomeHero';
import HomeRightRail from '@/components/feed/HomeRightRail';
import Avatar from '@/components/ui/Avatar';
import UnreadBadge from '@/components/dm/UnreadBadge';
import FollowButton from '@/components/social/FollowButton';
import { CardSkeleton } from '@/components/ui/Skeleton';
import TodayOnBurnBoard from '@/components/feed/TodayOnBurnBoard';
import NotificationBell from '@/components/NotificationBell';
import ErrorBoundary from '@/components/ErrorBoundary';
import { track } from '@/lib/analytics';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';
import { mergeFeedItems, isKnownItem, accumulateSeenKeys } from '@/lib/feed/clientUtils';

/**
 * /home — BurnBoard Social Feed
 * 
 * The main discovery feed with tabs:
 *   - For You: Algorithmically ranked content
 *   - Trending: Engagement-weighted content
 * 
 * Features:
 *   - Infinite scroll with cursor-based pagination
 *   - Real reactions backed by server data
 *   - Loading skeletons
 *   - Empty states
 *   - Error handling with retry
 */

const FEED_TABS = [
  { key: 'for_you', label: 'For You', icon: Flame, hint: 'Personalized for you.' },
  { key: 'following', label: 'Following', icon: UserPlus, hint: 'Posts from people you follow.' },
  { key: 'trending', label: 'Trending', icon: TrendingUp, hint: 'Popular content right now.' },
  { key: 'rising', label: 'Rising Users', icon: Rocket, hint: 'New and growing users.' },
];

const TRENDING_WINDOWS = [
  { key: 'now', label: 'Now', icon: Zap },
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'week', label: 'Week', icon: TrendingUp },
];

function formatCount(n) {
  if (n == null) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function SocialHomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('for_you');
  const [searchInput, setSearchInput] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [trendingWindow, setTrendingWindow] = useState('today');
  const [signedIn, setSignedIn] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedMeta, setFeedMeta] = useState({ personalized: false, coldStart: false, followingEmpty: false });
  const [hasNew, setHasNew] = useState(false);
  // Rising Users tab: real suggestions from the recommendations API
  // (same source as Explore). Paged as one bounded list — no fabricated
  // pagination, no fake users; signed-out viewers get a sign-in prompt.
  const [risingUsers, setRisingUsers] = useState([]);
  const [risingLoading, setRisingLoading] = useState(false);
  const [risingError, setRisingError] = useState('');
  const [risingNeedsAuth, setRisingNeedsAuth] = useState(false);
  // Developer diagnostics (?debug=feed): exposes only product-level feed
  // metadata (counts, cursors, personalization flags). Internal ranking
  // scores are never sent by the API and never shown here.
  const [debugFeed] = useState(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === 'feed'
  );
  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);
  // Refs mirror state so the stable fetch callback never closes over stale
  // values (stale cursor/loading closures caused repeated requests).
  const cursorRef = useRef(null);
  const itemsRef = useRef([]);
  const hasMoreRef = useRef(true);
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const abortRef = useRef(null);
  const userIdRef = useRef(null);
  const tabRef = useRef('for_you');
  const windowRef = useRef('today');
  // Bounded server-namespaced keys of everything displayed this session.
  // Sent back as `exclude` on paginated requests so the re-ranked next page
  // can neither duplicate nor silently skip content (impression awareness).
  const seenRef = useRef([]);
  const debugRef = useRef(debugFeed);

  // Resolve auth state so signed-in users get the Following tab + feedback
  // controls (the API is the enforcement point; the UI only reveals intent).
  // On account switch the previous user's personalized feed is dropped
  // immediately so it can never leak into the new session.
  const resetFeedState = useCallback(() => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    seqRef.current += 1;
    busyRef.current = false;
    cursorRef.current = null;
    itemsRef.current = [];
    hasMoreRef.current = true;
    seenRef.current = [];
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setHasNew(false);
    setError(null);
  }, []);

  // Track feed view
  useEffect(() => {
    track('feed_viewed', { tab: activeTab });
  }, [activeTab]);

  // Fetch feed items. Stable identity: pagination appends only unseen
  // `${type}:${id}` items, refresh replaces. A sequence guard + abort
  // controller prevent request storms and stale responses overwriting newer
  // state. Technical failures are logged; the UI only shows a friendly retry.
  const fetchFeed = useCallback(async (isRefresh = false) => {
    if (busyRef.current && !isRefresh) return;
    if (!isRefresh && !hasMoreRef.current) return;

    // Refresh preempts any in-flight page request.
    if (isRefresh && abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    busyRef.current = true;
    const seq = ++seqRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const tab = tabRef.current;
    const win = windowRef.current;

    try {
      if (isRefresh) {
        setLoading(true);
        setError(null);
      } else if (cursorRef.current) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const params = new URLSearchParams({
        tab,
        limit: '20',
      });

      if (!isRefresh && cursorRef.current) {
        params.set('cursor', cursorRef.current);
      }

      // For You uses offset cursors over a re-ranked list: also send the
      // bounded seen-set so already-displayed ids are filtered server-side
      // before the page slice (no duplicates from ranking shifts).
      if (!isRefresh && tab === 'for_you' && seenRef.current.length > 0) {
        params.set('exclude', seenRef.current.join(','));
      }

      // Development diagnostics: ask the API for per-item score factors.
      // The server only honors this outside production; normal users never
      // receive or render internal ranking internals.
      if (debugRef.current) {
        params.set('debug', '1');
      }

      if (tab === 'trending') {
        params.set('window', win);
      }

      const res = await fetch(`/api/feed?${params}`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (seq !== seqRef.current) return; // superseded by a newer request

      if (!res.ok) throw new Error(data.error || `Feed request failed (${res.status})`);

      const incoming = Array.isArray(data.items) ? data.items : [];
      const next = mergeFeedItems(isRefresh ? [] : itemsRef.current, incoming, isRefresh);
      itemsRef.current = next;
      setItems(next);
      // Remember everything displayed this session (bounded server keys).
      seenRef.current = accumulateSeenKeys(isRefresh ? [] : seenRef.current, incoming);

      cursorRef.current = data.nextCursor || null;
      setCursor(data.nextCursor || null);
      hasMoreRef.current = !!data.nextCursor;
      setHasMore(!!data.nextCursor);
      setError(null);
      if (isRefresh) setHasNew(false);
      // Following is chronologically empty whenever there is nothing to show.
      const followingEmpty = tab === 'following' && next.length === 0 && incoming.length === 0;
      setFeedMeta({
        personalized: !!data.personalized,
        coldStart: !!data.coldStart,
        followingEmpty,
      });

      // Track impressions
      if (incoming.length) {
        track('feed_loaded', {
          tab,
          count: incoming.length,
          hasMore: !!data.nextCursor,
        });
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (seq !== seqRef.current) return;
      console.error('[Feed] Error:', err);
      setError('load_failed');
    } finally {
      if (seq === seqRef.current) busyRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Auth: initial resolve + account-switch reset (no cross-user feed leak).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      userIdRef.current = data?.user?.id || null;
      setSignedIn(!!data?.user);
      const uid = data?.user?.id;
      if (uid) {
        supabase
          .from('user_profiles')
          .select('username, display_name, avatar_url')
          .eq('id', uid)
          .maybeSingle()
          .then(({ data: prof }) => {
            if (!cancelled && prof) {
              setViewer({
                username: prof.username || null,
                displayName: prof.display_name || prof.username || null,
                avatarUrl: prof.avatar_url || null,
              });
            }
          })
          .catch(() => {});
      } else {
        setViewer(null);
      }
    }).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id || null;
      if (nextId !== userIdRef.current) {
        userIdRef.current = nextId;
        setSignedIn(!!nextId);
        setViewer(null);
        setMenuOpen(false);
        resetFeedState();
        fetchFeed(true);
      }
    });
    return () => {
      cancelled = true;
      try { sub?.subscription?.unsubscribe(); } catch {}
    };
  }, [fetchFeed, resetFeedState]);

  // Initial load
  useEffect(() => {
    fetchFeed(true);
  }, [fetchFeed]);

  // Realtime complements the ranked feed: new posts raise a non-intrusive
  // "new burns" pill instead of being injected at the top (no jumps, no
  // duplicates, no ranking disruption). Cleanup removes the channel.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    return subscribeRealtime(supabase, 'home-feed', (ch) =>
      ch
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_posts' }, (payload) => {
          const row = payload?.new;
          if (row?.id && !isKnownItem(itemsRef.current, row.id, row.content_type || 'social_post')) {
            setHasNew(true);
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roasts' }, (payload) => {
          const row = payload?.new;
          if (row?.id && !isKnownItem(itemsRef.current, row.id, 'roast')) {
            setHasNew(true);
          }
        })
    );
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchFeed(false);
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, loadingMore, fetchFeed]);

  // Rising Users: bounded real suggestions (signed-in only — the API is
  // the auth gate; a 401 renders a sign-in prompt, never fake users).
  const fetchRising = useCallback(async () => {
    setRisingLoading(true);
    setRisingError('');
    setRisingNeedsAuth(false);
    try {
      const res = await fetch('/api/recommendations/creators?limit=12');
      if (res.status === 401) {
        setRisingNeedsAuth(true);
        setRisingUsers([]);
        return;
      }
      if (!res.ok) throw new Error('rising failed');
      const data = await res.json();
      setRisingUsers(data.items || []);
    } catch (err) {
      console.error('[Home] Rising error:', err);
      setRisingError('load_failed');
    } finally {
      setRisingLoading(false);
    }
  }, []);

  const handleRisingFollowed = useCallback((username) => (isFollowing) => {
    if (isFollowing) {
      setRisingUsers(prev => prev.filter(u => u.username !== username));
      track('user_followed', { source: 'home_rising' });
    }
  }, []);

  // Handle tab change (Rising leaves the post-feed pipeline and loads
  // real user suggestions instead — feed state is still reset so nothing
  // from another tab can leak across).
  const handleTabChange = useCallback((tab) => {
    tabRef.current = tab;
    setActiveTab(tab);
    resetFeedState();
    track('feed_tab_changed', { tab });
    if (tab === 'rising') {
      setHasMore(false);
      fetchRising();
      return;
    }
    fetchFeed(true);
  }, [fetchFeed, resetFeedState, fetchRising]);

  // Handle trending window change
  const handleWindowChange = useCallback((win) => {
    windowRef.current = win;
    setTrendingWindow(win);
    resetFeedState();
    fetchFeed(true);
  }, [fetchFeed, resetFeedState]);

  // Handle reaction
  const handleReaction = useCallback((item, type) => {
    track('reaction_added', { itemId: item.id, type });
  }, []);

  // Handle upvote
  const handleUpvote = useCallback((item) => {
    track('upvote_added', { itemId: item.id });
  }, []);

  // Handle share
  const handleShare = useCallback((item) => {
    track('content_shared', { itemId: item.id, type: item.type });
  }, []);

  // Handle report
  const handleReport = useCallback((item) => {
    track('content_reported', { itemId: item.id });
  }, []);

  // ── Negative feedback (real, affects future ranking) ─────────
  const applyFeedback = useCallback(async (item, action) => {
    const contentType = item.type === 'roast' ? 'roast' : 'social_post';
    try {
      const res = await fetch('/api/feed/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: contentType,
          content_id: item.id,
          action,
        }),
      });
      if (!res.ok) throw new Error('feedback failed');
      // Hidden content should not keep occupying the feed this session.
      setItems(prev => prev.filter(x => !(x.id === item.id && x.type === item.type)));
      track(action === 'not_interested' ? 'not_interested' : 'content_hidden', { itemId: item.id, type: item.type });
    } catch (err) {
      console.error('[Feed] Feedback error:', err);
    }
  }, []);

  const handleNotInterested = useCallback((item) => applyFeedback(item, 'not_interested'), [applyFeedback]);
  const handleHide = useCallback((item) => applyFeedback(item, 'hide'), [applyFeedback]);

  // Owner post controls: remove deleted/unpublished rows instantly, merge
  // edited rows in place (server already re-verified ownership).
  const handleDeletedItem = useCallback((item) => {
    setItems(prev => prev.filter(x => !(x.id === item.id && x.type === item.type)));
  }, []);
  const handleUpdatedItem = useCallback((updated) => {
    setItems(prev => prev.map(x => (x.id === updated.id && x.type === updated.type ? updated : x)));
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="max-w-6xl mx-auto flex">
        {/* ═══ Main Feed Column ═══ */}
        <div className="flex-1 min-w-0 max-w-2xl mx-auto lg:mx-0 lg:max-w-none px-4 sm:px-6 pt-4 pb-6 space-y-5">
          {/* Top header: brand left, search center, actions right */}
          <header className="flex min-h-[44px] items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-1.5" aria-label="BurnBoard home">
              <Flame className="h-5 w-5 fill-[#ff4d00] text-[#ff4d00]" />
              <span className="text-[15px] font-black tracking-wide">
                <span className="text-white">BURN</span><span className="text-[#ff4d00]">BOARD</span>
              </span>
            </Link>
            {/* Desktop search → real global search */}
            <form
              role="search"
              className="relative hidden min-w-0 flex-1 md:block"
              onSubmit={(e) => {
                e.preventDefault();
                const q = searchInput.trim();
                router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
              }}
            >
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search BurnBoard..."
                aria-label="Search BurnBoard"
                className="min-h-[44px] w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-10 text-sm text-white placeholder-zinc-500 backdrop-blur-xl transition-all focus:border-[#ff4d00]/50 focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex min-h-[32px] min-w-[32px] -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </form>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <NotificationBell />
              <Link
                href="/messages"
                aria-label="Open messages"
                className="relative flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="absolute -right-0.5 -top-0.5"><UnreadBadge /></span>
              </Link>
              <Link
                href="/create"
                aria-label="Create a post"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-[#ff4d00] text-black transition-all hover:bg-[#ff6622] active:scale-95"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              {viewer?.username ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(v => !v)}
                    aria-label="Account menu"
                    aria-expanded={menuOpen}
                    className="flex min-h-[40px] items-center gap-2 rounded-xl py-1 pl-1 pr-1.5 transition-colors hover:bg-white/5"
                  >
                    <Avatar username={viewer.username} size="sm" src={viewer.avatarUrl} />
                    {viewer.displayName && (
                      <span className="hidden max-w-[110px] truncate text-xs font-bold text-white xl:block">
                        {viewer.displayName}
                      </span>
                    )}
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#161618]/95 shadow-2xl backdrop-blur-xl">
                      <Link
                        href={`/u/${viewer.username}`}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-white/5"
                      >
                        Profile
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="block border-t border-white/5 px-4 py-3 text-xs font-bold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        Settings
                      </Link>
                    </div>
                  )}
                </div>
              ) : null}
              <button
                onClick={() => { resetFeedState(); fetchFeed(true); }}
                disabled={loading}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Refresh feed"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </header>
          {/* Mobile search → same real global search */}
          <form
            role="search"
            className="relative min-w-0 flex-1 md:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchInput.trim();
              router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
            }}
          >
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search BurnBoard..."
              aria-label="Search BurnBoard"
              className="min-h-[44px] w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-10 pr-10 text-sm text-white placeholder-zinc-500 backdrop-blur-xl transition-all focus:border-[#ff4d00]/50 focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex min-h-[32px] min-w-[32px] -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          {/* Context */}
          <div className="space-y-1">
            <h1 className="text-[22px] font-black leading-none tracking-tight text-white">
              Home
            </h1>
            <p className="text-xs text-zinc-500">
              {(FEED_TABS.find(t => t.key === activeTab)?.hint) || 'Picked for you from across BurnBoard.'}
            </p>
          </div>

          {/* Welcome hero — dismissible, real copy only */}
          <HomeHero signedIn={signedIn} displayName={viewer?.displayName} />

          <div className="space-y-4">
            {/* Feed Tabs — Following is only for signed-in users and stays
                distinctly chronological (never silently algorithmic). */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-white/10 bg-white/[0.03] p-1" role="tablist" aria-label="Feed">
              {FEED_TABS.filter(tab => tab.key !== 'following' || signedIn).map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleTabChange(tab.key)}
                    className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-bold transition-all active:scale-95 ${
                      active
                        ? 'bg-[#ff4d00] text-black shadow-[0_0_16px_rgba(255,77,0,0.35)]'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Quick composer — entry points only; creation lives in /create */}
            <Link
              href="/create"
              className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 backdrop-blur-xl transition-all hover:border-[#ff4d00]/40 active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff4d00]/15 text-[#ff4d00]">
                <PenLine className="h-4 w-4" />
              </span>
              <span className="flex-1 truncate text-sm text-zinc-500">
                What&apos;s on your mind?
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span title="Photo" aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"><Camera className="h-4 w-4" /></span>
                <span title="Emoji" aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"><Smile className="h-4 w-4" /></span>
                <span title="Create" aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ff4d00] text-black"><PenLine className="h-4 w-4" /></span>
              </span>
            </Link>

            {/* Trending Window Tabs (only when on trending tab) */}
            {activeTab === 'trending' && (
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1" role="tablist" aria-label="Trending window">
                {TRENDING_WINDOWS.map(w => {
                  const Icon = w.icon;
                  const active = trendingWindow === w.key;
                  return (
                      <button
                        key={w.key}
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleWindowChange(w.key)}
                      className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-bold transition-all active:scale-95 ${
                        active
                          ? 'border border-white/15 bg-white/10 text-white'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {w.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ═══ Rising Users (real suggestions, bounded list) ═══ */}
          {activeTab === 'rising' && (
            <div className="space-y-4">
              {risingLoading && (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-[#222]" />
                      <div className="flex-1 space-y-1.5">
                        <div className="w-24 h-3 bg-[#222] rounded" />
                        <div className="w-36 h-2 bg-[#1a1a1a] rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {risingError && !risingLoading && (
                <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                  <p className="text-sm font-bold text-zinc-200">Couldn&apos;t load rising users.</p>
                  <p className="text-xs text-zinc-500">Check your connection and try again.</p>
                  <button
                    onClick={fetchRising}
                    className="inline-flex min-h-[44px] items-center px-5 bg-[#ff4d00] text-black text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-[#ff6622] transition-all active:scale-95"
                  >
                    Try again
                  </button>
                </div>
              )}
              {!risingLoading && !risingError && risingNeedsAuth && (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center space-y-3">
                  <p className="text-sm font-bold text-white">Sign in to discover rising voices.</p>
                  <p className="text-xs text-zinc-500">Suggestions are personalized — or browse Explore freely.</p>
                  <div className="flex items-center justify-center gap-2">
                    <Link
                      href="/auth?next=%2Fhome"
                      className="inline-flex min-h-[44px] items-center px-5 bg-[#ff4d00] text-black text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-[#ff6622] transition-all active:scale-95"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/explore"
                      className="inline-flex min-h-[44px] items-center px-5 border border-white/15 text-zinc-200 text-xs font-bold rounded-2xl hover:border-white/30 hover:text-white transition-all"
                    >
                      Explore
                    </Link>
                  </div>
                </div>
              )}
              {!risingLoading && !risingError && !risingNeedsAuth && risingUsers.length === 0 && (
                <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center space-y-3">
                  <p className="text-sm font-bold text-zinc-200">Quiet for now.</p>
                  <p className="text-xs text-zinc-500">No rising users to show — more people appear as the community grows.</p>
                  <Link
                    href="/discover"
                    className="inline-flex min-h-[44px] items-center px-5 bg-[#ff4d00] text-black text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-[#ff6622] transition-all active:scale-95"
                  >
                    Discover people
                  </Link>
                </div>
              )}
              {!risingLoading && !risingError && !risingNeedsAuth && risingUsers.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="divide-y divide-white/5">
                    {risingUsers.map(person => (
                      <div key={person.id} className="flex items-center gap-3 px-4 py-3">
                        <Link href={`/u/${person.username}`} className="shrink-0" aria-label={`Open @${person.username}`}>
                          <Avatar username={person.username} size="md" src={person.avatarUrl} />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/u/${person.username}`}
                            className="block truncate text-sm font-bold text-white hover:text-[#ff4d00] transition-colors"
                          >
                            @{person.username}
                          </Link>
                          <p className="truncate font-mono text-[11px] text-zinc-500">
                            {person.reason?.text || 'New and growing'}
                            {person.followerCount > 0 && (
                              <span className="text-zinc-600"> · {formatCount(person.followerCount)} followers</span>
                            )}
                          </p>
                        </div>
                        <FollowButton
                          targetUserId={person.id}
                          initialIsFollowing={false}
                          initialFollowerCount={person.followerCount || 0}
                          label={person.mutual ? 'Follow back' : 'Follow'}
                          size="sm"
                          onFollowChange={handleRisingFollowed(person.username)}
                          className="shrink-0"
                        />
                      </div>
                    ))}
                  </div>
                  <Link
                    href="/discover"
                    className="block border-t border-white/10 px-4 py-3 text-center font-mono text-[11px] text-[#ff4d00] transition-colors hover:text-white"
                  >
                    Discover more people →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ═══ Feed Content ═══ */}

          {/* Loading State */}
          {loading && activeTab !== 'rising' && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error State — friendly copy only; technical details stay in logs */}
          {error && !loading && activeTab !== 'rising' && (
            <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
              <p className="text-sm font-bold text-zinc-200">Your feed couldn&apos;t load.</p>
              <p className="text-xs text-zinc-500">Check your connection and try again.</p>
              <button
                onClick={() => { resetFeedState(); fetchFeed(true); }}
                className="inline-flex min-h-[44px] items-center px-5 bg-[#ff4d00] text-black text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-[#ff6622] transition-all active:scale-95"
              >
                Try again
              </button>
            </div>
          )}

          {/* Realtime: new content is one tap away — never auto-injected */}
          {hasNew && !loading && !error && items.length > 0 && activeTab !== 'rising' && (
            <div className="flex justify-center">
              <button
                onClick={() => { resetFeedState(); fetchFeed(true); }}
                className="px-4 py-2 bg-[#ff4d00] text-black text-xs font-mono font-bold rounded-full hover:bg-[#ff6622] transition-colors shadow-[0_0_20px_rgba(255,77,0,0.35)]"
              >
                ↑ New burns available — refresh
              </button>
            </div>
          )}

          {/* Developer diagnostics (?debug=feed) — product metadata only */}
          {debugFeed && !loading && (
            <div className="bg-[#0d0d0d] border border-dashed border-[#333] rounded-xl px-3 py-2">
              <p className="text-[10px] font-mono text-zinc-500">
                feed.debug tab={activeTab} items={items.length} hasMore={String(hasMore)} cursor={cursor || 'none'} personalized={String(feedMeta.personalized)} coldStart={String(feedMeta.coldStart)}
              </p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && items.length === 0 && activeTab !== 'rising' && (
            activeTab === 'following' && signedIn && feedMeta.followingEmpty ? (
              <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
                <div className="text-5xl">👋</div>
                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                  YOUR FOLLOWING FEED IS QUIET
                </h2>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Following shows posts from people you follow — in order, no algorithms.
                  Follow some people and their fresh burns will land here.
                </p>
                <Link
                  href="/discover"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_25px_rgba(255,77,0,0.3)] uppercase tracking-wider"
                >
                  <UserPlus className="w-4 h-4" />
                  DISCOVER PEOPLE
                </Link>
              </div>
            ) : (
              <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
                <div className="text-5xl">🔥</div>
                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                  THE ARENA IS QUIET
                </h2>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  {activeTab === 'for_you'
                    ? 'No personalized picks yet — explore what\u2019s live right now, or be the first to start something.'
                    : 'Be the first to start something. Put yourself or someone else on the Hot Seat.'}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {activeTab === 'for_you' && (
                    <>
                      <Link
                        href="/explore"
                        className="inline-flex items-center gap-2 px-5 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_25px_rgba(255,77,0,0.3)] uppercase tracking-wider"
                      >
                        EXPLORE TRENDING
                      </Link>
                      <Link
                        href="/c"
                        className="inline-flex items-center gap-2 px-5 py-3 border border-[#333] text-zinc-200 font-bold text-sm rounded-xl hover:border-[#ff4d00]/50 transition-all uppercase tracking-wider"
                      >
                        COMMUNITIES
                      </Link>
                    </>
                  )}
                  <Link
                    href="/hot-seat"
                    className={`inline-flex items-center gap-2 px-6 py-3 ${activeTab === 'for_you' ? 'border border-[#333] text-zinc-200 font-bold' : 'bg-[#ff4d00] text-black font-black shadow-[0_0_25px_rgba(255,77,0,0.3)]'} text-sm rounded-xl hover:bg-[#ff6622] transition-all uppercase tracking-wider`}
                  >
                    🔥 START THE FIRE
                  </Link>
                </div>
              </div>
            )
          )}

          {/* Feed Items */}
          {!loading && items.length > 0 && activeTab !== 'rising' && (
            <div className="space-y-4">
              {/* Today on BurnBoard (only on For You tab, at top) */}
              {activeTab === 'for_you' && <TodayOnBurnBoard />}

              {/* Discovery rails: challenges & communities for this viewer */}
              {activeTab === 'for_you' && signedIn && feedMeta.personalized && (
                <ForYouRails />
              )}

              {/* Cold-start interest picker — real explicit preferences */}
              {activeTab === 'for_you' && signedIn && feedMeta.personalized && feedMeta.coldStart && (
                <InterestPicker onApplied={() => { resetFeedState(); fetchFeed(true); }} />
              )}

              {items.map(item => (
                <ErrorBoundary
                  key={`${item.type}-${item.id}`}
                  title="This post couldn't load"
                  message="The rest of your feed still works."
                >
                <FeedCard
                  item={item}
                  onReaction={handleReaction}
                  onUpvote={handleUpvote}
                  onShare={handleShare}
                  onReport={handleReport}
                  onNotInterested={signedIn ? handleNotInterested : null}
                  onHide={signedIn ? handleHide : null}
                  onDeleted={handleDeletedItem}
                  onUpdated={handleUpdatedItem}
                />
                {debugFeed && item.debug && (
                  <p className="text-[10px] font-mono text-zinc-600 px-1 -mt-2">
                    dev src={item.debug.source || '?'} score={item.debug.score} age={item.debug.ageHours}h eng={item.debug.engagement}
                    {' '}rel={item.debug.factors?.following}+{item.debug.factors?.creator} pop={item.debug.factors?.popularity} fresh={item.debug.factors?.freshness} qual={item.debug.factors?.creatorQuality} vel={item.debug.factors?.velocity} boost={item.debug.factors?.launchBoost}
                  </p>
                )}
                </ErrorBoundary>
              ))}
            </div>
          )}

          {/* Load More Trigger */}
          {hasMore && !loading && (
            <div ref={loadMoreRef} className="py-8 flex justify-center">
              {loadingMore && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-[#ff4d00]" />
                  <span className="text-xs font-mono">Loading more...</span>
                </div>
              )}
            </div>
          )}

          {/* End of Feed */}
          {!hasMore && !loading && items.length > 0 && (
            <div className="text-center py-8 border-t border-[#222]">
              <p className="text-xs text-zinc-500 font-mono">
                🔥 You&apos;ve seen it all. Come back later for more burns.
              </p>
            </div>
          )}
        </div>

        {/* ═══ Desktop Right Sidebar ═══ */}
        <aside className="hidden xl:block w-80 shrink-0 pl-8 pr-4 py-6 space-y-6">
          <HomeRightRail signedIn={signedIn} />
        </aside>
      </div>
    </div>
  );
}
