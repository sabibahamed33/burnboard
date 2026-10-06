import React, { useState, useEffect } from 'react';
import { Swords, Flame, Sparkles, RefreshCw, Trophy, Share2, ArrowRight, Zap, Check, ExternalLink, History } from 'lucide-react';
import { Battle, Profile, Roast } from '../types';
import confetti from 'canvas-confetti';
import { downloadOgImage } from '../lib/ogGenerator';

export interface BattleHistoryItem {
  id: string;
  p1_name: string;
  p2_name: string;
  p1_votes: number;
  p2_votes: number;
  winner_name: string;
  timestamp: string;
}

interface BattleArenaProps {
  battles: Battle[];
  profiles: Profile[];
  roasts: Roast[];
  onVoteBattle: (battleId: string, candidate: 1 | 2) => void;
  onNextBattle: () => void;
  onOpenProfile: (profileId: string) => void;
  onShowToast: (text: string, subtext?: string) => void;
  className?: string;
}

export const BattleArena: React.FC<BattleArenaProps> = ({
  battles,
  profiles,
  roasts,
  onVoteBattle,
  onNextBattle,
  onOpenProfile,
  onShowToast,
  className = ''
}) => {
  const [currentBattleIndex, setCurrentBattleIndex] = useState(0);
  const [hasVoted, setHasVoted] = useState<1 | 2 | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [battleHistory, setBattleHistory] = useState<BattleHistoryItem[]>([]);

  const activeBattle = battles[currentBattleIndex % battles.length] || battles[0];

  // Pick two profiles
  const profile1 = profiles.find(p => p.id === activeBattle?.profile1_id) || profiles[0];
  const profile2 = profiles.find(p => p.id === activeBattle?.profile2_id) || profiles[1] || profiles[0];

  const roasts1 = roasts.filter(r => r.profile_id === profile1?.id).slice(0, 2);
  const roasts2 = roasts.filter(r => r.profile_id === profile2?.id).slice(0, 2);

  // Vote calculation
  const totalVotes = (activeBattle?.votes1 || 0) + (activeBattle?.votes2 || 0);
  const pct1 = totalVotes > 0 ? Math.round(((activeBattle?.votes1 || 0) / totalVotes) * 100) : 50;
  const pct2 = 100 - pct1;

  const handleVote = (candidate: 1 | 2) => {
    if (!activeBattle || !profile1 || !profile2) return;
    if (hasVoted !== null) return; // prevent double-tap duplicate votes
    setHasVoted(candidate);

    // Confetti blast
    confetti({
      particleCount: 45,
      spread: 70,
      origin: { x: candidate === 1 ? 0.3 : 0.7, y: 0.6 },
      colors: candidate === 1 ? ['#ff4d00', '#ff8533', '#ffffff'] : ['#3b82f6', '#60a5fa', '#ffffff']
    });

    onVoteBattle(activeBattle.id, candidate);
    const targetName = candidate === 1 ? profile1.username : profile2.username;
    onShowToast(`Voted for @${targetName}!`, 'Your battle vote has been permanently tallied.');

    // Append to battle history
    const winner = (activeBattle.votes1 + (candidate === 1 ? 1 : 0)) >= (activeBattle.votes2 + (candidate === 2 ? 1 : 0))
      ? profile1.username
      : profile2.username;

    setBattleHistory(prev => [
      {
        id: `hist-${Date.now()}`,
        p1_name: profile1.username,
        p2_name: profile2.username,
        p1_votes: activeBattle.votes1 + (candidate === 1 ? 1 : 0),
        p2_votes: activeBattle.votes2 + (candidate === 2 ? 1 : 0),
        winner_name: winner,
        timestamp: 'Just now'
      },
      ...prev.slice(0, 4)
    ]);
  };

  const handleNext = () => {
    setHasVoted(null);
    if (battles.length <= 1) {
      onNextBattle();
    } else {
      setCurrentBattleIndex(prev => (prev + 1) % battles.length);
    }
  };

  const handleShareBattle = async () => {
    if (!profile1 || !profile2) return;
    setIsSharing(true);
    try {
      await downloadOgImage({
        template: 'battle',
        username: profile1.username,
        username2: profile2.username,
        votes1: `${pct1}%`,
        votes2: `${pct2}%`
      }, `burnboard-battle-${profile1.username}-vs-${profile2.username}.png`);

      onShowToast('Battle Card Downloaded! ⚔️', '1080x1080 viral match card ready to share on X / Reddit');
    } catch (err) {
      console.error(err);
      onShowToast('Share error', 'Could not render battle card image');
    } finally {
      setIsSharing(false);
    }
  };

  if (!profile1 || !profile2) {
    return (
      <div className="p-8 text-center bg-[#111] border border-[#222] rounded-2xl">
        <h3 className="text-white font-bold">Need at least 2 profiles for Battle Arena</h3>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-red-950/40 via-[#111] to-blue-950/40 border border-[#333] rounded-2xl p-5 sm:p-6 text-center relative overflow-hidden shadow-2xl">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Swords className="w-6 h-6 text-[#ff4d00] animate-bounce" />
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tight">
            Roast Arena: Head-to-Head Battle
          </h1>
          <Swords className="w-6 h-6 text-blue-400 animate-bounce" />
        </div>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto">
          Who got obliterated harder? Vote to decide the ultimate roasted icon.
        </p>

        {/* Global animated percentage vote bar */}
        <div className="mt-5 max-w-xl mx-auto">
          <div className="flex justify-between text-xs font-mono font-bold mb-1.5 px-1">
            <span className="text-[#ff4d00]">@{profile1.username} ({pct1}%)</span>
            <span className="text-zinc-500">{totalVotes.toLocaleString()} TOTAL VOTES</span>
            <span className="text-blue-400">@{profile2.username} ({pct2}%)</span>
          </div>
          <div className="h-3.5 bg-[#141414] rounded-full overflow-hidden flex border border-[#333] p-0.5">
            <div
              className="vote-bar bg-gradient-to-r from-orange-600 to-[#ff4d00] h-full rounded-l-full"
              style={{ width: `${pct1}%` }}
            />
            <div
              className="vote-bar bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-r-full"
              style={{ width: `${pct2}%` }}
            />
          </div>
        </div>
      </div>

      {/* Side-by-Side Match Arena with VS Center */}
      <div className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
          {/* Candidate 1 (Red/Orange Corner) */}
          <div
            id={`battle-card-${profile1.id}`}
            className={`bg-gradient-to-b from-[#16120e] to-[#0f0f0f] border-2 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] ${
              hasVoted === 1
                ? 'border-[#ff4d00] shadow-[0_0_30px_rgba(255,77,0,0.3)]'
                : 'border-[#262626] hover:border-[#ff4d00]/50'
            }`}
          >
            <div>
              {/* Profile Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-black shrink-0 ${
                    profile1.avatar_color || 'bg-[#ff4d00] text-black'
                  }`}
                >
                  {profile1.avatar_letter}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white truncate">
                      @{profile1.username}
                    </h3>
                    <span className="text-[10px] font-bold bg-[#ff4d00]/15 text-[#ff4d00] border border-[#ff4d00]/30 px-2 py-0.5 rounded-full uppercase">
                      {profile1.platform}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                    {profile1.bio}
                  </p>
                </div>
              </div>

              {/* Sample Burns */}
              <div className="space-y-2 mb-4">
                <div className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
                  Top Roast Ammunition:
                </div>
                {roasts1.map(r => (
                  <div
                    key={r.id}
                    className="p-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs text-zinc-300 italic"
                  >
                    "{r.roast_text}"
                  </div>
                ))}
              </div>
            </div>

            {/* Vote Action Bar */}
            <div className="pt-4 border-t border-[#222] space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-[#ff4d00] font-bold">{activeBattle.votes1} votes</span>
                <span className="text-white font-bold">{pct1}% Roasted</span>
              </div>
              <button
                id="btn-vote-candidate-1"
                onClick={() => handleVote(1)}
                disabled={hasVoted !== null}
                aria-pressed={hasVoted === 1}
                className={`w-full py-3 rounded-xl font-mono font-black uppercase text-xs sm:text-sm tracking-wider flex items-center justify-center gap-2 tactile min-h-[44px] disabled:cursor-default ${
                  hasVoted === 1
                    ? 'bg-[#ff4d00] text-black vote-selected fire-glow'
                    : 'bg-[#ff4d00]/20 hover:bg-[#ff4d00] text-[#ff4d00] hover:text-black border border-[#ff4d00]/40'
                }`}
              >
                <Flame className="w-4 h-4 fill-current" />
                <span>{hasVoted === 1 ? 'Voted Most Destroyed' : `Vote @${profile1.username}`}</span>
              </button>
            </div>
          </div>

          {/* Candidate 2 (Blue/Indigo Corner) */}
          <div
            id={`battle-card-${profile2.id}`}
            className={`bg-gradient-to-b from-[#0c121a] to-[#0f0f0f] border-2 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] ${
              hasVoted === 2
                ? 'border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
                : 'border-[#262626] hover:border-blue-500/50'
            }`}
          >
            <div>
              {/* Profile Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-black shrink-0 ${
                    profile2.avatar_color || 'bg-blue-600 text-white'
                  }`}
                >
                  {profile2.avatar_letter}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white truncate">
                      @{profile2.username}
                    </h3>
                    <span className="text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full uppercase">
                      {profile2.platform}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                    {profile2.bio}
                  </p>
                </div>
              </div>

              {/* Sample Burns */}
              <div className="space-y-2 mb-4">
                <div className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
                  Top Roast Ammunition:
                </div>
                {roasts2.map(r => (
                  <div
                    key={r.id}
                    className="p-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs text-zinc-300 italic"
                  >
                    "{r.roast_text}"
                  </div>
                ))}
              </div>
            </div>

            {/* Vote Action Bar */}
            <div className="pt-4 border-t border-[#222] space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-blue-400 font-bold">{activeBattle.votes2} votes</span>
                <span className="text-white font-bold">{pct2}% Roasted</span>
              </div>
              <button
                id="btn-vote-candidate-2"
                onClick={() => handleVote(2)}
                disabled={hasVoted !== null}
                aria-pressed={hasVoted === 2}
                className={`w-full py-3 rounded-xl font-mono font-black uppercase text-xs sm:text-sm tracking-wider flex items-center justify-center gap-2 tactile min-h-[44px] disabled:cursor-default ${
                  hasVoted === 2
                    ? 'bg-blue-500 text-black vote-selected shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                    : 'bg-blue-500/20 hover:bg-blue-500 text-blue-400 hover:text-black border border-blue-500/40'
                }`}
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>{hasVoted === 2 ? 'Voted Most Destroyed' : `Vote @${profile2.username}`}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Center Animated VS Badge */}
        <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-[#0a0a0a] border-2 border-[#ff4d00] items-center justify-center shadow-[0_0_25px_rgba(255,77,0,0.6)] z-10">
          <span className="text-sm font-black italic text-white">VS</span>
        </div>
      </div>

      {/* Arena Navigation & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          id="btn-share-battle-card"
          onClick={handleShareBattle}
          disabled={isSharing}
          className="flex items-center gap-2 px-4 py-2 bg-[#141414] hover:bg-[#1f1f1f] text-zinc-300 hover:text-white rounded-xl border border-[#262626] text-xs font-mono font-bold transition-colors"
        >
          <Share2 className="w-4 h-4 text-[#ff4d00]" />
          <span>{isSharing ? 'Generating 1080x1080 OG...' : 'Share Battle Card (1080x1080)'}</span>
        </button>

        <button
          id="btn-next-battle"
          onClick={handleNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-xl font-mono font-black text-xs uppercase tracking-wider shadow-lg hover:shadow-xl transition-all"
        >
          <span>Next Battle</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Battle History Log */}
      <div className="bg-[#111111] border border-[#222] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
          <History className="w-4 h-4 text-[#ff4d00]" />
          <span>Recent Arena Match Results</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {battleHistory.map(item => (
            <div
              key={item.id}
              className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl flex items-center justify-between text-xs font-mono"
            >
              <div className="space-y-0.5">
                <div className="text-white font-bold flex items-center gap-1.5">
                  <span>@{item.p1_name}</span>
                  <span className="text-zinc-500 text-[10px]">vs</span>
                  <span>@{item.p2_name}</span>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Winner: <strong className="text-[#ff4d00]">@{item.winner_name}</strong> ({item.timestamp})
                </div>
              </div>
              <div className="text-right text-[11px] text-zinc-400">
                <div>{item.p1_votes} - {item.p2_votes}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BattleArena;
