'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';
import LiveStats from '@/components/LiveStats';
import { Flame, TrendingUp, Clock, Skull, ArrowBigUp, Share2, Sparkles, Trophy } from 'lucide-react';

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

function RoastItem({ roast, onUpvote, onReact }) {
  const [upvoting, setUpvoting] = useState(false);
  const [lastReacted, setLastReacted] = useState(null);

  const handleUpvote = () => {
    setUpvoting(true);
    setTimeout(() => setUpvoting(false), 300);
    onUpvote(roast);
  };

  const handleReaction = (type) => {
    setLastReacted(type);
    setTimeout(() => setLastReacted(null), 500);
    onReact(roast, type);
  };

  return (
    <div className="bg-[#0a0a0a] border border-[#222] hover:border-[#333] p-4 rounded-2xl transition-all duration-200 group relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#ff4d00] font-black font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d00]" />
          {roast.anon_id || 'Anonymous Roast'}
          <span className="text-[10px] text-zinc-600 font-mono ml-2">• {timeAgo(roast.created_at)}</span>
        </span>
      </div>
      <p className="text-sm text-zinc-100 leading-relaxed font-normal select-text mb-3">
        &ldquo;{roast.roast_text}&rdquo;
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#1a1a1a]">
        <button
          onClick={handleUpvote}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-black transition-all duration-150 active:scale-90 ${
            roast.userUpvoted
              ? 'bg-[#ff4d00] text-black border-[#ff4d00] shadow-[0_0_12px_rgba(255,77,0,0.4)]'
              : 'bg-[#141414] text-zinc-400 border-[#262626] hover:text-white hover:border-[#3a3a3a]'
          } ${upvoting ? 'scale-110 -translate-y-0.5' : ''}`}
        >
          <ArrowBigUp className={`w-4 h-4 ${roast.userUpvoted ? 'fill-black text-black' : 'text-zinc-400'}`} />
          <span>{formatCount(roast.upvotes || 0)}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <button onClick={() => handleReaction('haha')} className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${lastReacted === 'haha' ? 'scale-125 border-yellow-500/50 bg-yellow-500/10' : ''}`}>
            <span className="text-sm">😂</span>
            {(roast.reaction_haha || 0) > 0 && <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_haha)}</span>}
          </button>
          <button onClick={() => handleReaction('brutal')} className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${lastReacted === 'brutal' ? 'scale-125 border-[#ff4d00]/50 bg-[#ff4d00]/10' : ''}`}>
            <span className="text-sm">💀</span>
            {(roast.reaction_brutal || 0) > 0 && <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_brutal)}</span>}
          </button>
          <button onClick={() => handleReaction('cry')} className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${lastReacted === 'cry' ? 'scale-125 border-blue-500/50 bg-blue-500/10' : ''}`}>
            <span className="text-sm">😭</span>
            {(roast.reaction_cry || 0) > 0 && <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_cry)}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ profile, roasts, onUpvote, onReact }) {
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
    <article className={`bg-[#111] rounded-2xl p-4 sm:p-5 shadow-2xl transition-all duration-200 relative ${
      profile.featured ? 'border-2 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.18)]' : 'border border-[#222] hover:border-[#2d2d2d]'
    }`}>
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
          <RoastItem key={roast.id} roast={roast} onUpvote={onUpvote} onReact={onReact} />
        ))}
        {remainingCount > 0 && (
          <div className="w-full py-2 text-center text-xs font-mono font-bold text-zinc-400 rounded-xl">
            +{remainingCount} more burns
          </div>
        )}
        {displayedRoasts.length === 0 && (
          <div className="p-4 bg-[#0a0a0a] rounded-xl border border-dashed border-[#222] text-center text-xs text-zinc-500">
            No burns yet! Be the first human to roast @{profile.username}.
          </div>
        )}
      </div>
    </article>
  );
}

export default function PlatformFeed({ initialProfiles, platformKey, platformName }) {
  const [profiles, setProfiles] = useState(initialProfiles || []);
  const [roasts, setRoasts] = useState([]);
  const [sortBy, setSortBy] = useState('fresh');
  const [loading, setLoading] = useState(true);

  // Fetch roasts for platform profiles
  useEffect(() => {
    const fetchRoasts = async () => {
      if (!isSupabaseConfigured || !supabase || profiles.length === 0) {
        setLoading(false);
        return;
      }
      try {
        const profileIds = profiles.map(p => p.id);
        if (profileIds.length === 0) { setLoading(false); return; }
        const { data } = await supabase
          .from('roasts')
          .select('*')
          .in('profile_id', profileIds)
          .order('created_at', { ascending: false });
        setRoasts(data || []);
      } catch (err) {
        console.error('[PlatformFeed] Roast fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRoasts();
  }, [profiles]);

  // Realtime subscription (best-effort). `profiles` is read via ref so that
  // every fetched profile list does NOT recreate the channel — recreating the
  // same topic after subscribe() throws and used to crash the page.
  const profilesRef = useRef(profiles);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    return subscribeRealtime(
      supabase,
      `platform-${platformKey}-realtime`,
      (ch) =>
        ch
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => {
            // Re-fetch platform profiles
            supabase.from('profiles').select('*, roasts(*)').eq('platform', platformName).order('created_at', { ascending: false })
              .then(({ data }) => { if (data) setProfiles(data); });
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roasts' }, (payload) => {
            if (profilesRef.current.some(p => p.id === payload.new?.profile_id)) {
              setRoasts(prev => [payload.new, ...prev]);
            }
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roasts' }, (payload) => {
            setRoasts(prev => prev.map(r => r.id === payload.new?.id ? payload.new : r));
          })
    );
  }, [platformKey, platformName]);

  // Optimistic upvote
  const handleUpvote = async (roast) => {
    setRoasts(prev => prev.map(r => r.id === roast.id ? { ...r, upvotes: (r.upvotes || 0) + 1, userUpvoted: true } : r));
    try {
      await supabase.from('roasts').update({ upvotes: (roast.upvotes || 0) + 1 }).eq('id', roast.id);
    } catch (err) { console.error('[Upvote] Failed:', err); }
  };

  // Optimistic reaction
  const handleReact = async (roast, type) => {
    const field = type === 'haha' ? 'reaction_haha' : type === 'brutal' ? 'reaction_brutal' : 'reaction_cry';
    setRoasts(prev => prev.map(r => r.id === roast.id ? { ...r, [field]: (r[field] || 0) + 1 } : r));
    try {
      await supabase.from('roasts').update({ [field]: (roast[field] || 0) + 1 }).eq('id', roast.id);
    } catch (err) { console.error('[React] Failed:', err); }
  };

  // Sorting
  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      if (sortBy === 'trending') return (b.total_upvotes || 0) - (a.total_upvotes || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [profiles, sortBy]);

  return (
    <div className="space-y-6">
      {/* Sort Tabs */}
      <div className="flex items-center gap-1 bg-[#0a0a0a] p-1 rounded-xl border border-[#262626] w-fit mx-auto">
        <button onClick={() => setSortBy('fresh')} className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${sortBy === 'fresh' ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white'}`}>
          <Clock className="w-3.5 h-3.5" /> Fresh
        </button>
        <button onClick={() => setSortBy('trending')} className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${sortBy === 'trending' ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white'}`}>
          <TrendingUp className="w-3.5 h-3.5" /> Trending
        </button>
      </div>

      {/* Profile Cards */}
      <div className="space-y-6">
        {sortedProfiles.map(profile => {
          const profileRoasts = roasts.filter(r => r.profile_id === profile.id);
          return (
            <ProfileCard
              key={profile.id}
              profile={profile}
              roasts={profileRoasts}
              onUpvote={handleUpvote}
              onReact={handleReact}
            />
          );
        })}

        {/* Empty State */}
        {sortedProfiles.length === 0 && (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
            <div className="text-4xl">🔥</div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                No {platformName} roasts yet
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                Be the first to roast a {platformName} user and rank on Google.
              </p>
            </div>
            <a
              href={`/?submit=true&platform=${platformKey}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-mono font-black text-xs rounded-xl transition-all"
            >
              Roast a {platformName} user →
            </a>
          </div>
        )}
      </div>

      <div className="flex justify-center pt-4">
        <LiveStats />
      </div>
    </div>
  );
}
