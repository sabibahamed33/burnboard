'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Flame, TrendingUp, Clock, Swords, Compass,
  Zap, Trophy, MessageSquare,
  Search, ArrowBigUp, X, Hash, Users, Sparkles
} from 'lucide-react';
import { CommunityCard } from '@/components/communities';
import { ChallengeCard } from '@/components/challenges';
import Avatar from '@/components/ui/Avatar';
import FollowButton from '@/components/social/FollowButton';
import NotificationBell from '@/components/NotificationBell';
import { aggregateTags } from '@/lib/hashtags';
import { t } from '@/lib/lang';

/**
 * /explore — Global Social Discovery Hub (reference composition).
 *
 * Header → Hero → glass Search → chips → carousels (Trending Now,
 * Popular Topics, Rising Users, Active Battles) → Challenges,
 * Communities, Fresh. Shell provides bottom nav + sidebar; this page
 * adds no duplicate chrome. Every section renders REAL data only.
 *
 * Social model: every public account is a USER.
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

// Decorative gradient rotation for image-less cards (styling only —
/// counts, people, and content are always real).
const CARD_GRADIENTS = [
  'from-[#2a1200] via-[#140a06] to-[#0a0a0a]',
  'from-[#1a0a2a] via-[#100810] to-[#0a0a0a]',
  'from-[#02202a] via-[#081214] to-[#0a0a0a]',
  'from-[#2a0a14] via-[#140810] to-[#0a0a0a]',
  'from-[#0a2a12] via-[#081208] to-[#0a0a0a]',
  'from-[#23230a] via-[#121208] to-[#0a0a0a]',
];

// ── Editorial trending card (image-led when media exists) ────
function EditorialCard({ image, pill, title, meta, href, gradientIndex = 0 }) {
  const gradient = CARD_GRADIENTS[gradientIndex % CARD_GRADIENTS.length];
  return (
    <Link
      href={href}
      className="group block w-[220px] sm:w-[240px] shrink-0 snap-start overflow-hidden rounded-[20px] border border-white/10 bg-[#111] transition-all duration-200 hover:border-[#ff4d00]/40 hover:shadow-[0_0_28px_rgba(255,77,0,0.15)] active:scale-[0.98]"
    >
      <div className="relative h-32 sm:h-36 overflow-hidden">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`} aria-hidden="true">
            <Flame className="h-10 w-10 text-[#ff4d00]/70" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        {pill && (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] font-mono font-bold text-white backdrop-blur-md">
            {pill}
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-[13px] font-bold leading-snug text-white group-hover:text-[#ff4d00]">
          {title}
        </p>
        {meta && (
          <p className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
            <span className="text-[#ff4d00]">🔥</span> {meta}
          </p>
        )}
      </div>
    </Link>
  );
}

// ── Hot Seat Card (full-row variant) ─────────────────────────
function HotSeatCard({ seat }) {
  const heatConfig = {
    light: { emoji: '🙂', color: 'text-green-400' },
    savage: { emoji: '🔥', color: 'text-[#ff4d00]' },
    brutal: { emoji: '💀', color: 'text-red-400' },
  };
  const heat = heatConfig[seat.heat_level] || heatConfig.savage;

  return (
    <Link href={`/hot-seat/${seat.id}`}>
      <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-all duration-200 hover:shadow-[0_0_20px_rgba(255,77,0,0.1)] group cursor-pointer active:scale-[0.99]">
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
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors min-h-[32px]"
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
      <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-all group cursor-pointer active:scale-[0.99] h-full">
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

// ── Rising User Card (carousel, centered identity) ──────────
function RisingUserCard({ user }) {
  return (
    <div className="w-[168px] shrink-0 snap-start rounded-[20px] border border-white/10 bg-white/[0.04] p-4 text-center backdrop-blur-xl transition-all hover:border-[#ff4d00]/40">
      <div className="relative mx-auto w-fit">
        <Link href={user.username ? `/u/${user.username}` : '#'} aria-label={`View @${user.username}`}>
          <Avatar username={user.username} size="md" />
        </Link>
        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0a0a0a] bg-[#ff4d00]" aria-hidden="true" />
      </div>
      <Link href={user.username ? `/u/${user.username}` : '#'}>
        <p className="mt-2 truncate text-[13px] font-bold text-white hover:text-[#ff4d00]">
          {user.displayName || `@${user.username}`}
        </p>
      </Link>
      <p className="truncate font-mono text-[10px] text-zinc-500">@{user.username}</p>
      <p className="mt-1 line-clamp-2 min-h-[2rem] text-[11px] leading-snug text-zinc-400">
        {user.bio || user.reason?.text || `${formatCount(user.followerCount || 0)} followers`}
      </p>
      <div className="mt-2.5">
        <FollowButton targetUserId={user.id} size="sm" />
      </div>
    </div>
  );
}

// ── Wide Battle Card (real status only — no invented timers) ─
function BattleCard({ battle }) {
  const p1 = battle.profile1?.username || '???';
  const p2 = battle.profile2?.username || '???';
  return (
    <Link
      href="/battle"
      className="group block w-[280px] shrink-0 snap-start rounded-[20px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl transition-all hover:border-[#ff4d00]/40 active:scale-[0.98]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${battle.is_active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-zinc-400'}`}>
          {battle.is_active ? '● Live' : 'Finished'}
        </span>
        {(battle.totalVotes || 0) > 0 && (
          <span className="font-mono text-[10px] text-zinc-500">▲ {formatCount(battle.totalVotes)} votes</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-bold text-white">@{p1}</span>
        <span className="shrink-0 rounded-full bg-[#ff4d00] px-2.5 py-1 text-[10px] font-black italic text-black">VS</span>
        <span className="min-w-0 flex-1 truncate text-right font-bold text-white">@{p2}</span>
      </div>
      {battle.trendingLabel && (
        <p className="mt-2 font-mono text-[10px] text-zinc-500">{battle.trendingLabel}</p>
      )}
      <span className="mt-3 flex min-h-[40px] items-center justify-center rounded-xl bg-[#ff4d00] text-xs font-black uppercase tracking-wider text-black transition-all group-hover:bg-[#ff6622]">
        {battle.is_active ? 'Vote Now' : 'View Battle'}
      </span>
    </Link>
  );
}

// ── Portrait Topic Card ──────────────────────────────────────
function TopicCard({ topic, index = 0 }) {
  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  return (
    <Link
      href={`/search?q=${encodeURIComponent(topic.name)}`}
      className="group relative block h-44 w-32 shrink-0 snap-start overflow-hidden rounded-[20px] border border-white/10 transition-all hover:border-[#ff4d00]/40 active:scale-[0.98]"
    >
      <div className={`absolute inset-0 bg-gradient-to-b ${gradient}`} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" aria-hidden="true" />
      <div className="relative flex h-full flex-col justify-between p-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#ff4d00]/40 bg-black/50 text-sm backdrop-blur-md" aria-hidden="true">
          🌎
        </span>
        <span>
          <span className="block truncate text-[13px] font-bold text-white">{topic.name}</span>
          <span className="mt-0.5 block font-mono text-[10px] text-zinc-400">
            {(topic.communityCount || 0) > 0 ? `${topic.communityCount} ${topic.communityCount === 1 ? 'community' : 'communities'}` : 'Explore'}
          </span>
        </span>
      </div>
    </Link>
  );
}

// ── Section Header ───────────────────────────────────────────
function SectionHeader({ emoji, title, count, href, hrefLabel }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <div className="flex items-center gap-2">
        <span className="text-base text-[#ff4d00]" aria-hidden="true">{emoji}</span>
        <h2 className="text-[15px] font-extrabold tracking-tight text-white">{title}</h2>
        {count > 0 && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link href={href} className="flex min-h-[36px] items-center gap-0.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-[#ff4d00]">
          {hrefLabel || 'See all'} <span aria-hidden="true">›</span>
        </Link>
      )}
    </div>
  );
}

// ── Carousel shell (snap swipe, no page overflow) ────────────
function Carousel({ label, children }) {
  return (
    <div
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:-mx-6 sm:px-6"
      role="region"
      aria-label={label}
    >
      {children}
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
        className="rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl transition-all focus-within:border-[#ff4d00]/60 focus-within:shadow-[0_0_24px_rgba(255,77,0,0.18)]"
      >
        <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500 pointer-events-none" />
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
          className="min-h-[52px] w-full bg-transparent py-3 pl-11 pr-11 text-sm text-white placeholder-zinc-500 focus:outline-none"
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
            className="absolute right-2 top-1/2 flex min-h-[40px] min-w-[40px] -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
      {open && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#141416]/95 shadow-2xl backdrop-blur-xl" role="listbox" aria-label="Search suggestions">
          {suggestions.slice(0, 6).map((s) => (
            <Link
              key={`${s.type}-${s.id}`}
              href={s.href}
              className="flex min-h-[44px] items-center gap-2.5 px-4 text-xs transition-colors hover:bg-white/5"
              role="option"
              aria-selected="false"
            >
              <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-zinc-600">{s.type}</span>
              <span className="truncate text-zinc-200">{s.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Skeleton rows matching card shapes ───────────────────────
function CarouselSkeleton() {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:px-6" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-[220px] shrink-0 animate-pulse overflow-hidden rounded-[20px] border border-white/5 bg-[#111]">
          <div className="h-32 bg-[#1a1a1a]" />
          <div className="space-y-2 p-3">
            <div className="h-3.5 w-3/4 rounded bg-[#1e1e1e]" />
            <div className="h-3 w-1/3 rounded bg-[#1a1a1a]" />
          </div>
        </div>
      ))}
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

  // Editorial mix for the Trending Now carousel (ranked order preserved).
  const trendingCards = useMemo(() => {
    const cards = [];
    const photoPosts = forYouItems.filter((i) => i.mediaUrl).slice(0, 3);
    for (const p of photoPosts) {
      cards.push({
        key: `tr-photo-${p.id}`,
        image: p.mediaUrl,
        pill: 'Photo',
        title: p.text || `Post by @${p.author?.username || 'Anonymous'}`,
        meta: `${timeAgo(p.createdAt)}${(p.upvotes || 0) > 0 ? ` · ▲ ${formatCount(p.upvotes)}` : ''}`,
        href: `/post/${p.id}`,
      });
    }
    for (const s of hotSeats.slice(0, 4)) {
      cards.push({
        key: `tr-seat-${s.id}`,
        image: null,
        pill: 'Hot Seat',
        title: s.title,
        meta: `${s.roast_count || 0} roasts · ${timeAgo(s.created_at)}`,
        href: `/hot-seat/${s.id}`,
      });
    }
    for (const r of roasts.slice(0, 4)) {
      cards.push({
        key: `tr-roast-${r.id}`,
        image: null,
        pill: 'Roast',
        title: r.roast_text,
        meta: `${timeAgo(r.created_at)}${(r.upvotes || 0) > 0 ? ` · ▲ ${formatCount(r.upvotes)}` : ''}`,
        href: r.source === 'hot_seat' && r.hot_seat_id ? `/hot-seat/${r.hot_seat_id}` : '/top',
      });
    }
    return cards.slice(0, 10);
  }, [forYouItems, hotSeats, roasts]);

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
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Brand header — compact; shell owns nav + create */}
        <header className="flex min-h-[44px] items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5" aria-label="BurnBoard home">
            <Flame className="h-5 w-5 fill-[#ff4d00] text-[#ff4d00]" />
            <span className="text-[15px] font-black tracking-wide text-white">
              BURNBOARD
            </span>
          </Link>
          <NotificationBell />
        </header>

        {/* Hero */}
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-[28px] font-black leading-none tracking-tight text-white">
            <span aria-hidden="true">🔥</span> Explore
          </h1>
          <p className="text-[13px] text-zinc-400">
            Discover what&apos;s happening on BurnBoard.
          </p>
        </div>

        {/* Search */}
        <ExploreSearch />

        {/* Category chips */}
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:-mx-6 sm:px-6" role="tablist" aria-label="Discovery categories">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(s.key)}
                className={`flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-xs font-bold transition-all active:scale-95 ${
                  active
                    ? 'border-[#ff4d00] bg-[#ff4d00] text-black shadow-[0_0_16px_rgba(255,77,0,0.35)]'
                    : 'border-white/10 bg-white/[0.05] text-zinc-300 backdrop-blur-xl hover:border-white/25 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-8" aria-live="polite" aria-label={t('loading')}>
            <CarouselSkeleton />
            <CarouselSkeleton />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-bold text-zinc-200">Explore isn&apos;t available right now.</p>
            <p className="text-xs text-zinc-500">Check your connection and try again.</p>
            <button
              onClick={() => setRetryTick((n) => n + 1)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {isEmpty && !isLoading && (
          <div className="space-y-4 rounded-3xl border-2 border-[#ff4d00]/25 bg-gradient-to-br from-[#1a0a00] via-[#111] to-[#0a0a0a] p-10 text-center shadow-[0_0_40px_rgba(255,77,0,0.08)]">
            <div className="text-5xl" aria-hidden="true">🧭</div>
            <h2 className="text-xl font-black uppercase tracking-wide text-white">
              DISCOVER SOMETHING NEW
            </h2>
            <p className="mx-auto max-w-sm text-xs text-zinc-400">
              Explore users, topics, communities, Battles and fresh posts.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setActiveSection('trending')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-6 text-sm font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
              >
                Explore Trending
              </button>
              <button
                onClick={() => setActiveSection('topics')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 text-sm font-bold uppercase tracking-wider text-zinc-200 transition-all hover:border-[#ff4d00]/50 active:scale-95"
              >
                Browse Topics
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8 lg:space-y-0">
            <div className="min-w-0 space-y-8">
              {/* Trending Now */}
              {showSection('trending') && trendingCards.length > 0 && (
                <section className="space-y-3" aria-label="Trending Now">
                  <SectionHeader emoji="🔥" title="Trending Now" href="/top" hrefLabel="See all" />
                  <Carousel label="Trending Now">
                    {trendingCards.map((c, i) => (
                      <EditorialCard key={c.key} image={c.image} pill={c.pill} title={c.title} meta={c.meta} href={c.href} gradientIndex={i} />
                    ))}
                  </Carousel>
                </section>
              )}

              {/* For You preview */}
              {activeSection === 'foryou' && forYouItems.length > 0 && (
                <section className="space-y-3" aria-label="For You">
                  <SectionHeader emoji="✨" title="For You" href="/home" hrefLabel="Open Feed" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {forYouItems.slice(0, 4).map((item) => (
                      <FeedPreviewCard key={`${item.type}-${item.id}`} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {/* Popular Topics */}
              {showSection('topics') && topics.length > 0 && (
                <section className="space-y-3" aria-label="Popular Topics">
                  <SectionHeader emoji="#" title="Popular Topics" href="/search" hrefLabel="See all" />
                  <Carousel label="Popular Topics">
                    {topics.slice(0, 9).map((topic, i) => (
                      <TopicCard key={topic.id} topic={topic} index={i} />
                    ))}
                  </Carousel>
                </section>
              )}

              {/* Rising Users */}
              {showSection('users') && risingUsers.length > 0 && (
                <section className="space-y-3" aria-label="Rising Users">
                  <SectionHeader emoji="👤" title="Rising Users" href="/search" hrefLabel="See all" />
                  <Carousel label="Rising Users">
                    {risingUsers.map((u) => (
                      <RisingUserCard key={u.id} user={u} />
                    ))}
                  </Carousel>
                </section>
              )}

              {/* Active Battles */}
              {showSection('battles') && (
                <section className="space-y-3" aria-label="Active Battles">
                  <SectionHeader emoji="⚔" title="Active Battles" href="/battles" hrefLabel="See all" />
                  {battles.length > 0 ? (
                    <Carousel label="Active Battles">
                      {battles.slice(0, 6).map((b) => (
                        <BattleCard key={b.id} battle={b} />
                      ))}
                    </Carousel>
                  ) : (
                    activeSection === 'battles' && (
                      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                        <p className="text-xs text-zinc-500">No live battles yet</p>
                      </div>
                    )
                  )}
                </section>
              )}

              {/* Challenges */}
              {showSection('challenges') && (
                <section className="space-y-3" aria-label="Challenges">
                  <SectionHeader emoji="🏆" title="Challenges" href="/challenges" hrefLabel="See all" />
                  {challenges.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {challenges.slice(0, 4).map(challenge => (
                        <ChallengeCard key={challenge.id} challenge={challenge} />
                      ))}
                    </div>
                  ) : (
                    activeSection === 'challenges' && (
                      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                        <p className="text-xs text-zinc-500">No active challenges right now</p>
                        <Link href="/challenges/new" className="mt-2 inline-flex min-h-[36px] items-center font-mono text-[11px] text-[#ff4d00] hover:text-white">
                          Start one →
                        </Link>
                      </div>
                    )
                  )}
                </section>
              )}

              {/* Communities */}
              {showSection('communities') && (
                <section className="space-y-3" aria-label="Communities">
                  <SectionHeader emoji="🏘" title="Active Communities" href="/c" hrefLabel="See all" />
                  {communities.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {communities.slice(0, 4).map(community => (
                        <CommunityCard key={community.id} community={community} />
                      ))}
                    </div>
                  ) : (
                    activeSection === 'communities' && (
                      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                        <p className="text-xs text-zinc-500">No communities yet</p>
                        <Link href="/c/new" className="mt-2 inline-flex min-h-[36px] items-center font-mono text-[11px] text-[#ff4d00] hover:text-white">
                          Create the first one →
                        </Link>
                      </div>
                    )
                  )}
                </section>
              )}

              {/* Fresh */}
              {showSection('fresh') && freshItems.length > 0 && (
                <section className="space-y-3" aria-label="Fresh">
                  <SectionHeader emoji="🆕" title="Fresh" />
                  <div className="space-y-3">
                    {freshItems.map((entry) => (
                      entry.kind === 'seat'
                        ? <HotSeatCard key={`fresh-seat-${entry.data.id}`} seat={entry.data} />
                        : <RoastItem key={`fresh-roast-${entry.data.id}`} roast={entry.data} />
                    ))}
                  </div>
                </section>
              )}

              {/* Trending full lists (trending tab depth) */}
              {activeSection === 'trending' && (
                <>
                  {hotSeats.length > 0 && (
                    <section className="space-y-3" aria-label="Trending Hot Seats">
                      <SectionHeader emoji="🪑" title="Hot Seats" count={hotSeats.length} />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {hotSeats.slice(0, 4).map(seat => (
                          <HotSeatCard key={seat.id} seat={seat} />
                        ))}
                      </div>
                    </section>
                  )}
                  {roasts.length > 0 && (
                    <section className="space-y-3" aria-label="Trending Roasts">
                      <SectionHeader emoji="😂" title="Roasts" count={roasts.length} />
                      <div className="space-y-3">
                        {roasts.slice(0, 5).map(roast => (
                          <RoastItem key={roast.id} roast={roast} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              {/* Hashtags full (hashtags tab depth) */}
              {activeSection === 'hashtags' && trendingTags.length > 0 && (
                <section className="space-y-3" aria-label="Trending Hashtags">
                  <SectionHeader emoji="#" title="Trending Hashtags" />
                  <div className="flex flex-wrap gap-2">
                    {trendingTags.map((h) => (
                      <Link
                        key={h.tag}
                        href={`/search?q=${encodeURIComponent(`#${h.tag}`)}`}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 font-mono text-xs text-[#ff4d00] transition-all hover:border-[#ff4d00]/50 active:scale-95"
                      >
                        #{h.tag}
                        <span className="text-zinc-500">{h.count}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Bottom CTA */}
              {hasAnything && (
                <div className="space-y-4 border-t border-white/10 pt-6 text-center">
                  <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
                    Ready to get roasted?
                  </p>
                  <Link
                    href="/create"
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-6 text-sm font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
                  >
                    🔥 DROP YOUR FIRST BURN
                  </Link>
                </div>
              )}
            </div>

            {/* Secondary discovery rail (desktop) */}
            <aside className="hidden min-w-0 space-y-6 lg:block" aria-label="More to explore">
              {trendingTags.length > 0 && (
                <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="text-xs font-extrabold tracking-tight text-white">Trending Hashtags</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {trendingTags.slice(0, 8).map((h) => (
                      <Link
                        key={h.tag}
                        href={`/search?q=${encodeURIComponent(`#${h.tag}`)}`}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11px] text-[#ff4d00] transition-all hover:border-[#ff4d00]/40"
                      >
                        #{h.tag}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {topics.length > 0 && (
                <section className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="text-xs font-extrabold tracking-tight text-white">Topics to explore</h3>
                  {topics.slice(0, 5).map((topic) => (
                    <Link
                      key={topic.id}
                      href={`/search?q=${encodeURIComponent(topic.name)}`}
                      className="flex items-center justify-between rounded-xl px-2 py-2 text-[13px] font-semibold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <span className="truncate">{topic.name}</span>
                      <span aria-hidden="true" className="text-zinc-600">›</span>
                    </Link>
                  ))}
                </section>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
