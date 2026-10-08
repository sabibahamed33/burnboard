'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Flame, TrendingUp, Clock, Loader2, Zap, Trophy, RefreshCw, UserPlus } from 'lucide-react';
import { FeedCard } from '@/components/feed';
import InterestPicker from '@/components/feed/InterestPicker';
import ForYouRails from '@/components/feed/ForYouRails';
import PeopleYouMayLike from '@/components/feed/PeopleYouMayLike';
import { CardSkeleton } from '@/components/ui/Skeleton';
import TodayOnBurnBoard from '@/components/feed/TodayOnBurnBoard';
import TrendingSidebar from '@/components/feed/TrendingSidebar';
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
  { key: 'following', label: 'Following', icon: UserPlus },
  { key: 'for_you', label: 'For You', icon: Flame },
  { key: 'trending', label: 'Trending', icon: TrendingUp },
];

const TRENDING_WINDOWS = [
  { key: 'now', label: 'Now', icon: Zap },
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'week', label: 'Week', icon: TrendingUp },
];

export default function SocialHomePage() {
  const [activeTab, setActiveTab] = useState('for_you');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [trendingWindow, setTrendingWindow] = useState('today');
  const [signedIn, setSignedIn] = useState(false);
  const [feedMeta, setFeedMeta] = useState({ personalized: false, coldStart: false, followingEmpty: false });
  const [hasNew, setHasNew] = useState(false);
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
    }).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id || null;
      if (nextId !== userIdRef.current) {
        userIdRef.current = nextId;
        setSignedIn(!!nextId);
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

  // Handle tab change
  const handleTabChange = useCallback((tab) => {
    tabRef.current = tab;
    setActiveTab(tab);
    resetFeedState();
    track('feed_tab_changed', { tab });
    fetchFeed(true);
  }, [fetchFeed, resetFeedState]);

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
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto flex">
        {/* ═══ Main Feed Column ═══ */}
        <div className="flex-1 min-w-0 max-w-2xl mx-auto lg:mx-0 lg:max-w-none px-4 sm:px-6 py-6 space-y-5">
          {/* Header */}
          <header className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-6 h-6 text-[#ff4d00] fill-[#ff4d00]" />
                <h1 className="text-lg font-black text-white uppercase tracking-wider font-mono">
                  FEED
                </h1>
              </div>
              <button
                onClick={() => { resetFeedState(); fetchFeed(true); }}
                disabled={loading}
                className="p-2 rounded-xl hover:bg-[#1a1a1a] transition-colors text-zinc-400 hover:text-white"
                aria-label="Refresh feed"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Feed Tabs — Following is only for signed-in users and stays
                distinctly chronological (never silently algorithmic). */}
            <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222]">
              {FEED_TABS.filter(tab => tab.key !== 'following' || signedIn).map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      activeTab === tab.key
                        ? 'bg-[#ff4d00] text-black'
                        : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Trending Window Tabs (only when on trending tab) */}
            {activeTab === 'trending' && (
              <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222]">
                {TRENDING_WINDOWS.map(w => {
                  const Icon = w.icon;
                  return (
                      <button
                        key={w.key}
                        onClick={() => handleWindowChange(w.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono font-bold transition-all ${
                        trendingWindow === w.key
                          ? 'bg-[#1a1a1a] text-white border border-[#333]'
                          : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {w.label}
                    </button>
                  );
                })}
              </div>
            )}
          </header>

          {/* ═══ Feed Content ═══ */}
          
          {/* Loading State */}
          {loading && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error State — friendly copy only; technical details stay in logs */}
          {error && !loading && (
            <div className="bg-[#111] border border-[#333] rounded-2xl p-6 text-center space-y-3">
              <p className="text-sm text-zinc-200 font-bold">Couldn&apos;t load your feed.</p>
              <button
                onClick={() => { resetFeedState(); fetchFeed(true); }}
                className="px-5 py-2.5 bg-[#ff4d00] text-black text-xs font-mono font-bold rounded-xl hover:bg-[#ff6622] transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* Realtime: new content is one tap away — never auto-injected */}
          {hasNew && !loading && !error && items.length > 0 && (
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
          {!loading && !error && items.length === 0 && (
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
                  Be the first to start something. Put yourself or someone else on the Hot Seat.
                </p>
                <Link
                  href="/hot-seat"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_25px_rgba(255,77,0,0.3)] uppercase tracking-wider"
                >
                  🔥 START THE FIRE
                </Link>
              </div>
            )
          )}

          {/* Feed Items */}
          {!loading && items.length > 0 && (
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
                <React.Fragment key={`${item.type}-${item.id}`}>
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
                </React.Fragment>
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
          {/* Personalized creator discovery (signed-in viewers only) */}
          <PeopleYouMayLike signedIn={signedIn} />
          <TrendingSidebar />
        </aside>
      </div>
    </div>
  );
}
