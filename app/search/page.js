'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Search, X, Trash2, RefreshCw, Hash, Clock, Flame } from 'lucide-react';
import { useDebouncedValue } from '@/lib/motion';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import Avatar from '@/components/ui/Avatar';
import FollowButton from '@/components/social/FollowButton';
import NotificationBell from '@/components/NotificationBell';
import { CommunityCard } from '@/components/communities';

/**
 * /search — Universal Search (family composition).
 *
 * Server-backed across Top, People, Roasts, Photos, Hashtags, Communities,
 * Battles, Challenges, Topics. Debounced input with request cancellation
 * and stale-response guards, autocomplete with keyboard navigation,
 * per-account private history, cursor-safe Load more on scoped tabs,
 * trending entry state. All privacy/block/moderation filtering is
 * server-side; every account shown is a USER.
 */

const TABS = [
  { key: 'all', label: 'Top', scope: 'all' },
  { key: 'people', label: 'People', scope: 'people' },
  { key: 'roasts', label: 'Roasts', scope: 'roasts' },
  { key: 'photos', label: 'Photos', scope: 'photos' },
  { key: 'hashtags', label: 'Hashtags', scope: 'hashtags' },
  { key: 'communities', label: 'Communities', scope: 'communities' },
  { key: 'battles', label: 'Battles', scope: 'battles' },
  { key: 'challenges', label: 'Challenges', scope: 'challenges' },
  { key: 'topics', label: 'Topics', scope: 'topics' },
];

const HISTORY_MAX = 8;
const PAGE_LIMIT = 12;

function historyKey(userId) {
  return `burnboard_search_history:${userId || 'anon'}`;
}

function readHistory(userId) {
  try {
    const raw = localStorage.getItem(historyKey(userId));
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function roastHref(item) {
  return item.kind === 'roast' ? `/r/${item.id}` : `/post/${item.id}`;
}

/** Fire-and-forget result-open tracking (discovery loop signal, no PII). */
function trackResultOpen(kind, id) {
  if (!kind || !id) return;
  try {
    fetch('/api/growth/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'search_result_opened', subjectId: String(id).slice(0, 120), metadata: { kind } }),
    }).catch(() => {});
  } catch {}
}

function SectionHeader({ children, count }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <h2 className="text-[15px] font-extrabold tracking-tight text-white">{children}</h2>
      {count > 0 && (
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
          {count}
        </span>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [userId, setUserId] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [trends, setTrends] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestItems, setSuggestItems] = useState([]);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const debouncedQuery = useDebouncedValue(query, 300);
  // Stale-response guard: a slower earlier request must never overwrite
  // newer results (fast repeated searches).
  const seqRef = useRef(0);
  // In-flight request cancellation (bandwidth + race protection).
  const abortRef = useRef(null);
  const suggestAbortRef = useRef(null);
  const suggestTimerRef = useRef(null);
  useEffect(() => () => {
    abortRef.current?.abort();
    suggestAbortRef.current?.abort();
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
  }, []);

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];
  const trimmed = debouncedQuery.trim();

  // Deep-link support: /search?q=... (topic chips, hashtag links) hydrates
  // the input on mount, client-side only (no SSR search-param bailout).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const initial = params.get('q');
      if (initial && initial.trim()) {
        setQuery(initial.trim().slice(0, 80));
        if (params.get('tab')) {
          const requested = params.get('tab');
          if (TABS.some((t) => t.key === requested)) setTab(requested);
        } else if (initial.trim().startsWith('#')) {
          setTab('hashtags');
        }
      }
    } catch {}
  }, []);

  // Auth identity for per-account history isolation.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setHistory(readHistory(null));
      return;
    }
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const id = data?.user?.id || null;
      setUserId(id);
      setHistory(readHistory(id));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const id = session?.user?.id || null;
      setUserId(id);
      setHistory(readHistory(id));
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const runSearch = useCallback(async (q, scope, offsetValue = 0, append = false) => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    // Cancel the previous in-flight request so slow networks can't
    // overwrite newer results (race protection + less bandwidth).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (!append) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&scope=${scope}&limit=${PAGE_LIMIT}&offset=${offsetValue}`,
        { signal: controller.signal }
      );
      const data = await res.json().catch(() => ({}));
      if (seq !== seqRef.current) return; // stale — a newer search is in flight
      if (!res.ok || data.error || !data.success) {
        throw new Error(data.error || 'Search failed');
      }
      if (append) {
        setResults((prev) => {
          if (!prev) return data;
          const seen = new Set([
            ...(prev.people || []).map((p) => `u:${p.id}`),
            ...(prev.roasts || []).map((r) => `${r.kind}:${r.id}`),
            ...(prev.photos || []).map((r) => `${r.kind}:${r.id}`),
            ...(prev.challenges || []).map((c) => `c:${c.id}`),
            ...(prev.battles || []).map((b) => `b:${b.id}`),
            ...(prev.communities || []).map((c) => `m:${c.id}`),
          ]);
          const pick = (arr, key) => (arr || []).filter((x) => {
            const k = key(x);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          return {
            ...data,
            people: [...(prev.people || []), ...pick(data.people, (p) => `u:${p.id}`)],
            roasts: [...(prev.roasts || []), ...pick(data.roasts, (r) => `${r.kind}:${r.id}`)],
            photos: [...(prev.photos || []), ...pick(data.photos, (r) => `${r.kind}:${r.id}`)],
            challenges: [...(prev.challenges || []), ...pick(data.challenges, (c) => `c:${c.id}`)],
            battles: [...(prev.battles || []), ...pick(data.battles, (b) => `b:${b.id}`)],
            communities: [...(prev.communities || []), ...pick(data.communities, (c) => `m:${c.id}`)],
          };
        });
      } else {
        setResults({ ...data, offset: offsetValue });
      }
    } catch (err) {
      if (err?.name === 'AbortError' || seq !== seqRef.current) return;
      if (!append) {
        setResults(null);
        setError('Search is unavailable right now.');
      }
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!trimmed) {
      seqRef.current += 1; // cancel in-flight
      abortRef.current?.abort();
      setResults(null);
      setLoading(false);
      setLoadingMore(false);
      setError('');
      return;
    }
    runSearch(trimmed, activeTab.scope);
  }, [trimmed, activeTab.scope, runSearch]);

  // Trending searches for the entry state (real trends only, empty when quiet).
  useEffect(() => {
    if (trimmed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/search/trending?window=today');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setTrends(data.trends || []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [trimmed]);

  // Autocomplete: lightweight suggest endpoint, debounced + abortable.
  // Never a full search per keystroke; stale responses are discarded.
  useEffect(() => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setSuggestItems([]);
      setSuggestOpen(false);
      setSuggestIndex(-1);
      return;
    }
    suggestTimerRef.current = setTimeout(async () => {
      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q.slice(0, 40))}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && (data.suggestions || []).length) {
          setSuggestItems(data.suggestions);
          setSuggestOpen(true);
          setSuggestIndex(-1);
        } else {
          setSuggestItems([]);
          setSuggestOpen(false);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setSuggestItems([]);
        }
      }
    }, 200);
    return () => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, [query]);

  const submitSearch = useCallback((raw) => {
    const q = (raw ?? query).trim();
    if (!q) return;
    setSuggestOpen(false);
    saveHistory(q);
    track('search_submitted', { scope: activeTab.scope, length: q.length });
    runSearch(q, activeTab.scope);
  }, [query, activeTab.scope, runSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveHistory = useCallback((term) => {
    const clean = term.trim();
    if (!clean) return;
    setHistory((prev) => {
      const next = [clean, ...prev.filter((h) => h.toLowerCase() !== clean.toLowerCase())].slice(0, HISTORY_MAX);
      try {
        localStorage.setItem(historyKey(userId), JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [userId]);

  const removeHistoryItem = useCallback((term) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== term);
      try {
        localStorage.setItem(historyKey(userId), JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [userId]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(historyKey(userId));
    } catch {}
  }, [userId]);

  const switchTab = useCallback((key) => {
    setTab(key);
    track('search_category_selected', { category: key });
  }, []);

  const loadMore = useCallback(() => {
    if (!results || loadingMore) return;
    const nextOffset = (results.offset || 0) + PAGE_LIMIT;
    runSearch(trimmed, activeTab.scope, nextOffset, true);
  }, [results, loadingMore, trimmed, activeTab.scope, runSearch]);

  const hasQuery = trimmed.length > 0;
  const people = results?.people || [];
  const roasts = results?.roasts || [];
  const photos = results?.photos || [];
  const hashtagTags = results?.hashtags?.tags || [];
  const hashtagPosts = results?.hashtags?.posts || [];
  const communities = results?.communities || [];
  const challenges = results?.challenges || [];
  const battles = results?.battles || [];
  const topics = results?.topics || [];
  const suggestions = results?.suggestions || [];
  const related = results?.related || [];
  const didYouMean = results?.didYouMean || null;
  const showPeople = tab === 'all' || tab === 'people';
  const showRoasts = tab === 'all' || tab === 'roasts' || tab === 'hashtags';
  const showPhotos = tab === 'all' || tab === 'photos';
  const showBattles = tab === 'all' || tab === 'battles';
  const roastList = tab === 'hashtags' ? hashtagPosts : roasts;
  const photoList = tab === 'photos' ? photos : (tab === 'all' ? photos : []);
  const scopedHasMore = tab !== 'all' && !!results?.hasMore;
  const isEmpty =
    hasQuery && !loading && !error && results &&
    people.length === 0 && roastList.length === 0 && photoList.length === 0 &&
    (tab !== 'hashtags' || hashtagTags.length === 0) &&
    (tab === 'all' || tab === 'communities' ? communities.length === 0 : true) &&
    (tab === 'all' || tab === 'challenges' ? challenges.length === 0 : true) &&
    (tab === 'all' || tab === 'battles' ? battles.length === 0 : true) &&
    (tab === 'all' || tab === 'topics' ? topics.length === 0 : true);

  const onInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (suggestOpen) {
        e.preventDefault();
        setSuggestOpen(false);
        setSuggestIndex(-1);
      } else if (query) {
        setQuery('');
      }
      return;
    }
    if (!suggestOpen || !suggestItems.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestIndex((i) => {
        const n = suggestItems.length;
        if (e.key === 'ArrowDown') return i + 1 >= n ? 0 : i + 1;
        return i - 1 < 0 ? n - 1 : i - 1;
      });
    } else if (e.key === 'Enter' && suggestIndex >= 0 && suggestItems[suggestIndex]) {
      const s = suggestItems[suggestIndex];
      track('search_suggestion_selected', { type: s.type });
      if (s.href && (s.type === 'user' || s.type === 'community' || s.type === 'topic')) {
        window.location.href = s.href;
      } else {
        submitSearch(s.label.replace(/^@/, ''));
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pt-4 sm:px-6">
        {/* Brand header */}
        <header className="flex min-h-[44px] items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5" aria-label="BurnBoard home">
            <Flame className="h-5 w-5 fill-[#ff4d00] text-[#ff4d00]" />
            <span className="text-[15px] font-black tracking-wide text-white">BURNBOARD</span>
          </Link>
          <NotificationBell />
        </header>

        {/* Hero */}
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-[28px] font-black leading-none tracking-tight text-white">
            <span aria-hidden="true">🔍</span> Search
          </h1>
          <p className="text-[13px] text-zinc-400">
            Find people, posts, topics and what&apos;s happening on BurnBoard.
          </p>
        </div>

        {/* Search Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) submitSearch(query);
          }}
          className="sticky top-2 z-30"
          role="search"
        >
          <div className="rounded-2xl border border-white/10 bg-[#141416]/90 backdrop-blur-xl transition-all focus-within:border-[#ff4d00]/60 focus-within:shadow-[0_0_24px_rgba(255,77,0,0.18)]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              onFocus={() => suggestItems.length && setSuggestOpen(true)}
              placeholder="Search users, posts, topics, hashtags..."
              aria-label="Search users, posts, topics, hashtags"
              aria-expanded={suggestOpen}
              aria-controls="search-suggestions"
              aria-activedescendant={suggestIndex >= 0 ? `suggest-${suggestIndex}` : undefined}
              role="combobox"
              aria-autocomplete="list"
              autoComplete="off"
              className="min-h-[52px] w-full bg-transparent py-3 pl-11 pr-11 text-sm text-white placeholder-zinc-500 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSuggestItems([]);
                  setSuggestOpen(false);
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex min-h-[40px] min-w-[40px] -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Autocomplete */}
          {suggestOpen && suggestItems.length > 0 && (
            <div
              id="search-suggestions"
              role="listbox"
              aria-label="Search suggestions"
              className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#141416]/95 shadow-2xl backdrop-blur-xl"
            >
              {suggestItems.slice(0, 8).map((s, i) => (
                <button
                  key={`${s.type}-${s.id}`}
                  id={`suggest-${i}`}
                  role="option"
                  aria-selected={i === suggestIndex}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    track('search_suggestion_selected', { type: s.type });
                    if (s.href && (s.type === 'user' || s.type === 'community' || s.type === 'topic')) {
                      window.location.href = s.href;
                    } else {
                      setQuery(s.label.replace(/^@/, ''));
                    }
                    setSuggestOpen(false);
                  }}
                  onMouseEnter={() => setSuggestIndex(i)}
                  className={`flex min-h-[44px] w-full items-center gap-2.5 px-4 text-left text-xs transition-colors ${
                    i === suggestIndex ? 'bg-[#ff4d00]/15 text-white' : 'text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  <span className="w-20 shrink-0 font-mono text-[10px] uppercase text-zinc-600">{s.type}</span>
                  <span className="truncate">{s.label}</span>
                  {s.sub && <span className="ml-auto shrink-0 truncate pl-2 text-[11px] text-zinc-600">{s.sub}</span>}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Category chips */}
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:-mx-6 sm:px-6" role="tablist" aria-label="Search categories">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(t.key)}
                className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-4 text-xs font-bold transition-all active:scale-95 ${
                  active
                    ? 'border-[#ff4d00] bg-[#ff4d00] text-black shadow-[0_0_16px_rgba(255,77,0,0.35)]'
                    : 'border-white/10 bg-white/[0.05] text-zinc-300 backdrop-blur-xl hover:border-white/25 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Loading */}
        {loading && (
          <div className="space-y-2" aria-live="polite" aria-label="Loading results">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border border-white/5 bg-[#111] p-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-[#1e1e1e]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/5 rounded bg-[#1e1e1e]" />
                  <div className="h-3 w-3/5 rounded bg-[#1a1a1a]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && hasQuery && (
          <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-bold text-zinc-200">Search couldn&apos;t load.</p>
            <p className="text-xs text-zinc-500">Check your connection and try again.</p>
            <button
              onClick={() => runSearch(trimmed, activeTab.scope)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && hasQuery && results && !isEmpty && (
          <div className="space-y-6">
            {didYouMean && (
              <button
                onClick={() => setQuery(didYouMean)}
                className="min-h-[44px] w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 text-left font-mono text-xs text-zinc-300 transition-all hover:border-[#ff4d00]/50"
              >
                Did you mean <span className="font-bold text-[#ff4d00]">{didYouMean}</span>?
              </button>
            )}
            {related.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Related searches">
                <span className="shrink-0 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-600">Related:</span>
                {related.map((r) => (
                  <button
                    key={r}
                    onClick={() => setQuery(r)}
                    className="min-h-[40px] shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-zinc-300 transition-all hover:border-white/25 hover:text-white"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            {showPeople && people.length > 0 && (
              <section className="space-y-2" aria-label="People">
                <SectionHeader count={people.length}>People</SectionHeader>
                {people.map((person) => (
                  <div key={person.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all hover:border-[#ff4d00]/40">
                    <Link
                      href={person.username ? `/u/${person.username}` : '#'}
                      onClick={() => trackResultOpen('user', person.id)}
                      className="flex min-w-0 flex-1 items-center gap-3"
                      aria-label={`View profile of ${person.username}`}
                    >
                      <Avatar username={person.username} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">
                          @{person.username}
                        </p>
                        <p className="truncate text-[11px] text-zinc-400">
                          {person.display_name || person.bio || `${person.follower_count || 0} followers`}
                        </p>
                      </div>
                    </Link>
                    <FollowButton targetUserId={person.id} size="sm" />
                  </div>
                ))}
              </section>
            )}

            {showRoasts && roastList.length > 0 && (
              <section className="space-y-2" aria-label="Posts">
                <SectionHeader count={roastList.length}>{tab === 'hashtags' ? 'Matching posts' : 'Posts'}</SectionHeader>
                {roastList.map((item) => (
                  <Link
                    key={`${item.kind}-${item.id}`}
                    href={roastHref(item)}
                    onClick={() => trackResultOpen(item.kind, item.id)}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-[#ff4d00]/40"
                  >
                    <p className="line-clamp-3 text-sm leading-relaxed text-zinc-100">
                      {item.text}
                    </p>
                    <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                      {item.author?.username && <span className="text-[#ff4d00]">@{item.author.username}</span>}
                      <span>·</span>
                      <span>{timeAgo(item.createdAt)}</span>
                      {(item.upvotes > 0 || item.commentCount > 0) && <span>·</span>}
                      {item.upvotes > 0 && <span>▲ {item.upvotes}</span>}
                      {item.commentCount > 0 && <span>💬 {item.commentCount}</span>}
                    </div>
                  </Link>
                ))}
              </section>
            )}

            {showPhotos && photoList.length > 0 && (
              <section className="space-y-2" aria-label="Photos">
                <SectionHeader count={photoList.length}>Photos</SectionHeader>
                <div className="grid grid-cols-2 gap-2">
                  {photoList.slice(0, 6).map((item) => (
                    <Link
                      key={`photo-${item.id}`}
                      href={roastHref(item)}
                      onClick={() => trackResultOpen('social_post', item.id)}
                      className="block rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all hover:border-[#ff4d00]/40"
                    >
                      <p className="line-clamp-4 text-xs leading-relaxed text-zinc-200">
                        {item.text}
                      </p>
                      <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
                        {item.author?.username ? `@${item.author.username} · ` : ''}{timeAgo(item.createdAt)}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {showBattles && battles.length > 0 && (
              <section className="space-y-2" aria-label="Battles">
                <SectionHeader count={battles.length}>Battles</SectionHeader>
                {battles.map((b) => (
                  <Link
                    key={b.id}
                    href="/battle"
                    onClick={() => trackResultOpen('battle', b.id)}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-[#ff4d00]/40"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${b.status === 'live' ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {b.status === 'live' ? '⚡ Live' : '🏁 Finished'}
                      </span>
                      {b.votes > 0 && <span className="font-mono text-[10px] text-zinc-600">▲ {b.votes} votes</span>}
                    </div>
                    <p className="text-sm font-bold text-white">
                      {(b.participants || []).map((p) => `@${p.username}`).join('  vs  ') || 'Battle'}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">{timeAgo(b.createdAt)}</p>
                  </Link>
                ))}
              </section>
            )}

            {(tab === 'all' || tab === 'hashtags') && hashtagTags.length > 0 && (
              <section className="space-y-2" aria-label="Hashtags">
                <SectionHeader count={hashtagTags.length}>Hashtags</SectionHeader>
                <div className="flex flex-wrap gap-2">
                  {hashtagTags.map((h) => (
                    <button
                      key={h.tag}
                      onClick={() => {
                        setQuery(`#${h.tag}`);
                        setTab('hashtags');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-[#ff4d00] transition-all hover:border-[#ff4d00]/50"
                    >
                      <Hash className="h-3.5 w-3.5" />
                      {h.tag}
                      <span className="text-zinc-500">{h.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(tab === 'all' || tab === 'communities') && communities.length > 0 && (
              <section className="space-y-2" aria-label="Communities">
                <SectionHeader count={communities.length}>Communities</SectionHeader>
                <div className="grid grid-cols-1 gap-2">
                  {communities.map((community) => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
              </section>
            )}

            {(tab === 'all' || tab === 'challenges') && challenges.length > 0 && (
              <section className="space-y-2" aria-label="Challenges">
                <SectionHeader count={challenges.length}>Challenges</SectionHeader>
                <div className="grid grid-cols-1 gap-2">
                  {challenges.map((c) => (
                    <Link
                      key={c.id}
                      href={`/challenges/${c.slug}`}
                      onClick={() => trackResultOpen('challenge', c.id)}
                      className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-[#ff4d00]/40"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                          c.status === 'active' ? 'text-emerald-400' : 'text-zinc-500'
                        }`}>
                          {c.status === 'active' ? '⚡ Live' : c.status === 'ended' ? '🏁 Ended' : c.status}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-600">{c.challenge_type?.replace('_', ' ')}</span>
                      </div>
                      <p className="line-clamp-1 text-sm font-bold text-white">
                        {c.title}
                      </p>
                      {c.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{c.description}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {(tab === 'all' || tab === 'topics') && topics.length > 0 && (
              <section className="space-y-2" aria-label="Topics">
                <SectionHeader count={topics.length}>Topics</SectionHeader>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => {
                        setQuery(topic.name);
                        setTab('all');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-zinc-200 transition-all hover:border-[#ff4d00]/50 hover:text-white"
                    >
                      🌎 {topic.name}
                      {topic.communityCount > 0 && (
                        <span className="text-zinc-500">{topic.communityCount}</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {scopedHasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="min-h-[44px] w-full rounded-2xl border border-white/10 bg-white/[0.03] font-mono text-xs font-bold text-zinc-300 transition-all hover:border-white/25 hover:text-white disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}

        {/* No results */}
        {!loading && !error && isEmpty && (
          <div className="space-y-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
            <div className="text-4xl" aria-hidden="true">🔍</div>
            <p className="text-sm font-bold text-zinc-200">No results for &ldquo;{trimmed}&rdquo;</p>
            {didYouMean ? (
              <button
                onClick={() => setQuery(didYouMean)}
                className="min-h-[44px] rounded-2xl border border-dashed border-white/15 px-4 font-mono text-xs text-zinc-300 transition-all hover:border-[#ff4d00]/50"
              >
                Did you mean <span className="font-bold text-[#ff4d00]">{didYouMean}</span>?
              </button>
            ) : suggestions.length > 0 ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-zinc-500">Try one of these topics:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setQuery(s.name);
                        setTab('all');
                      }}
                      className="min-h-[40px] rounded-full border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-[#ff4d00] transition-all hover:border-[#ff4d00]/50"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Try a different search.</p>
            )}
          </div>
        )}

        {/* Recent searches + entry state */}
        {!hasQuery && !loading && (
          <div className="space-y-4">
            {history.length > 0 && (
              <section className="space-y-2" aria-label="Recent searches">
                <div className="flex items-center justify-between px-0.5">
                  <h2 className="text-[15px] font-extrabold tracking-tight text-white">
                    Recent searches
                  </h2>
                  <button
                    onClick={clearHistory}
                    className="flex min-h-[36px] items-center gap-1 px-2 font-mono text-[11px] text-zinc-500 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {history.map((term) => (
                    <div key={term} className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] px-3 transition-all hover:border-white/25">
                      <button
                        onClick={() => setQuery(term)}
                        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                        <span className="truncate text-sm text-zinc-300">{term}</span>
                      </button>
                      <button
                        onClick={() => removeHistoryItem(term)}
                        aria-label={`Remove ${term}`}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg p-2 text-zinc-600 transition-colors hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {trends.length > 0 && (
              <section className="space-y-2" aria-label="Trending searches">
                <h2 className="px-0.5 text-[15px] font-extrabold tracking-tight text-white">
                  Trending now
                </h2>
                <div className="flex flex-wrap gap-2">
                  {trends.slice(0, 8).map((t) => (
                    <button
                      key={t.query}
                      onClick={() => setQuery(t.query)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-zinc-200 transition-all hover:border-[#ff4d00]/50 hover:text-white"
                    >
                      <span className="text-[#ff4d00]" aria-hidden="true">▲</span>
                      {t.query}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="space-y-3 py-8 text-center">
              <div className="text-4xl" aria-hidden="true">🔍</div>
              <p className="text-sm font-bold text-zinc-400">Search BurnBoard</p>
              <p className="mx-auto max-w-sm text-xs text-zinc-500">
                Find people, roasts, photos, #hashtags, communities, battles, challenges, and topics
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
