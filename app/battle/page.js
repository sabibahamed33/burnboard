'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Swords, Flame, RefreshCw, Loader2, Share2, Check
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';
import { getOrCreateAnonId } from '@/src/lib/presence';
import LiveStats from '@/components/LiveStats';
import { track } from '@/lib/analytics';

/**
 * /battle — Roast Arena (Master Prompt 9 hardening)
 *
 * Matchups are created server-side; votes are recorded in real vote rows via
 * the cast_battle_vote RPC and totals are derived from those rows. The client
 * never owns counts. Vote policy: one vote per person per matchup, and you can
 * switch your vote while the matchup is open.
 */

function fmt(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function BattlePage() {
  const searchParams = useSearchParams();
  const battleParam = searchParams.get('battle');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [emptyReason, setEmptyReason] = useState('');
  const [fighter1, setFighter1] = useState(null);
  const [fighter2, setFighter2] = useState(null);
  const [roasts1, setRoasts1] = useState([]);
  const [roasts2, setRoasts2] = useState([]);
  const [battleId, setBattleId] = useState(null);
  const [votes1, setVotes1] = useState(0);
  const [votes2, setVotes2] = useState(0);
  const [viewerVote, setViewerVote] = useState(null);
  const [voting, setVoting] = useState(null);
  const [copied, setCopied] = useState(false);

  const getViewerKey = () => {
    if (typeof window === 'undefined') return '';
    return getOrCreateAnonId();
  };

  const fetchMatchup = useCallback(async (battleIdToLoad) => {
    setLoading(true);
    setError('');
    setEmptyReason('');
    try {
      const participantId = encodeURIComponent(getViewerKey());
      const url = battleIdToLoad
        ? `/api/battle/${battleIdToLoad}?participant_id=${participantId}`
        : `/api/battle/random?participant_id=${participantId}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to load battle');
        setLoading(false);
        return;
      }

      if (data.empty) {
        setEmptyReason(data.reason || 'not-enough-fighters');
        setLoading(false);
        return;
      }

      setFighter1(data.profile1);
      setFighter2(data.profile2);
      setRoasts1(data.roasts1 || []);
      setRoasts2(data.roasts2 || []);
      setBattleId(data.battle.id);
      setVotes1(data.votes1 || 0);
      setVotes2(data.votes2 || 0);
      setViewerVote(data.viewerVote || null);
      setVoting(null);

      // Make the current matchup shareable without leaving the arena
      if (typeof window !== 'undefined' && !battleIdToLoad) {
        window.history.replaceState(null, '', `/battle?battle=${data.battle.id}`);
      }
      setLoading(false);
    } catch (err) {
      console.error('[Battle] Load error:', err);
      setError('Failed to load battle');
      setLoading(false);
    }
  }, []);

  // Initial load: explicit matchup (?battle=) or a fresh random one
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    fetchMatchup(battleParam || null);
    track('battle_opened', { viaLink: !!battleParam });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime: live totals from the canonical battles row (best-effort) ─────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !battleId) return;

    return subscribeRealtime(
      supabase,
      `battle-${battleId}`,
      (ch) =>
        ch.on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${battleId}` },
          (payload) => {
            const next = payload.new;
            if (typeof next.votes1 === 'number') setVotes1(next.votes1);
            if (typeof next.votes2 === 'number') setVotes2(next.votes2);
          }
        )
    );
  }, [battleId]);

  // ── Vote (server-controlled; switching allowed while open) ──
  const handleVote = async (candidate) => {
    if (!battleId || voting !== null) return;
    setVoting(candidate);
    try {
      const res = await fetch(`/api/battle/${battleId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selection: candidate,
          participant_id: getViewerKey(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[Battle] Vote error:', data.error);
        return;
      }
      setVotes1(data.votes1 || 0);
      setVotes2(data.votes2 || 0);
      setViewerVote(candidate);
      track('battle_vote_added', { battle_id: battleId, action: data.action });
    } catch (err) {
      console.error('[Battle] Vote failed:', err);
    } finally {
      setVoting(null);
    }
  };

  // ── Next matchup ───────────────────────────────────────────
  const handleNext = () => {
    setBattleId(null);
    setFighter1(null);
    setFighter2(null);
    setRoasts1([]);
    setRoasts2([]);
    setViewerVote(null);
    fetchMatchup(null);
  };

  // ── Share current matchup link ─────────────────────────────
  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  const totalVotes = votes1 + votes2;
  const pct1 = totalVotes > 0 ? Math.round((votes1 / totalVotes) * 100) : 50;
  const pct2 = 100 - pct1;
  // Live leader from authoritative server counts (ties show no leader).
  const leader = totalVotes > 0 ? (votes1 > votes2 ? 1 : votes2 > votes1 ? 2 : 0) : 0;

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="text-center space-y-2 py-6 border-b border-[#222]">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Swords className="w-8 h-8" aria-hidden="true" />
              <h1 className="text-2xl font-black uppercase tracking-wider font-mono">Battle Arena</h1>
            </div>
          </header>
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#ff4d00] animate-spin" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error / Empty ──────────────────────────────────────────
  if (error || emptyReason) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="text-center space-y-2 py-6 border-b border-[#222]">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Swords className="w-8 h-8" aria-hidden="true" />
              <h1 className="text-2xl font-black uppercase tracking-wider font-mono">Battle Arena</h1>
            </div>
          </header>
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
            <div className="text-5xl" aria-hidden="true">{error ? '💥' : '⚔️'}</div>
            <h2 className="text-lg font-bold text-white uppercase">
              {error ? 'Battle unavailable' : 'Need more fighters'}
            </h2>
            <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto font-mono">
              {error || 'Battles require at least 2 profiles with real burns. Invite friends to get roasted!'}
            </p>
            <Link
              href="/hot-seat"
              className="inline-block px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl hover:bg-[#ff6622] transition-all"
            >
              Create a Hot Seat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!fighter1 || !fighter2 || !battleId) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-red-950/40 via-[#111] to-blue-950/40 border border-[#333] rounded-2xl p-5 sm:p-6 text-center relative overflow-hidden shadow-2xl">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Swords className="w-6 h-6 text-[#ff4d00] animate-bounce" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tight">
              Roast Arena: Head-to-Head Battle
            </h1>
            <Swords className="w-6 h-6 text-blue-400 animate-bounce" aria-hidden="true" />
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto">
            Who got destroyed harder by real humans? Vote to decide.
          </p>
          <div className="flex justify-center mt-3">
            <LiveStats />
          </div>

          {/* Global vote bar */}
          <div className="mt-5 max-w-xl mx-auto">
            <div className="flex justify-between text-xs font-mono font-bold mb-1.5 px-1">
              <span className="text-[#ff4d00]">@{fighter1.username} ({pct1}%)</span>
              <span className="text-zinc-500">{totalVotes.toLocaleString()} TOTAL VOTES</span>
              <span className="text-blue-400">@{fighter2.username} ({pct2}%)</span>
            </div>
            <div
              className="h-3 bg-[#1c1c1c] rounded-full overflow-hidden flex border border-[#333] p-0.5"
              role="img"
              aria-label={`${fighter1.username} ${pct1}%, ${fighter2.username} ${pct2}%`}
            >
              <div
                className="bg-gradient-to-r from-orange-600 to-[#ff4d00] h-full rounded-l-full transition-all duration-500"
                style={{ width: `${pct1}%` }}
              />
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-r-full transition-all duration-500"
                style={{ width: `${pct2}%` }}
              />
            </div>
            <p className="text-[10px] font-mono text-zinc-600 mt-2">
              One vote per person · Tap again to switch your vote · Votes are real and server-counted
            </p>
          </div>

          {/* Share matchup */}
          <div className="flex justify-center gap-3 mt-3">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161616] hover:bg-[#222] border border-[#333] hover:border-[#ff4d00]/40 text-[11px] font-mono text-zinc-300 transition-all"
              aria-label="Copy link to this matchup"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? 'Link copied!' : 'Share matchup'}
            </button>
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161616] hover:bg-[#222] border border-[#333] hover:border-[#ff4d00]/40 text-[11px] font-mono text-zinc-300 transition-all"
              aria-label="Load the next random matchup"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#ff4d00]" />
              Next matchup
            </button>
          </div>
        </div>

        {/* Arena Fighters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
          {/* VS Center Indicator */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-[#0a0a0a] border-2 border-[#ff4d00] flex items-center justify-center shadow-[0_0_25px_rgba(255,77,0,0.6)] animate-pulse">
              <span className="font-black text-white italic text-lg tracking-tighter">VS</span>
            </div>
          </div>

          {/* Fighter 1 (Red) */}
          <div className={`bg-[#111] border rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between transition-all duration-200 ${
            viewerVote === 1
              ? 'border-[#ff4d00] shadow-[0_0_30px_rgba(255,77,0,0.3)] ring-1 ring-[#ff4d00]'
              : 'border-[#222] hover:border-[#333]'
          }`}>
            <div>
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black shrink-0 ${fighter1.avatar_color || 'bg-[#ff4d00] text-black'}`}>
                  {fighter1.avatar_letter}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-white text-lg truncate">@{fighter1.username}</h3>
                    {leader === 1 && (
                      <span className="text-[10px] font-black bg-[#ff4d00] text-black px-2 py-0.5 rounded-full uppercase shrink-0">
                        Leading
                      </span>
                    )}
                    <span className="text-[10px] font-bold bg-[#ff4d00]/20 text-[#ff4d00] border border-[#ff4d00]/40 px-2 py-0.5 rounded-full uppercase">
                      {fighter1.platform}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1 leading-relaxed line-clamp-3">{fighter1.bio}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs font-mono text-zinc-400">
                    <span>🔥 {fighter1.roast_count || 0} burns</span>
                    <span>▲ {fmt(fighter1.total_upvotes || 0)} upvotes</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <div className="text-[10px] font-mono uppercase text-zinc-500 font-bold">Featured Burns:</div>
                {roasts1.length > 0 ? roasts1.map(r => (
                  <div key={r.id} className="bg-[#0a0a0a] border border-[#222] p-3 rounded-xl text-xs text-zinc-300">
                    <div className="text-[10px] text-[#ff4d00] font-mono font-bold mb-1">{r.anon_id}</div>
                    <p>&ldquo;{r.roast_text}&rdquo;</p>
                  </div>
                )) : (
                  <p className="text-xs text-zinc-500 italic">No roasts yet. Be the first to burn this target!</p>
                )}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[#222]">
              <button
                onClick={() => handleVote(1)}
                disabled={voting !== null}
                aria-pressed={viewerVote === 1}
                className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                  viewerVote === 1
                    ? 'bg-[#ff4d00] text-black shadow-[0_0_20px_rgba(255,77,0,0.5)]'
                    : 'bg-[#1a1a1a] hover:bg-[#ff4d00] text-white hover:text-black border border-[#333]'
                }`}
              >
                {voting === 1 ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : viewerVote === 1 ? (
                  <><Check className="w-4 h-4" /> Your vote — @{fighter1.username}</>
                ) : viewerVote === 2 ? (
                  <><RefreshCw className="w-4 h-4" /> Switch to @{fighter1.username}</>
                ) : (
                  <><Flame className="w-4 h-4" /> Vote @{fighter1.username}</>
                )}
              </button>
            </div>
          </div>

          {/* Fighter 2 (Blue) */}
          <div className={`bg-[#111] border rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between transition-all duration-200 ${
            viewerVote === 2
              ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] ring-1 ring-blue-500'
              : 'border-[#222] hover:border-[#333]'
          }`}>
            <div>
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black shrink-0 ${fighter2.avatar_color || 'bg-blue-600 text-white'}`}>
                  {fighter2.avatar_letter}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-white text-lg truncate">@{fighter2.username}</h3>
                    {leader === 2 && (
                      <span className="text-[10px] font-black bg-blue-500 text-black px-2 py-0.5 rounded-full uppercase shrink-0">
                        Leading
                      </span>
                    )}
                    <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded-full uppercase">
                      {fighter2.platform}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1 leading-relaxed line-clamp-3">{fighter2.bio}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs font-mono text-zinc-400">
                    <span>🔥 {fighter2.roast_count || 0} burns</span>
                    <span>▲ {fmt(fighter2.total_upvotes || 0)} upvotes</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <div className="text-[10px] font-mono uppercase text-zinc-500 font-bold">Featured Burns:</div>
                {roasts2.length > 0 ? roasts2.map(r => (
                  <div key={r.id} className="bg-[#0a0a0a] border border-[#222] p-3 rounded-xl text-xs text-zinc-300">
                    <div className="text-[10px] text-blue-400 font-mono font-bold mb-1">{r.anon_id}</div>
                    <p>&ldquo;{r.roast_text}&rdquo;</p>
                  </div>
                )) : (
                  <p className="text-xs text-zinc-500 italic">No roasts yet. Be the first to burn this target!</p>
                )}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[#222]">
              <button
                onClick={() => handleVote(2)}
                disabled={voting !== null}
                aria-pressed={viewerVote === 2}
                className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                  viewerVote === 2
                    ? 'bg-blue-500 text-black shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                    : 'bg-[#1a1a1a] hover:bg-blue-500 text-white hover:text-black border border-[#333]'
                }`}
              >
                {voting === 2 ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : viewerVote === 2 ? (
                  <><Check className="w-4 h-4" /> Your vote — @{fighter2.username}</>
                ) : viewerVote === 1 ? (
                  <><RefreshCw className="w-4 h-4" /> Switch to @{fighter2.username}</>
                ) : (
                  <><Flame className="w-4 h-4" /> Vote @{fighter2.username}</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Next Battle */}
        <div className="flex justify-center pt-2">
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-[#161616] hover:bg-[#222] text-white font-extrabold rounded-xl border border-[#333] hover:border-[#ff4d00]/50 transition-all flex items-center gap-2 text-xs uppercase tracking-wider shadow-lg active:scale-95"
          >
            <RefreshCw className="w-4 h-4 text-[#ff4d00]" aria-hidden="true" />
            <span>Next Battle Matchup</span>
          </button>
        </div>
      </div>
    </div>
  );
}
