'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';
import { ProfileCardSkeleton } from '@/components/Skeleton';
import LiveStats from '@/components/LiveStats';
import {
  Trophy, Flame, Crown, Medal, ArrowUpRight, Award, Sparkles
} from 'lucide-react';

function getRankBadge(rank) {
  switch (rank) {
    case 1:
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-black flex items-center justify-center font-black shadow-[0_0_15px_rgba(234,179,8,0.5)]">
          <Crown className="w-4 h-4 fill-black" />
        </div>
      );
    case 2:
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-400 to-zinc-200 text-black flex items-center justify-center font-black shadow-[0_0_15px_rgba(228,228,231,0.3)]">
          <Medal className="w-4 h-4" />
        </div>
      );
    case 3:
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-700 to-amber-600 text-white flex items-center justify-center font-black shadow-[0_0_15px_rgba(180,83,9,0.3)]">
          <Medal className="w-4 h-4" />
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-[#1c1c1c] text-zinc-400 border border-[#2a2a2a] flex items-center justify-center font-mono font-bold text-xs">
          #{rank}
        </div>
      );
  }
}

function getRankBg(rank) {
  if (rank === 1) return 'bg-[#FFD700]/10 border-[#FFD700]/40 text-black';
  if (rank === 2) return 'bg-[#C0C0C0]/10 border-[#C0C0C0]/40';
  if (rank === 3) return 'bg-[#CD7F32]/10 border-[#CD7F32]/40';
  return 'bg-[#111] border-[#222]';
}

export default function TopPage() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTopProfiles = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('roast_count', { ascending: false })
        .limit(10);
      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error('[Top] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopProfiles();
  }, [fetchTopProfiles]);

  // Realtime: subscribe to profile UPDATEs for live reorder (best-effort).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    return subscribeRealtime(
      supabase,
      'top-board-realtime',
      (ch) =>
        ch
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => {
            fetchTopProfiles();
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => {
            fetchTopProfiles();
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, () => {
            fetchTopProfiles();
          })
    );
  }, [fetchTopProfiles]);

  // ── Loading Skeleton ───────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="text-center space-y-2 py-6 border-b border-[#222]">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Trophy className="w-8 h-8 text-[#ff4d00]" />
              <h1 className="text-2xl font-black uppercase tracking-wider font-mono">Leaderboard</h1>
            </div>
          </header>
          <div className="space-y-4">
            <ProfileCardSkeleton />
            <ProfileCardSkeleton />
            <ProfileCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // ── Not Configured ─────────────────────────────────────────
  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="text-center space-y-2 py-6 border-b border-[#222]">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Trophy className="w-8 h-8 text-[#ff4d00]" />
              <h1 className="text-2xl font-black uppercase tracking-wider font-mono">Leaderboard</h1>
            </div>
          </header>
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
            <div className="text-4xl">🏆</div>
            <h2 className="text-lg font-bold text-white uppercase">Leaderboard Unavailable</h2>
            <p className="text-xs text-zinc-400">Rankings can&apos;t be loaded right now. Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="text-center space-y-2 py-6 border-b border-[#222]">
          <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
            <Trophy className="w-8 h-8 text-[#ff4d00]" />
            <h1 className="text-2xl font-black uppercase tracking-wider font-mono">Leaderboard</h1>
          </div>
          <p className="text-xs text-zinc-400 font-mono">Top 10 most roasted targets. Updated live.</p>
          <div className="flex justify-center">
            <LiveStats />
          </div>
        </header>

        {/* Empty State */}
        {profiles.length === 0 && (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
            <Trophy className="w-10 h-10 text-zinc-600 mx-auto" />
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">Leaderboard is empty</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                No roasts yet. Be the first legend on BURNBOARD! 🔥
              </p>
            </div>
          </div>
        )}

        {/* Podium Cards for Top 3 */}
        {profiles.length >= 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Rank 2 */}
            <div className={`bg-[#111] border border-[#262626] hover:border-zinc-500 rounded-2xl p-4 flex flex-col items-center text-center transition-all duration-200 order-2 sm:order-1 hover:-translate-y-1 ${getRankBg(2)}`}>
              <div className="mb-2">{getRankBadge(2)}</div>
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 text-white font-black text-xl flex items-center justify-center my-1">
                {profiles[1].avatar_letter}
              </div>
              <h3 className="font-bold text-white text-base mt-2 truncate w-full">@{profiles[1].username}</h3>
              <span className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">{profiles[1].platform}</span>
              <div className="mt-3 pt-3 border-t border-[#222] w-full flex justify-between text-xs font-mono">
                <span className="text-zinc-500">Burns</span>
                <span className="text-white font-bold">{(profiles[1].roast_count || 0).toLocaleString()}</span>
              </div>
              <div className="w-full flex justify-between text-xs font-mono mt-1">
                <span className="text-zinc-500">Upvotes</span>
                <span className="text-[#C0C0C0] font-bold">▲ {(profiles[1].total_upvotes || 0).toLocaleString()}</span>
              </div>
            </div>

            {/* Rank 1 (Gold) */}
            <div className="bg-gradient-to-b from-[#1c140e] to-[#111] border border-[#FFD700]/50 hover:border-[#FFD700] rounded-2xl p-5 flex flex-col items-center text-center transition-all duration-200 order-1 sm:order-2 shadow-[0_0_30px_rgba(255,215,0,0.15)] hover:-translate-y-1">
              <div className="mb-2">{getRankBadge(1)}</div>
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#FFD700] to-amber-500 text-black font-black text-2xl flex items-center justify-center my-1 shadow-[0_0_20px_rgba(255,215,0,0.4)]">
                {profiles[0].avatar_letter}
              </div>
              <h3 className="font-extrabold text-white text-lg mt-2 truncate w-full">@{profiles[0].username}</h3>
              <span className="text-xs font-mono text-[#FFD700] uppercase font-bold mt-0.5">👑 Undisputed #1</span>
              <div className="mt-3 pt-3 border-t border-[#FFD700]/20 w-full flex justify-between text-xs font-mono">
                <span className="text-zinc-400">Burns</span>
                <span className="text-[#FFD700] font-black text-sm">{(profiles[0].roast_count || 0).toLocaleString()}</span>
              </div>
              <div className="w-full flex justify-between text-xs font-mono mt-1">
                <span className="text-zinc-400">Upvotes</span>
                <span className="text-[#FFD700] font-bold">▲ {(profiles[0].total_upvotes || 0).toLocaleString()}</span>
              </div>
            </div>

            {/* Rank 3 (Bronze) */}
            <div className={`bg-[#111] border border-[#262626] hover:border-amber-700 rounded-2xl p-4 flex flex-col items-center text-center transition-all duration-200 order-3 hover:-translate-y-1 ${getRankBg(3)}`}>
              <div className="mb-2">{getRankBadge(3)}</div>
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-black font-black text-xl flex items-center justify-center my-1">
                {profiles[2].avatar_letter}
              </div>
              <h3 className="font-bold text-white text-base mt-2 truncate w-full">@{profiles[2].username}</h3>
              <span className="text-[10px] font-mono text-zinc-400 uppercase mt-0.5">{profiles[2].platform}</span>
              <div className="mt-3 pt-3 border-t border-[#222] w-full flex justify-between text-xs font-mono">
                <span className="text-zinc-500">Burns</span>
                <span className="text-white font-bold">{(profiles[2].roast_count || 0).toLocaleString()}</span>
              </div>
              <div className="w-full flex justify-between text-xs font-mono mt-1">
                <span className="text-zinc-500">Upvotes</span>
                <span className="text-[#CD7F32] font-bold">▲ {(profiles[2].total_upvotes || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Full Rankings List */}
        {profiles.length > 0 && (
          <div className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[#222] flex items-center justify-between text-xs font-mono text-zinc-500 uppercase tracking-wider">
              <span>Rank & Profile</span>
              <div className="flex items-center gap-8">
                <span className="hidden sm:inline">Intensity</span>
                <span>Burns / Upvotes</span>
              </div>
            </div>

            <div className="divide-y divide-[#1a1a1a]">
              {profiles.map((profile, idx) => {
                const rank = idx + 1;
                const maxRoasts = profiles[0]?.roast_count || 1;
                const percentage = Math.round(((profile.roast_count || 0) / maxRoasts) * 100);

                const rankBorderColor =
                  rank === 1 ? 'border-l-4 border-l-[#FFD700]' :
                  rank === 2 ? 'border-l-4 border-l-[#C0C0C0]' :
                  rank === 3 ? 'border-l-4 border-l-[#CD7F32]' : '';

                return (
                  <div
                    key={profile.id}
                    className={`p-4 flex items-center justify-between hover:bg-[#161616] transition-colors cursor-pointer group ${rankBorderColor}`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="shrink-0">{getRankBadge(rank)}</div>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-black text-white shrink-0 border border-[#333] ${profile.avatar_color || 'bg-[#1c1c1c]'}`}>
                        {profile.avatar_letter}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white group-hover:text-[#ff4d00] transition-colors flex items-center gap-2 truncate">
                          <span>@{profile.username}</span>
                          <span className="text-[10px] bg-[#1a1a1a] text-zinc-400 px-2 py-0.5 rounded border border-[#262626] uppercase">
                            {profile.platform}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 truncate max-w-xs mt-0.5">{profile.bio}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0 pl-2">
                      <div className="hidden sm:block w-32 bg-[#1c1c1c] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-500 to-[#ff4d00] h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-white flex items-center justify-end gap-1">
                          <span>{(profile.roast_count || 0).toLocaleString()}</span>
                          <Flame className="w-3.5 h-3.5 text-[#ff4d00]" />
                        </div>
                        <div className="text-[10px] text-zinc-500">▲ {(profile.total_upvotes || 0).toLocaleString()}</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
