'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';
import { ProfileCardSkeleton, RoastItemSkeleton } from '@/components/Skeleton';
import LiveStats from '@/components/LiveStats';
import FriendChallenge from '@/components/FriendChallenge';
import NotificationBell from '@/components/NotificationBell';
import HeroBanner from '@/components/HeroBanner';
import ErrorBoundary from '@/components/ErrorBoundary';
import SmartRecommendations from '@/components/SmartRecommendations';
import { trackActivationEvent } from '@/lib/onboarding';
import { trackGrowthEvent } from '@/lib/experiments';
import { trackShare } from '@/lib/growth/share';
import { t } from '@/lib/lang';
import { canRoast, recordRoastSuccess } from '@/lib/rateLimit';
import {
  Flame, TrendingUp, Clock, Skull, ArrowBigUp, Share2,
  Flag, MessageSquare, ArrowUpRight, Sparkles, Trophy, ChevronDown, Loader2, Plus, Swords
} from 'lucide-react';

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

// ── SWR Fetcher ──────────────────────────────────────────────
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

const fetchRoasts = async () => {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('roasts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
};

// ── RoastItem ────────────────────────────────────────────────
function RoastItem({ roast, targetUsername, targetPlatform, onUpvote, onReact, onShare, onReport }) {
  const [upvoting, setUpvoting] = useState(false);
  const [lastReacted, setLastReacted] = useState(null);
  const [reported, setReported] = useState(false);

  const handleUpvote = async () => {
    setUpvoting(true);
    setTimeout(() => setUpvoting(false), 300);
    onUpvote(roast);
  };

  const handleReaction = (type) => {
    setLastReacted(type);
    setTimeout(() => setLastReacted(null), 500);
    onReact(roast, type);
  };

  const handleReport = () => {
    if (reported) return;
    setReported(true);
    onReport(roast);
  };

  return (
    <div className="glass glass-interactive bb-card group relative p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#ff4d00] font-black font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d00]" />
          {roast.anon_id || 'Anonymous Roast'}
          <span className="text-[10px] text-zinc-600 font-mono ml-2">• {timeAgo(roast.created_at)}</span>
        </span>
        <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onShare && onShare(roast)}
            className="flex items-center gap-1 px-2 py-1 bg-[#141414] hover:bg-[#1f1f1f] text-zinc-400 hover:text-white rounded-lg border border-[#262626] text-[11px] font-mono transition-colors"
          >
            <Share2 className="w-3 h-3 text-[#ff4d00]" />
            <span className="hidden sm:inline">Card</span>
          </button>
          <button
            onClick={handleReport}
            disabled={reported}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono transition-colors ${
              reported
                ? 'text-red-400 bg-red-950/30'
                : 'bg-[#141414] hover:bg-[#1f1f1f] text-zinc-500 hover:text-red-400 border border-[#262626]'
            }`}
          >
            <Flag className="w-3 h-3" />
            <span className="hidden sm:inline">{reported ? 'Reported' : 'Report'}</span>
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-100 leading-relaxed font-normal select-text mb-3">
        &ldquo;{roast.roast_text}&rdquo;
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#1a1a1a]">
        <button
          onClick={handleUpvote}
          aria-pressed={!!roast.userUpvoted}
          aria-label={`Upvote roast, ${roast.upvotes || 0} upvotes`}
          className={`fire-btn tactile flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-black ${
            roast.userUpvoted
              ? 'bg-[#ff4d00] text-black border-[#ff4d00] fire-glow'
              : 'bg-[#141414] text-zinc-400 border-[#262626] hover:text-white hover:border-[#3a3a3a]'
          } ${upvoting ? 'fire-pop' : ''}`}
        >
          <ArrowBigUp className={`w-4 h-4 ${roast.userUpvoted ? 'fill-black text-black' : 'text-zinc-400'}`} />
          <span>{formatCount(roast.upvotes || 0)}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleReaction('haha')}
            className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${
              lastReacted === 'haha' ? 'scale-125 border-yellow-500/50 bg-yellow-500/10' : ''
            }`}
          >
            <span className="text-sm">😂</span>
            {(roast.reaction_haha || 0) > 0 && (
              <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_haha)}</span>
            )}
          </button>
          <button
            onClick={() => handleReaction('brutal')}
            className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${
              lastReacted === 'brutal' ? 'scale-125 border-[#ff4d00]/50 bg-[#ff4d00]/10' : ''
            }`}
          >
            <span className="text-sm">💀</span>
            {(roast.reaction_brutal || 0) > 0 && (
              <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_brutal)}</span>
            )}
          </button>
          <button
            onClick={() => handleReaction('cry')}
            className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${
              lastReacted === 'cry' ? 'scale-125 border-blue-500/50 bg-blue-500/10' : ''
            }`}
          >
            <span className="text-sm">😭</span>
            {(roast.reaction_cry || 0) > 0 && (
              <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_cry)}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProfileCard ──────────────────────────────────────────────
function ProfileCard({ profile, roasts, onUpvote, onReact, onShare, onReport }) {
  const displayedRoasts = roasts.slice(0, 3);
  const remainingCount = roasts.length - displayedRoasts.length;

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
    <article
      id={`feed-card-${profile.id}`}
      className={`bg-[#111] rounded-2xl p-4 sm:p-5 shadow-2xl transition-all duration-200 relative ${
        profile.featured
          ? 'border-2 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.18)]'
          : 'border border-[#222] hover:border-[#2d2d2d]'
      }`}
    >
      {profile.featured && (
        <div className="absolute -top-3 right-5 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1">
          <Sparkles className="w-3 h-3 fill-black" />
          <span>Featured Target</span>
        </div>
      )}

      <div className="flex items-start gap-3.5 mb-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-black shrink-0 shadow-[0_0_20px_rgba(255,77,0,0.25)] ${profile.avatar_color || 'bg-[#ff4d00] text-black'}`}>
          {profile.avatar_letter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-bold text-white text-base truncate">@{profile.username}</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getPlatformBadge(profile.platform)}`}>
                {profile.tagline || profile.platform}
              </span>
            </div>
          </div>
          <p className="text-zinc-300 text-sm mt-1.5 leading-relaxed">{profile.bio}</p>
          <div className="flex items-center gap-4 mt-2.5 text-xs font-mono text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-[#ff4d00]" />
              <span className="text-zinc-300 font-bold">{formatCount(profile.roast_count || 0)}</span>
              <span>roasts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-300 font-bold">▲ {formatCount(profile.total_upvotes || 0)}</span>
              <span>upvotes</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 sm:pl-14 sm:border-l sm:border-[#222] sm:ml-6 mt-4">
        {displayedRoasts.map(roast => (
          <RoastItem
            key={roast.id}
            roast={roast}
            targetUsername={profile.username}
            targetPlatform={profile.platform}
            onUpvote={onUpvote}
            onReact={onReact}
            onShare={onShare}
            onReport={onReport}
          />
        ))}

        {remainingCount > 0 && (
          <div className="w-full py-2 text-center text-xs font-mono font-bold text-zinc-400 rounded-xl">
            +{remainingCount} more burns
          </div>
        )}

        {displayedRoasts.length === 0 && (
          <div className="p-4 bg-[#0a0a0a] rounded-xl border border-dashed border-[#222] text-center text-xs text-zinc-500">
            No roasts here yet — be the first to start the fire.
          </div>
        )}
      </div>
    </article>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function HomePage() {
  const [page, setPage] = useState(0);
  const [allProfiles, setAllProfiles] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState('fresh');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);

  // SWR for profiles (paginated)
  const { data: pageData, error: profileError, isLoading: profilesLoading } = useSWR(
    isSupabaseConfigured ? ['profiles', page] : null,
    () => fetchProfiles(page),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 60000, // Refresh every 60 seconds
      onSuccess: (data) => {
        if (page === 0) {
          setAllProfiles(data.profiles);
        } else {
          setAllProfiles(prev => [...prev, ...data.profiles]);
        }
        setHasMore(data.hasMore);
      },
    }
  );

  // SWR for roasts
  const { data: roasts = [], mutate: mutateRoasts } = useSWR(
    isSupabaseConfigured ? 'roasts' : null,
    fetchRoasts,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 60000,
    }
  );

  // Load more profiles
  const handleLoadMore = () => {
    if (!profilesLoading && hasMore) {
      setPage(prev => prev + 1);
    }
  };

  // Realtime: subscribe to INSERT + UPDATE on roasts & profiles.
  // Best-effort only (SWR polling above is the fallback) — must never throw
  // into React, otherwise the Next.js error boundary takes down the page.
  // Channel names are unique per mount (see lib/realtime) so StrictMode
  // double-mounts or multiple instances can never collide on one topic.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    return subscribeRealtime(
      supabase,
      'feed-realtime',
      (ch) =>
        ch
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roasts' }, () => {
            mutateRoasts();
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roasts' }, () => {
            mutateRoasts();
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => {
            // Refresh first page when new profile added
            setPage(0);
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => {
            mutateRoasts(); // refresh counts
          })
    );
  }, [mutateRoasts]);

  // Track landing view for activation analytics
  useEffect(() => {
    trackActivationEvent('landing_viewed');
    trackGrowthEvent('landing_viewed');
  }, []);

  // Show toast helper
  const showToast = useCallback((text, type = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Optimistic Upvote (rollback on failure) ──────────────
  const handleUpvote = async (roast) => {
    const prevProfiles = allProfiles;
    setAllProfiles(prev => prev.map(p =>
      p.id === roast.profile_id ? { ...p, total_upvotes: (p.total_upvotes || 0) + 1 } : p
    ));

    try {
      const { error } = await supabase.from('roasts').update({ upvotes: (roast.upvotes || 0) + 1 }).eq('id', roast.id);
      if (error) throw error;
      const { data: profile } = await supabase.from('profiles').select('total_upvotes').eq('id', roast.profile_id).single();
      if (profile) {
        await supabase.from('profiles').update({ total_upvotes: (profile.total_upvotes || 0) + 1 }).eq('id', roast.profile_id);
      }
    } catch (err) {
      console.error('[Upvote] Failed:', err);
      setAllProfiles(prevProfiles);
      showToast('Upvote failed — try again');
    }
  };

  // ── Optimistic Reaction ────────────────────────────────────
  const handleReact = async (roast, type) => {
    const field = type === 'haha' ? 'reaction_haha' : type === 'brutal' ? 'reaction_brutal' : 'reaction_cry';
    try {
      await supabase.from('roasts').update({ [field]: (roast[field] || 0) + 1 }).eq('id', roast.id);
    } catch (err) {
      console.error('[React] Failed:', err);
    }
  };

  // ── Report ─────────────────────────────────────────────────
  const handleReport = async (roast) => {
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roast_id: roast.id, reason: 'reported' }),
      });
      showToast('Reported — Admin will check');
    } catch (err) {
      console.error('[Report] Failed:', err);
    }
  };

  // ── Share ──────────────────────────────────────────────────
  const handleShare = (roast) => {
    const profile = allProfiles.find(p => p.id === roast.profile_id);
    if (navigator.share) {
      navigator.share({
        title: `🔥 ${profile?.username || 'Someone'} got roasted`,
        text: `"${roast.roast_text}" — via BURNBOARD`,
        url: window.location.href,
      });
      trackShare({ resourceType: 'roast', resourceId: roast.id, channel: 'native' });
    } else {
      navigator.clipboard?.writeText(`"${roast.roast_text}" — via BURNBOARD ${window.location.href}`);
      showToast('Copied to clipboard');
      trackShare({ resourceType: 'roast', resourceId: roast.id, channel: 'clipboard' });
    }
  };

  // ── Sorting ────────────────────────────────────────────────
  const getBrutalScore = (profileId) => {
    return roasts
      .filter(r => r.profile_id === profileId)
      .reduce((sum, r) => sum + (r.reaction_brutal || 0), 0);
  };

  const filteredProfiles = useMemo(() => {
    const filtered = allProfiles.filter(p => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.username.toLowerCase().includes(q) || p.bio?.toLowerCase().includes(q) || p.platform?.toLowerCase().includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      if (sortBy === 'trending') return (b.total_upvotes || 0) - (a.total_upvotes || 0);
      if (sortBy === 'brutal') return getBrutalScore(b.id) - getBrutalScore(a.id);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [allProfiles, roasts, sortBy, searchQuery]);

  // ── Toast ──────────────────────────────────────────────────
  const Toast = () => {
    if (!toast) return null;
    return (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#ff4d00] text-black px-4 py-2 rounded-xl text-xs font-mono font-bold shadow-lg animate-bounce">
        {toast.text}
      </div>
    );
  };

  // ── Loading State ──────────────────────────────────────────
  if (profilesLoading && allProfiles.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="text-center space-y-2 py-6 border-b border-[#222]">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Flame className="w-8 h-8 fill-[#ff4d00]" />
              <h1 className="text-2xl font-black uppercase tracking-wider font-mono">BURNBOARD</h1>
            </div>
            <p className="text-xs text-zinc-400 font-mono">No AI. Just Humans Roasting Humans.</p>
          </header>
          <div className="space-y-4">
            <ProfileCardSkeleton />
            <ProfileCardSkeleton />
            <ProfileCardSkeleton />
          </div>
          <div className="text-center py-4" role="status" aria-label="Loading feed">
            <p className="type-micro animate-pulse">Your feed is warming up.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────
  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="text-center space-y-2 py-6 border-b border-[#222]">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Flame className="w-8 h-8 fill-[#ff4d00]" />
              <h1 className="text-2xl font-black uppercase tracking-wider font-mono">BURNBOARD</h1>
            </div>
            <p className="text-xs text-zinc-400 font-mono">No AI. Just Humans Roasting Humans.</p>
          </header>
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
            <div className="text-4xl">🔥</div>
            <h2 className="text-lg font-bold text-white uppercase">Service Temporarily Unavailable</h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              We&apos;re having trouble connecting right now. Please check back soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <Toast />
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="text-center space-y-2 py-6 border-b border-[#222]">
          <div className="flex items-center justify-between">
            <div />
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Flame className="w-8 h-8 fill-[#ff4d00]" />
              <h1 className="text-2xl font-black uppercase tracking-wider font-mono">BURNBOARD</h1>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
          <p className="text-xs text-zinc-400 font-mono">No AI. Just Humans Roasting Humans.</p>
          <div className="flex justify-center">
            <ErrorBoundary title="Live Stats Unavailable">
              <LiveStats />
            </ErrorBoundary>
          </div>
          <div className="flex justify-center pt-2">
            <ErrorBoundary title="Challenge Unavailable">
              <FriendChallenge variant="button" displayName="Someone" />
            </ErrorBoundary>
          </div>

          {/* First-time visitor hero */}
          <ErrorBoundary>
            <HeroBanner />
          </ErrorBoundary>

          {/* Smart Recommendations */}
          <ErrorBoundary>
            <SmartRecommendations pathname="/" maxVisible={2} />
          </ErrorBoundary>
        </header>

        {/* Search + Sort Tabs */}
        <div className="bg-[#111] border border-[#222] rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people, posts, and topics..."
              className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-4 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00]"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#0a0a0a] p-1 rounded-xl border border-[#262626]">
            <button
              onClick={() => setSortBy('fresh')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                sortBy === 'fresh' ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Fresh
            </button>
            <button
              onClick={() => setSortBy('trending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                sortBy === 'trending' ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Trending
            </button>
            <button
              onClick={() => setSortBy('brutal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                sortBy === 'brutal' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Skull className="w-3.5 h-3.5" />
              Brutal
            </button>
          </div>
        </div>

        {/* Feed Cards */}
        <div className="space-y-6">
          {filteredProfiles.map((profile, idx) => {
            const profileRoasts = roasts.filter(r => r.profile_id === profile.id);
            return (
              <div key={profile.id} className="feed-enter content-swap" style={{ '--stagger': Math.min(idx, 7) }}>
              <ProfileCard
                profile={profile}
                roasts={profileRoasts}
                onUpvote={handleUpvote}
                onReact={handleReact}
                onShare={handleShare}
                onReport={handleReport}
              />
              </div>
            );
          })}

          {/* Load More */}
          {hasMore && filteredProfiles.length > 0 && !searchQuery && (
            <div className="text-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={profilesLoading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-[#ff4d00]/50 rounded-xl text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all disabled:opacity-50"
              >
                {profilesLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#ff4d00]" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Load more
                  </>
                )}
              </button>
            </div>
          )}

          {/* End of Feed */}
          {!hasMore && filteredProfiles.length > 0 && !searchQuery && (
            <div className="text-center pt-4">
              <p className="text-xs text-zinc-500 font-mono">🔥 You&apos;ve caught up — come back later for more.</p>
            </div>
          )}

          {/* Empty State */}
          {filteredProfiles.length === 0 && !profilesLoading && (
            <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
              <div className="text-4xl">🔥</div>
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  {searchQuery ? 'No matches found' : 'Your feed is warming up'}
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                  {searchQuery
                    ? `Nothing matching "${searchQuery}" yet. Try another search or start something new.`
                    : 'Follow a few people to personalize your feed, or start the first conversation.'}
                </p>
              </div>
              <div>
                <a
                  href={searchQuery ? '/hot-seat' : '/discover'}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-xs rounded-xl hover:bg-[#ff6622] transition-all uppercase tracking-wider"
                >
                  {searchQuery ? '🔥 Start the fire' : 'Discover people'}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
