'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Flame, TrendingUp, Clock, Skull, Swords, Loader2,
  Plus, Zap, Trophy, Sparkles, ArrowUpRight, MessageSquare,
  Search, ArrowBigUp, Compass
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { CommunityCard } from '@/components/communities';
import { ChallengeCard } from '@/components/challenges';
import TopicsStrip from '@/components/discover/TopicsStrip';

/**
 * /explore — Social Discovery Hub
 * 
 * A comprehensive discovery page that shows trending content,
 * active hot seats, popular roasts, and live battles.
 * This replaces and enhances the existing /discover page functionality.
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

// ── SWR Fetchers ──────────────────────────────────────────────
const fetchTrending = async (window) => {
  const params = new URLSearchParams({ type: 'all', window, limit: '20' });
  const res = await fetch(`/api/trending?${params}`);
  if (!res.ok) throw new Error('Failed to fetch trending');
  return res.json();
};

const fetchProfiles = async (page) => {
  if (!isSupabaseConfigured || !supabase) return { profiles: [], hasMore: false };
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { profiles: data || [], hasMore: (data || []).length === PAGE_SIZE };
};

// ── Tabs ───────────────────────────────────────────────────
const WINDOWS = [
  { key: 'now', label: 'Now', icon: Zap },
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'week', label: 'This Week', icon: TrendingUp },
  { key: 'alltime', label: 'All Time', icon: Trophy },
];

const SECTIONS = [
  { key: 'hotseats', label: 'Hot Seats', emoji: '🪑' },
  { key: 'roasts', label: 'Roasts', emoji: '😂' },
  { key: 'battles', label: 'Battles', emoji: '⚔️' },
  { key: 'challenges', label: 'Challenges', emoji: '🏆' },
  { key: 'communities', label: 'Communities', emoji: '🏘️' },
  { key: 'targets', label: 'Targets', emoji: '🎯' },
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

// ── Target Card ──────────────────────────────────────────────
function TargetCard({ profile }) {
  const getPlatformBadge = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'x': case 'x / twitter': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'linkedin': return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      case 'github': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'instagram': return 'bg-pink-500/15 text-pink-400 border-pink-500/30';
      default: return 'bg-[#ff4d00]/15 text-[#ff4d00] border-[#ff4d00]/30';
    }
  };

  return (
    <Link href={`/#feed-card-${profile.id}`}>
      <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-all duration-200 group cursor-pointer">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${profile.avatar_color || 'bg-[#ff4d00] text-black'}`}>
            {profile.avatar_letter}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-bold text-white truncate group-hover:text-[#ff4d00] transition-colors">
                @{profile.username}
              </p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${getPlatformBadge(profile.platform)}`}>
                {profile.platform}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">{profile.bio}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1a1a1a] text-[11px] font-mono text-zinc-500">
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-[#ff4d00]" />
            {profile.roast_count || 0} roasts
          </span>
          <span>▲ {formatCount(profile.total_upvotes || 0)}</span>
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function ExplorePage() {
  const [activeWindow, setActiveWindow] = useState('now');
  const [activeSection, setActiveSection] = useState('hotseats');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, error, isLoading } = useSWR(
    ['explore-trending', activeWindow],
    () => fetchTrending(activeWindow),
    {
      revalidateOnFocus: false,
      refreshInterval: 30000,
    }
  );

  const { data: profileData, isLoading: profilesLoading } = useSWR(
    isSupabaseConfigured ? ['explore-profiles', 0] : null,
    () => fetchProfiles(0),
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  // Real communities for discovery (real data only — no fake trending)
  const fetchCommunities = async () => {
    const res = await fetch('/api/communities?sort=members&limit=6');
    if (!res.ok) throw new Error('Failed to fetch communities');
    return res.json();
  };

  const { data: communityData } = useSWR(
    'explore-communities',
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
    'explore-challenges',
    fetchChallenges,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  const hotSeats = data?.hotSeats || [];
  const roasts = data?.roasts || [];
  const battles = data?.battles || [];
  const profiles = profileData?.profiles || [];
  const communities = communityData?.communities || [];
  const challenges = challengeData?.challenges || [];

  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles;
    const q = searchQuery.toLowerCase();
    return profiles.filter(p =>
      p.username?.toLowerCase().includes(q) ||
      p.bio?.toLowerCase().includes(q) ||
      p.platform?.toLowerCase().includes(q)
    );
  }, [profiles, searchQuery]);

  const isEmpty = !isLoading && hotSeats.length === 0 && roasts.length === 0 && battles.length === 0 && profiles.length === 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="space-y-4 py-4 border-b border-[#222]">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
              <Flame className="w-4 h-4 text-[#ff4d00] fill-[#ff4d00]" />
              <span>BURNBOARD</span>
            </Link>
            <Link
              href="/hot-seat"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold text-[11px] rounded-xl transition-all shadow-[0_0_15px_rgba(255,77,0,0.3)]"
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
              Discover what&apos;s burning on BurnBoard right now
            </p>
          </div>
        </header>

        {/* Search — quick local filter; full search lives on /search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search targets by handle, bio or platform..."
            aria-label="Filter targets on this page"
            className="w-full bg-[#111] border border-[#222] rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-colors min-h-[44px]"
          />
        </div>
        <div className="flex items-center justify-between -mt-3">
          <span className="text-[10px] font-mono text-zinc-600">Filtering loaded targets</span>
          <Link href="/search" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors min-h-[36px] inline-flex items-center">
            Full search — people, roasts, #tags →
          </Link>
        </div>

        <TopicsStrip />

        {/* Section Tabs */}
        <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap transition-all ${
                activeSection === s.key
                  ? 'bg-[#ff4d00] text-black'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              <span>{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Time Window Tabs */}
        <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto">
          {WINDOWS.map(w => {
            const Icon = w.icon;
            return (
              <button
                key={w.key}
                onClick={() => setActiveWindow(w.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap transition-all ${
                  activeWindow === w.key
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

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
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
          <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-6 text-center">
            <p className="text-sm text-red-400 font-mono">Failed to load content</p>
            <p className="text-xs text-zinc-500 mt-1">Please try again later</p>
          </div>
        )}

        {/* Empty State */}
        {isEmpty && !isLoading && (
          <div className="bg-gradient-to-br from-[#1a0a00] via-[#111] to-[#0a0a0a] border-2 border-[#ff4d00]/30 rounded-3xl p-10 text-center space-y-4 shadow-[0_0_40px_rgba(255,77,0,0.1)]">
            <div className="text-5xl">🔥</div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">
              THE INTERNET IS QUIET... FOR NOW.
            </h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              No content yet. Be the legend who starts the first fire on BurnBoard.
            </p>
            <Link
              href="/hot-seat"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_30px_rgba(255,77,0,0.4)] uppercase tracking-wider"
            >
              🔥 START THE FIRST FIRE
            </Link>
          </div>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <div className="space-y-8">
            {/* Hot Seats Section */}
            {(activeSection === 'hotseats' || activeSection === 'targets') && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🪑</span>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Trending Hot Seats</h2>
                  {hotSeats.length > 0 && (
                    <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
                      {hotSeats.length}
                    </span>
                  )}
                </div>
                {hotSeats.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {hotSeats.map(seat => (
                      <HotSeatCard key={seat.id} seat={seat} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                    <p className="text-xs text-zinc-500">No trending hot seats yet</p>
                  </div>
                )}
              </section>
            )}

            {/* Roasts Section */}
            {(activeSection === 'roasts' || activeSection === 'targets') && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">😂</span>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Hottest Roasts</h2>
                  {roasts.length > 0 && (
                    <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
                      {roasts.length}
                    </span>
                  )}
                </div>
                {roasts.length > 0 ? (
                  <div className="space-y-3">
                    {roasts.map(roast => (
                      <RoastItem key={roast.id} roast={roast} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                    <p className="text-xs text-zinc-500">No trending roasts yet</p>
                  </div>
                )}
              </section>
            )}

            {/* Battles Section */}
            {(activeSection === 'battles' || activeSection === 'targets') && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚔️</span>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Live Battles</h2>
                  </div>
                  <Link href="/battle" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors flex items-center gap-1">
                    Enter Arena <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
                {battles.length > 0 ? (
                  <div className="space-y-3">
                    {battles.map(battle => (
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
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                    <p className="text-xs text-zinc-500">No live battles yet</p>
                  </div>
                )}
              </section>
            )}

            {/* Challenges Section — real challenges only */}
            {activeSection === 'challenges' && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏆</span>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Challenges to join</h2>
                    {challenges.length > 0 && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
                        {challenges.length}
                      </span>
                    )}
                  </div>
                  <Link href="/challenges" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors flex items-center gap-1">
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
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                    <p className="text-xs text-zinc-500">No active challenges right now</p>
                    <Link href="/challenges/new" className="inline-block mt-2 text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors">
                      Start one →
                    </Link>
                  </div>
                )}
              </section>
            )}

            {/* Communities Section — real communities only */}
            {activeSection === 'communities' && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏘️</span>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">Communities to Discover</h2>
                    {communities.length > 0 && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
                        {communities.length}
                      </span>
                    )}
                  </div>
                  <Link href="/c" className="text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors flex items-center gap-1">
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
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                    <p className="text-xs text-zinc-500">No communities yet</p>
                    <Link href="/c/new" className="inline-block mt-2 text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors">
                      Create the first one →
                    </Link>
                  </div>
                )}
              </section>
            )}

            {/* Targets Section */}
            {(activeSection === 'targets') && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">All Targets</h2>
                  {filteredProfiles.length > 0 && (
                    <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
                      {filteredProfiles.length}
                    </span>
                  )}
                </div>
                {filteredProfiles.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredProfiles.map(profile => (
                      <TargetCard key={profile.id} profile={profile} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center">
                    <p className="text-xs text-zinc-500">
                      {searchQuery ? `No targets matching "${searchQuery}"` : 'No targets yet'}
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* Bottom CTA */}
        {!isLoading && !isEmpty && (
          <div className="text-center pt-6 pb-8 border-t border-[#222] space-y-4">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
              Ready to get roasted?
            </p>
            <Link
              href="/hot-seat"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_25px_rgba(255,77,0,0.3)] uppercase tracking-wider"
            >
              🔥 PUT YOURSELF ON THE HOT SEAT
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}


