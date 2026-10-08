'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Flame, TrendingUp, Clock, Swords, Loader2,
  Plus, Zap, Trophy, ArrowUpRight, MessageSquare,
  Search, ArrowBigUp, Compass, X, Hash, Users, Sparkles
} from 'lucide-react';
import { CommunityCard } from '@/components/communities';
import { ChallengeCard } from '@/components/challenges';
import Avatar from '@/components/ui/Avatar';
import FollowButton from '@/components/social/FollowButton';
import { aggregateTags } from '@/lib/hashtags';
import { t } from '@/lib/lang';

/**
 * /explore — Global Social Discovery Hub.
 *
 * What's happening on BurnBoard: For You, Trending, Fresh, Users, Topics,
 * Hashtags, Communities, Battles, Challenges. Every section renders REAL
 * data only — empty sections stay hidden, never fabricated.
 *
 * Social model: every public account is a USER. No target/profile-submit
 * language anywhere on this screen.
 */

const PAGE_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── SWR Fetchers (existing endpoints — no duplicate systems) ──
const fetchTrending = async (window) => {
  const params = new URLSearchParams({ type: 'all', window, limit: '20' });
  const res = await fetch(`/api/trending?${params}`);
  if (!res.ok) throw new Error('Failed to fetch trending');
  return res.json();
};

const fetchForYou = async () => {
  const res = await fetch('/api/feed?tab=for_you&limit=6');
  if (!res.ok) throw new Error('Failed to fetch feed');
  return res.json();
};

const fetchRisingUsers = async () => {
  const res = await fetch('/api/recommendations/creators?limit=8');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
};

const fetchTopics = async () => {
  const res = await fetch('/api/search?scope=topics&limit=12');
  if (!res.ok) throw new Error('Failed to fetch topics');
  return res.json();
};

// ── Tabs ───────────────────────────────────────────────────
const WINDOWS = [
  { key: 'now', label: 'Now', icon: Zap },
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'week', label: 'This Week', icon: TrendingUp },
  { key: 'alltime', label: 'All Time', icon: Trophy },
];

const SECTIONS = [
  { key: 'foryou', label: 'For You', icon: Sparkles },
  { key: 'trending', label: 'Trending', icon: TrendingUp },
  { key: 'fresh', label: 'Fresh', icon: Clock },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'topics', label: 'Topics', icon: Compass },
  { key: 'hashtags', label: 'Hashtags', icon: Hash },
  { key: 'communities', label: 'Communities', icon: Users },
  { key: 'battles', label: 'Battles', icon: Swords },
  { key: 'challenges', label: 'Challenges', icon: Trophy },
];

// ── Hot Seat Card ────────────────────────────────────────────
function HotSeatCard({ seat }) {
  const heatConfig = {
    light: { emoji: '🙂', color: 'text-green-400' },
    savage: { emoji: '🔥', color: 'text-[#ff4d00]' },
    brutal: { emoji: '💀', color: 'text-red-400' },
  };
  const heat = heatConfig[seat.heat_level] || heatConfig.savage;

  return (
    <Link href={`/hot-seat/${seat.id}`}>
      <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-all duration-200 hover:shadow-[0_0_20px_rgba(255,77,0,0.1)] group cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate group-hover:text-[#ff4d00] transition-colors">
              {seat.title}
            </p>
            <p className="text-[11px] text-zinc-400 truncate">
              by {seat.display_name || 'Anonymous'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className={`px-2 py-0.5 rounded-md border border-[#262626] ${heat.color}`}>
            {heat.emoji} {heat.heat_level || 'savage'}
          </span>
          <span className="px-2 py-0.5 rounded-md border border-[#262626] text-zinc-400 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {seat.roast_count || 0}
          </span>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1a1a1a]">
          <span className="text-[10px] text-zinc-600 font-mono">{timeAgo(seat.created_at)}</span>
          <span className="text-[11px] font-mono font-bold text-[#ff4d00] group-hover:text-white transition-colors flex items-center gap-1">
            ROAST <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Roast Item ──────────────────────────────────────────────
function RoastItem({ roast }) {
  return (
    <div className="bg-[#111] border border-[#222] hover:border-[#333] rounded-2xl p-4 transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-[#ff4d00] font-black font-mono flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d00]" />
          {roast.anon_id || 'Anonymous'}
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">{timeAgo(roast.created_at)}</span>
      </div>
      <p className="text-sm text-zinc-100 leading-relaxed select-text mb-3">
        &ldquo;{roast.roast_text}&rdquo;
      </p>
      <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500 pt-3 border-t border-[#1a1a1a]">
        {(roast.reaction_haha || 0) > 0 && (
          <span className="flex items-center gap-1">😂 {formatCount(roast.reaction_haha)}</span>
        )}
        {(roast.reaction_brutal || 0) > 0 && (
          <span className="flex items-center gap-1">🔥 {formatCount(roast.reaction_brutal)}</span>
        )}
        {(roast.reaction_cry || 0) > 0 && (
          <span className="flex items-center gap-1">💀 {formatCount(roast.reaction_cry)}</span>
        )}
        {(roast.upvotes || 0) > 0 && (
          <span className="flex items-center gap-1 text-[#ff4d00]">
            <ArrowBigUp className="w-3 h-3" /> {formatCount(roast.upvotes)}
          </span>
        )}
      </div>
      {roast.source === 'hot_seat' && roast.hot_seat_id && (
        <Link
          href={`/hot-seat/${roast.hot_seat_id}`}
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors"
        >
          View Hot Seat →
        </Link>
      )}
    </div>
  );
}

// ── Feed Preview Card (For You / Fresh) ─────────────────────
function FeedPreviewCard({ item }) {
  const href = item.type === 'roast' ? `/r/${item.id}` : `/post/${item.id}`;
  return (
    <Link href={href}>
      <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-all group cursor-pointer">
        <div className="flex items-center gap-2 mb-2 min-w-0">
          <span className="text-[11px] font-mono font-bold text-[#ff4d00] truncate">
            @{item.author?.username || item.author?.displayName || 'Anonymous'}
          </span>
          <span className="text-[10px] text-zinc-600 font-mono shrink-0">{timeAgo(item.createdAt)}</span>
        </div>
        {item.mediaUrl && (
          <div className="mb-2 rounded-xl overflow-hidden">
            <img src={item.mediaUrl} alt="Post image" className="feed-media w-full max-h-64" loading="lazy" decoding="async" />
          </div>
        )}
        {item.text && (
          <p className="text-sm text-zinc-100 leading-relaxed line-clamp-3 group-hover:text-white">
            {item.text}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-zinc-500">
          {(item.upvotes || 0) > 0 && <span>▲ {formatCount(item.upvotes)}</span>}
          {(item.commentCount || 0) > 0 && <span>💬 {formatCount(item.commentCount)}</span>}
        </div>
      </div>
    </Link>
  );
}

// ── User Card (real USER profiles — never "creators") ────────
function UserCard({ user }) {
  return (
    <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-all">
      <div className="flex items-center gap-3">
        <Link href={user.username ? `/u/${user.username}` : '#'} className="shrink-0" aria-label={`View @${user.username}`}>
          <Avatar username={user.username} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={user.username ? `/u/${user.username}` : '#'}>
            <p className="text-sm font-bold text-white truncate hover:text-[#ff4d00] transition-colors">
              @{user.username}
            </p>
          </Link>
          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
            {user.displayName || user.bio || `${formatCount(user.followerCount || 0)} followers`}
          </p>
          {user.reason?.text && (
            <p className="text-[10px] font-mono text-zinc-600 truncate mt-0.5">{user.reason.text}</p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <FollowButton targetUserId={user.id} size="sm" />
      </div>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────
function SectionHeader({ emoji, title, count, href, hrefLabel }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">{emoji}</span>
        <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">{title}</h2>
        {count > 0 && (
          <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link href={href} className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors flex items-center gap-1 min-h-[36px]">
          {hrefLabel || 'View all'} <ArrowUpRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ── Search with live suggestions (real data only) ────────────
function ExploreSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const onChange = (v) => {
    setValue(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim() || v.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(v.trim())}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          setSuggestions(data.suggestions || []);
          setOpen(true);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setSuggestions([]);
        }
      }
    }, 250);
  };

  const submit = (q) => {
    const query = (q ?? value).trim();
    if (!query) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search users, posts, topics, hashtags..."
          aria-label="Search users, posts, topics, hashtags"
          autoComplete="off"
          className="w-full bg-[#111] border border-[#222] rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-colors min-h-[44px]"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              setSuggestions([]);
              setOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-zinc-500 hover:text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 inset-x-0 top-full mt-1 bg-[#111] border border-[#222] rounded-xl shadow-2xl overflow-hidden" role="listbox" aria-label="Search suggestions">
          {suggestions.slice(0, 6).map((s) => (
            <Link
              key={`${s.type}-${s.id}`}
              href={s.href}
              className="flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-[#1a1a1a] transition-colors min-h-[44px]"
              role="option"
              aria-selected="false"
            >
              <span className="font-mono text-[10px] uppercase text-zinc-600 w-16 shrink-0">{s.type}</span>
              <span className="text-zinc-200 truncate">{s.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function ExplorePage() {
  const [activeWindow, setActiveWindow] = useState('now');
  const [activeSection, setActiveSection] = useState('foryou');
  const [retryTick, setRetryTick] = useState(0);

  const { data, error, isLoading } = useSWR(
    ['explore-trending', activeWindow, retryTick],
    () => fetchTrending(activeWindow),
    {
      revalidateOnFocus: false,
      refreshInterval: 30000,
    }
  );

  const { data: feedData } = useSWR(
    ['explore-foryou', retryTick],
    fetchForYou,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  const { data: usersData } = useSWR(
    'explore-rising-users',
    fetchRisingUsers,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  const { data: topicsData } = useSWR(
    ['explore-topics', retryTick],
    fetchTopics,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  // Real communities for discovery (real data only — no fake trending)
  const fetchCommunities = async () => {
    const res = await fetch('/api/communities?sort=members&limit=6');
    if (!res.ok) throw new Error('Failed to fetch communities');
    return res.json();
  };

  const { data: communityData } = useSWR(
    ['explore-communities', retryTick],
    fetchCommunities,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  // Real challenges for discovery (active only — no fabricated sections)
  const fetchChallenges = async () => {
    const res = await fetch('/api/challenges?scope=active&limit=6');
    if (!res.ok) throw new Error('Failed to fetch challenges');
    return res.json();
  };
  const { data: challengeData } = useSWR(
    ['explore-challenges', retryTick],
    fetchChallenges,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  const hotSeats = data?.hotSeats || [];
  const roasts = data?.roasts || [];
  const battles = data?.battles || [];
  const forYouItems = feedData?.items || [];
  const risingUsers = usersData?.items || [];
  const topics = topicsData?.topics || [];
  const communities = communityData?.communities || [];
  const challenges = challengeData?.challenges || [];

  // Fresh: genuinely recent public content (recency-first from live data).
  const freshItems = useMemo(() => {
    const mixed = [
      ...hotSeats.map((s) => ({ kind: 'seat', at: s.created_at, data: s })),
      ...roasts.map((r) => ({ kind: 'roast', at: r.created_at, data: r })),
    ];
    return mixed
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8);
  }, [hotSeats, roasts]);

  // Trending hashtags from real content text (never fabricated counts).
  const trendingTags = useMemo(() => {
    const texts = roasts.slice(0, 30).map((r) => r.roast_text || '');
    const agg = aggregateTags(texts.map((t) => ({ content_text: t })), {
      getText: (r) => r.content_text,
      getAuthorId: () => null,
    });
    return agg.slice(0, 10);
  }, [roasts]);

  const hasAnything =
    hotSeats.length > 0 || roasts.length > 0 || battles.length > 0 ||
    forYouItems.length > 0 || risingUsers.length > 0 || topics.length > 0 ||
    trendingTags.length > 0 || communities.length > 0 || challenges.length > 0;
  const isEmpty = !isLoading && !hasAnything;

  // Discovery analytics (existing funnel event — no new taxonomy).
  useEffect(() => {
    try {
      fetch('/api/growth/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'discovery_opened', metadata: { surface: 'explore' } }),
      }).catch(() => {});
    } catch {}
  }, []);

  const showSection = (key) => activeSection === 'foryou' || activeSection === key;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header — compact Explore identity */}
        <header className="space-y-4 py-4 border-b border-[#222]">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors min-h-[44px]">
              <Flame className="w-4 h-4 text-[#ff4d00] fill-[#ff4d00]" />
              <span>BURNBOARD</span>
            </Link>
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold text-[11px] rounded-xl transition-all shadow-[0_0_15px_rgba(255,77,0,0.3)] min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" />
              CREATE
            </Link>
          </div>

          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Compass className="w-6 h-6" />
              <h1 className="text-xl font-black uppercase tracking-wider font-mono">EXPLORE</h1>
            </div>
            <p className="text-xs text-zinc-400 font-mono">
              Discover what&apos;s happening on BurnBoard.
            </p>
          </div>
        </header>

        {/* Search — full discovery architecture */}
        <ExploreSearch />
        <div className="-mt-3 text-right">
          <Link href="/search" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors min-h-[36px] inline-flex items-center">
            Full search — users, posts, topics, hashtags →
          </Link>
        </div>

        {/* Section Tabs */}
        <nav className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto no-scrollbar" role="tablist" aria-label="Discovery categories">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(s.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap transition-all min-h-[44px] ${
                  active
                    ? 'bg-[#ff4d00] text-black'
                    : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Time Window Tabs (trend relevance) */}
        {(activeSection === 'foryou' || activeSection === 'trending' || activeSection === 'fresh') && (
          <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto no-scrollbar" role="tablist" aria-label="Time window">
            {WINDOWS.map(w => {
              const Icon = w.icon;
              const active = activeWindow === w.key;
              return (
                <button
                  key={w.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveWindow(w.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap transition-all min-h-[44px] ${
                    active
                      ? 'bg-[#1a1a1a] text-white border border-[#333]'
                      : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {w.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4" aria-live="polite" aria-label={t('loading')}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-4 animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#222]" />
                  <div className="space-y-2 flex-1">
                    <div className="w-3/4 h-4 bg-[#222] rounded" />
                    <div className="w-1/3 h-3 bg-[#1a1a1a] rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-bold text-zinc-300">Explore isn&apos;t available right now.</p>
            <p className="text-xs text-zinc-500">Check your connection and try again.</p>
            <button
              onClick={() => setRetryTick((n) => n + 1)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl hover:bg-[#ff6622] transition-all min-h-[44px]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State — discovery-oriented, working buttons only */}
        {isEmpty && !isLoading && (
          <div className="bg-gradient-to-br from-[#1a0a00] via-[#111] to-[#0a0a0a] border-2 border-[#ff4d00]/30 rounded-3xl p-10 text-center space-y-4 shadow-[0_0_40px_rgba(255,77,0,0.1)]">
            <div className="text-5xl" aria-hidden="true">🧭</div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">
              DISCOVER SOMETHING NEW
            </h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Explore users, topics, communities, Battles and fresh posts.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setActiveSection('trending')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all min-h-[44px] uppercase tracking-wider"
              >
                Explore Trending
              </button>
              <button
                onClick={() => setActiveSection('topics')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#111] border border-[#333] text-zinc-200 font-bold text-sm rounded-xl hover:border-[#ff4d00]/50 transition-all min-h-[44px] uppercase tracking-wider"
              >
                Browse Topics
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <div className="space-y-8">
            {/* For You */}
            {showSection('foryou') && forYouItems.length > 0 && (
              <section className="space-y-4" aria-label="For You">
                <SectionHeader emoji="✨" title="For You" count={forYouItems.length} href="/home" hrefLabel="Open Feed" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {forYouItems.slice(0, 4).map((item) => (
                    <FeedPreviewCard key={`${item.type}-${item.id}`} item={item} />
                  ))}
                </div>
              </section>
            )}

            {/* Trending */}
            {showSection('trending') && (
              <>
                {hotSeats.length > 0 && (
                  <section className="space-y-4" aria-label="Trending Hot Seats">
                    <SectionHeader emoji="🪑" title="Trending Hot Seats" count={hotSeats.length} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {hotSeats.slice(0, 4).map(seat => (
                        <HotSeatCard key={seat.id} seat={seat} />
                      ))}
                    </div>
                  </section>
                )}
                {roasts.length > 0 && (
                  <section className="space-y-4" aria-label="Trending Roasts">
                    <SectionHeader emoji="😂" title="Trending Roasts" count={roasts.length} />
                    <div className="space-y-3">
                      {roasts.slice(0, 5).map(roast => (
                        <RoastItem key={roast.id} roast={roast} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* Fresh */}
            {showSection('fresh') && freshItems.length > 0 && (
              <section className="space-y-4" aria-label="Fresh">
                <SectionHeader emoji="🆕" title="Fresh" count={freshItems.length} />
                <div className="space-y-3">
                  {freshItems.map((entry) => (
                    entry.kind === 'seat'
                      ? <HotSeatCard key={`fresh-seat-${entry.data.id}`} seat={entry.data} />
                      : <RoastItem key={`fresh-roast-${entry.data.id}`} roast={entry.data} />
                  ))}
                </div>
              </section>
            )}

            {/* Rising Users */}
            {showSection('users') && risingUsers.length > 0 && (
              <section className="space-y-4" aria-label="Rising Users">
                <SectionHeader emoji="🌟" title="Rising Users" count={risingUsers.length} href="/search" hrefLabel="Find people" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {risingUsers.map((u) => (
                    <UserCard key={u.id} user={u} />
                  ))}
                </div>
              </section>
            )}

            {/* Topics */}
            {showSection('topics') && topics.length > 0 && (
              <section className="space-y-4" aria-label="Popular Topics">
                <SectionHeader emoji="🌎" title="Popular Topics" count={topics.length} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {topics.slice(0, 9).map((topic) => (
                    <Link
                      key={topic.id}
                      href={`/search?q=${encodeURIComponent(topic.name)}`}
                      className="block bg-[#111] border border-[#222] hover:border-[#ff4d00]/50 rounded-2xl p-4 transition-all group min-h-[76px]"
                    >
                      <p className="text-sm font-bold text-white group-hover:text-[#ff4d00] transition-colors truncate">
                        {topic.name}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 mt-1">
                        {(topic.communityCount || 0) > 0 ? `${topic.communityCount} ${topic.communityCount === 1 ? 'community' : 'communities'}` : 'Explore posts'}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Hashtags */}
            {showSection('hashtags') && trendingTags.length > 0 && (
              <section className="space-y-4" aria-label="Trending Hashtags">
                <SectionHeader emoji="#" title="Trending Hashtags" />
                <div className="flex flex-wrap gap-2">
                  {trendingTags.map((h) => (
                    <Link
                      key={h.tag}
                      href={`/search?q=${encodeURIComponent(`#${h.tag}`)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111] border border-[#222] text-xs font-mono text-[#ff4d00] hover:border-[#ff4d00]/50 transition-all min-h-[40px]"
                    >
                      #{h.tag}
                      <span className="text-zinc-500">{h.count}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Battles */}
            {showSection('battles') && (
              <section className="space-y-4" aria-label="Live Battles">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">⚔️</span>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Live Battles</h2>
                  </div>
                  <Link href="/battle" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors flex items-center gap-1 min-h-[36px]">
                    Enter Arena <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
                {battles.length > 0 ? (
                  <div className="space-y-3">
                    {battles.slice(0, 5).map(battle => (
                      <Link key={battle.id} href="/battle">
                        <div className="bg-[#111] border border-[#222] hover:border-blue-500/30 rounded-2xl p-4 transition-all cursor-pointer group">
                          <div className="flex items-center gap-2 mb-2">
                            <Swords className="w-4 h-4 text-[#ff4d00]" />
                            <span className="text-[11px] font-mono font-bold text-zinc-300 uppercase">Roast Battle</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white font-bold truncate">{battle.profile1?.username || '???'}</span>
                            <span className="text-[#ff4d00] font-black text-xs italic">VS</span>
                            <span className="text-white font-bold truncate">{battle.profile2?.username || '???'}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  activeSection === 'battles' && (
                    <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                      <p className="text-xs text-zinc-500">No live battles yet</p>
                    </div>
                  )
                )}
              </section>
            )}

            {/* Challenges */}
            {showSection('challenges') && (
              <section className="space-y-4" aria-label="Challenges">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">🏆</span>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Challenges to join</h2>
                    {challenges.length > 0 && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
                        {challenges.length}
                      </span>
                    )}
                  </div>
                  <Link href="/challenges" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors flex items-center gap-1 min-h-[36px]">
                    Browse all <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
                {challenges.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {challenges.map(challenge => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  activeSection === 'challenges' && (
                    <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                      <p className="text-xs text-zinc-500">No active challenges right now</p>
                      <Link href="/challenges/new" className="inline-block mt-2 text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors min-h-[36px]">
                        Start one →
                      </Link>
                    </div>
                  )
                )}
              </section>
            )}

            {/* Communities */}
            {showSection('communities') && (
              <section className="space-y-4" aria-label="Communities">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">🏘️</span>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Communities to Discover</h2>
                    {communities.length > 0 && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
                        {communities.length}
                      </span>
                    )}
                  </div>
                  <Link href="/c" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors flex items-center gap-1 min-h-[36px]">
                    Browse all <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
                {communities.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {communities.map(community => (
                      <CommunityCard key={community.id} community={community} />
                    ))}
                  </div>
                ) : (
                  activeSection === 'communities' && (
                    <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                      <p className="text-xs text-zinc-500">No communities yet</p>
                      <Link href="/c/new" className="inline-block mt-2 text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors min-h-[36px]">
                        Create the first one →
                      </Link>
                    </div>
                  )
                )}
              </section>
            )}
          </div>
        )}

        {/* Bottom CTA */}
        {!isLoading && !error && hasAnything && (
          <div className="text-center pt-6 pb-8 border-t border-[#222] space-y-4">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
              Ready to get roasted?
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_25px_rgba(255,77,0,0.3)] uppercase tracking-wider min-h-[44px]"
            >
              🔥 DROP YOUR FIRST BURN
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
