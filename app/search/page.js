'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Search, ArrowLeft, X, Trash2, RefreshCw, Hash, Clock } from 'lucide-react';
import { useDebouncedValue } from '@/lib/motion';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import FollowButton from '@/components/social/FollowButton';
import { CommunityCard } from '@/components/communities';

/**
 * /search — BurnBoard discovery search.
 *
 * Server-backed across people, roasts, hashtags, communities, challenges,
 * and topics (GET /api/search). Debounced input, stale-response guard,
 * per-account local search history, friendly error/empty states.
 */

const TABS = [
  { key: 'all', label: 'All', scope: 'all' },
  { key: 'people', label: 'People', scope: 'people' },
  { key: 'roasts', label: 'Roasts', scope: 'roasts' },
  { key: 'hashtags', label: 'Hashtags', scope: 'hashtags' },
  { key: 'communities', label: 'Communities', scope: 'communities' },
  { key: 'challenges', label: 'Challenges', scope: 'challenges' },
  { key: 'topics', label: 'Topics', scope: 'topics' },
];

const HISTORY_MAX = 8;

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
  return `${d}d`;
}

function roastHref(item) {
  return item.kind === 'roast' ? `/r/${item.id}` : `/post/${item.id}`;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [userId, setUserId] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const debouncedQuery = useDebouncedValue(query, 300);
  // Stale-response guard: a slower earlier request must never overwrite
  // newer results (fast repeated searches).
  const seqRef = useRef(0);

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

  // Resolve viewer for per-account history separation.
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

  const runSearch = useCallback(async (q, scope) => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&scope=${scope}&limit=12`);
      const data = await res.json().catch(() => ({}));
      if (seq !== seqRef.current) return; // stale — a newer search is in flight
      if (!res.ok || data.error || !data.success) {
        throw new Error(data.error || 'Search failed');
      }
      setResults(data);
    } catch {
      if (seq !== seqRef.current) return;
      setResults(null);
      setError('Search is unavailable right now.');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!trimmed) {
      seqRef.current += 1; // cancel in-flight
      setResults(null);
      setLoading(false);
      setError('');
      return;
    }
    runSearch(trimmed, activeTab.scope);
  }, [trimmed, activeTab.scope, runSearch]);

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

  const hasQuery = trimmed.length > 0;
  const people = results?.people || [];
  const roasts = results?.roasts || [];
  const hashtagTags = results?.hashtags?.tags || [];
  const hashtagPosts = results?.hashtags?.posts || [];
  const communities = results?.communities || [];
  const challenges = results?.challenges || [];
  const topics = results?.topics || [];
  const suggestions = results?.suggestions || [];
  const showPeople = tab === 'all' || tab === 'people';
  const showRoasts = tab === 'all' || tab === 'roasts' || tab === 'hashtags';
  const roastList = tab === 'hashtags' ? hashtagPosts : roasts;
  const isEmpty =
    hasQuery && !loading && !error && results &&
    people.length === 0 && roastList.length === 0 &&
    (tab !== 'hashtags' || hashtagTags.length === 0) &&
    (tab === 'all' || tab === 'communities' ? communities.length === 0 : true) &&
    (tab === 'all' || tab === 'challenges' ? challenges.length === 0 : true) &&
    (tab === 'all' || tab === 'topics' ? topics.length === 0 : true);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-black text-white uppercase tracking-wider font-mono">Search</h1>
        </div>

        {/* Search Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) {
              saveHistory(query);
              runSearch(query.trim(), activeTab.scope);
            }
          }}
          className="relative"
          role="search"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, roasts, #hashtags, challenges, topics..."
            autoFocus
            aria-label="Search BurnBoard"
            className="w-full bg-[#111] border border-[#222] rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-colors min-h-[48px]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-zinc-500 hover:text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar" role="tablist" aria-label="Search categories">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[11px] font-mono font-bold transition-all min-h-[40px] ${
                  active
                    ? 'bg-[#ff4d00] text-black shadow-[0_0_12px_rgba(255,77,0,0.3)]'
                    : 'bg-[#111] border border-[#222] text-zinc-400 hover:text-white hover:border-[#333]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3" aria-live="polite">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#222] rounded-xl p-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#222]" />
                <div className="space-y-2 flex-1">
                  <div className="w-32 h-4 bg-[#222] rounded" />
                  <div className="w-20 h-3 bg-[#1a1a1a] rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && hasQuery && (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-3">
            <div className="text-3xl">📡</div>
            <p className="text-sm font-bold text-zinc-300">Search is unavailable right now.</p>
            <p className="text-xs text-zinc-500">Check your connection and try again.</p>
            <button
              onClick={() => runSearch(trimmed, activeTab.scope)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl hover:bg-[#ff6622] transition-all min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" />
              TRY AGAIN
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && hasQuery && results && !isEmpty && (
          <div className="space-y-5">
            {showPeople && people.length > 0 && (
              <section className="space-y-3" aria-label="People">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  People ({people.length})
                </p>
                {people.map((person) => (
                  <div key={person.id} className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-xl p-3 transition-all flex items-center gap-3">
                    <Link href={person.username ? `/u/${person.username}` : '#'} className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar username={person.username} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">
                          @{person.username}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
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
              <section className="space-y-3" aria-label="Roasts">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Roasts ({roastList.length})
                </p>
                {roastList.map((item) => (
                  <Link key={`${item.kind}-${item.id}`} href={roastHref(item)}>
                    <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-xl p-4 transition-all cursor-pointer group">
                      <p className="text-sm text-zinc-100 leading-relaxed line-clamp-3 group-hover:text-white">
                        {item.text}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-zinc-500">
                        {item.author?.username && <span className="text-[#ff4d00]">@{item.author.username}</span>}
                        <span>·</span>
                        <span>{timeAgo(item.createdAt)}</span>
                        {(item.upvotes > 0 || item.commentCount > 0) && <span>·</span>}
                        {item.upvotes > 0 && <span>▲ {item.upvotes}</span>}
                        {item.commentCount > 0 && <span>💬 {item.commentCount}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </section>
            )}

            {(tab === 'all' || tab === 'hashtags') && hashtagTags.length > 0 && (
              <section className="space-y-3" aria-label="Hashtags">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Hashtags ({hashtagTags.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {hashtagTags.map((h) => (
                    <button
                      key={h.tag}
                      onClick={() => {
                        setQuery(`#${h.tag}`);
                        setTab('hashtags');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111] border border-[#222] text-xs font-mono text-[#ff4d00] hover:border-[#ff4d00]/50 transition-all min-h-[40px]"
                    >
                      <Hash className="w-3.5 h-3.5" />
                      {h.tag}
                      <span className="text-zinc-500">{h.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(tab === 'all' || tab === 'communities') && communities.length > 0 && (
              <section className="space-y-3" aria-label="Communities">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Communities ({communities.length})
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {communities.map((community) => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
              </section>
            )}

            {(tab === 'all' || tab === 'challenges') && challenges.length > 0 && (
              <section className="space-y-3" aria-label="Challenges">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Challenges ({challenges.length})
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {challenges.map((c) => (
                    <Link
                      key={c.id}
                      href={`/challenges/${c.slug}`}
                      className="block bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-xl p-4 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                          c.status === 'active' ? 'text-emerald-400' : 'text-zinc-500'
                        }`}>
                          {c.status === 'active' ? '⚡ Live' : c.status === 'ended' ? '🏁 Ended' : c.status}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-600">{c.challenge_type?.replace('_', ' ')}</span>
                      </div>
                      <p className="text-sm font-bold text-white group-hover:text-[#ff4d00] transition-colors line-clamp-1">
                        {c.title}
                      </p>
                      {c.description && (
                        <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{c.description}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {(tab === 'all' || tab === 'topics') && topics.length > 0 && (              <section className="space-y-3" aria-label="Topics">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Topics ({topics.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => {
                        setQuery(topic.name);
                        setTab('all');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111] border border-[#222] text-xs font-mono text-zinc-200 hover:border-[#ff4d00]/50 hover:text-white transition-all min-h-[40px]"
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
          </div>
        )}

        {/* No results */}
        {!loading && !error && isEmpty && (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-2">
            <div className="text-3xl">🔍</div>
            <p className="text-sm font-bold text-zinc-300">No results for &ldquo;{trimmed}&rdquo;</p>
            {suggestions.length > 0 ? (
              <div className="pt-2 space-y-2">
                <p className="text-xs text-zinc-500">Try one of these topics:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setQuery(s.name);
                        setTab('all');
                      }}
                      className="px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] text-xs font-mono text-[#ff4d00] hover:border-[#ff4d00]/50 transition-all min-h-[40px]"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Try another search term</p>
            )}
          </div>
        )}

        {/* Recent searches + entry state */}
        {!hasQuery && !loading && (
          <div className="space-y-4">
            {history.length > 0 && (
              <section className="space-y-3" aria-label="Recent searches">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                    Recent searches
                  </p>
                  <button
                    onClick={clearHistory}
                    className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-red-400 transition-colors min-h-[36px] px-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {history.map((term) => (
                    <div key={term} className="flex items-center gap-1 bg-[#111] border border-[#222] rounded-xl px-3 hover:border-[#333] transition-all">
                      <button
                        onClick={() => setQuery(term)}
                        className="flex items-center gap-2.5 flex-1 min-w-0 py-2.5 text-left min-h-[44px]"
                      >
                        <Clock className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        <span className="text-sm text-zinc-300 truncate">{term}</span>
                      </button>
                      <button
                        onClick={() => removeHistoryItem(term)}
                        aria-label={`Remove ${term}`}
                        className="p-2 rounded-lg text-zinc-600 hover:text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">🔍</div>
              <p className="text-sm font-bold text-zinc-400">Search BurnBoard</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Find people, roasts, #hashtags, communities, challenges, and topics
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
