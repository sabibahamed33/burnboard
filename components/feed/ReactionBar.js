'use client';

import React, { useState, useCallback, useEffect } from 'react';

/**
 * ReactionBar — BurnBoard-native reaction system with 7 reaction types.
 * 
 * Each reaction type has its own identity and personality:
 *   🔥 Burn — "That's a burn"
 *   😂 Dead — "I'm dead"
 *   💀 Finished — "You're done"
 *   😭 Brutal — "That's brutal"
 *   🤯 Wild — "That's wild"
 *   🫡 Respect — "Respect"
 *   🤔 Hmm — "Hmm"
 * 
 * One active reaction per target. Toggle to remove, switch to change.
 */

const REACTION_CONFIG = [
  { key: 'burn',     emoji: '🔥', label: 'Burn',     activeClass: 'border-[#ff4d00]/60 bg-[#ff4d00]/15 text-[#ff4d00]' },
  { key: 'dead',     emoji: '😂', label: 'Dead',     activeClass: 'border-yellow-500/60 bg-yellow-500/15 text-yellow-400' },
  { key: 'finished', emoji: '💀', label: 'Finished', activeClass: 'border-red-500/60 bg-red-500/15 text-red-400' },
  { key: 'brutal',   emoji: '😭', label: 'Brutal',   activeClass: 'border-blue-500/60 bg-blue-500/15 text-blue-400' },
  { key: 'wild',     emoji: '🤯', label: 'Wild',     activeClass: 'border-purple-500/60 bg-purple-500/15 text-purple-400' },
  { key: 'respect',  emoji: '🫡', label: 'Respect',  activeClass: 'border-green-500/60 bg-green-500/15 text-green-400' },
  { key: 'hmm',      emoji: '🤔', label: 'Hmm',      activeClass: 'border-zinc-400/60 bg-zinc-400/15 text-zinc-300' },
];

/**
 * Compact reaction bar showing top reactions with counts.
 * Used in feed cards and content detail.
 */
export function ReactionSummary({
  itemId,
  targetType = 'roast',
  reactions = {},
  participantReaction = null,
  onReact,
  compact = false,
  className = '',
}) {
  const [activeReaction, setActiveReaction] = useState(participantReaction);
  const [optimisticCounts, setOptimisticCounts] = useState(null);
  const [animating, setAnimating] = useState(null);
  const animTimerRef = React.useRef(null);

  const counts = optimisticCounts || reactions;

  // Never fire a setState after unmount (fast navigation mid-animation).
  useEffect(() => () => {
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
  }, []);

  // Sync with prop changes
  useEffect(() => {
    if (participantReaction !== undefined) {
      setActiveReaction(participantReaction);
    }
  }, [participantReaction]);

  const handleReact = useCallback(async (reactionKey) => {
    const wasActive = activeReaction === reactionKey;
    const previousActive = activeReaction;
    const previousCounts = { ...counts };

    // Optimistic update
    const newCounts = { ...counts };
    if (previousActive) {
      newCounts[previousActive] = Math.max(0, (newCounts[previousActive] || 0) - 1);
    }
    if (!wasActive) {
      newCounts[reactionKey] = (newCounts[reactionKey] || 0) + 1;
    }
    newCounts.total = Object.keys(newCounts)
      .filter(k => k !== 'total')
      .reduce((sum, k) => sum + (newCounts[k] || 0), 0);

    setActiveReaction(wasActive ? null : reactionKey);
    setOptimisticCounts(newCounts);
    // Signature micro-interaction (≤420ms, transform/opacity only).
    // Burn gets the fire pop + glow; every other reaction gets react-pop.
    setAnimating(reactionKey);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setAnimating(null), 440);

    try {
      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: itemId,
          reaction_type: reactionKey,
          participant_id: getParticipantId(),
        }),
      });

      const data = await res.json();
      if (data.success && data.counts) {
        setOptimisticCounts(data.counts);
        setActiveReaction(data.action === 'removed' ? null : data.reaction_type);
      }
    } catch {
      setActiveReaction(previousActive);
      setOptimisticCounts(previousCounts);
    }
  }, [itemId, targetType, activeReaction, counts, onReact]);

  if (compact) {
    // Compact: show only top 3 reactions with counts
    const sortedReactions = REACTION_CONFIG
      .map(r => ({ ...r, count: counts[r.key] || 0 }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        {sortedReactions.map(({ key, emoji, label, count }) => {
          const isActive = activeReaction === key;
          const isAnimating = animating === key;
          return (
            <button
              key={key}
              onClick={() => handleReact(key)}
              aria-label={`${label} (${count})`}
              aria-pressed={isActive}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono transition-all active:scale-90 min-h-[36px] min-w-[40px] justify-center ${
                isActive
                  ? 'bg-[#ff4d00]/10 text-[#ff4d00] border border-[#ff4d00]/30'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
              } ${isAnimating && key === 'burn' ? 'fire-pop fire-glow' : ''} ${isAnimating && key !== 'burn' ? 'react-pop' : ''}`}
            >
              <span className={`text-sm leading-none ${isAnimating ? 'react-pop' : ''}`}>{emoji}</span>
              <span className="font-bold">{count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Full: show all 7 reactions
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {REACTION_CONFIG.map(({ key, emoji, label, activeClass }) => {
        const count = counts[key] || 0;
        const isActive = activeReaction === key;
        const isAnimating = animating === key;
        const showCount = count > 0;

        return (
          <button
            key={key}
            onClick={() => handleReact(key)}
            aria-label={`${label} (${count})`}
            aria-pressed={isActive}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition-all duration-150 active:scale-90 min-h-[40px] min-w-[40px] justify-center ${
              isActive
                ? activeClass
                : 'bg-[#0a0a0a] text-zinc-400 border-[#262626] hover:border-[#3a3a3a] hover:text-white'
            } ${isAnimating && key === 'burn' ? 'fire-pop fire-glow' : ''}`}
          >
            <span className={`text-sm leading-none ${isAnimating ? 'react-pop' : ''}`}>{emoji}</span>
            {showCount && (
              <span className={`text-[10px] ${isActive ? 'font-black' : 'text-zinc-300'}`}>
                {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Get or create persistent participant ID
 */
export function getParticipantId() {
  if (typeof window === 'undefined') return 'server';
  const STORAGE_KEY = 'burnboard_participant_id';
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/**
 * Format reaction counts for display
 */
export function formatReactionCounts(counts) {
  if (!counts) return [];
  return REACTION_CONFIG
    .map(r => ({ ...r, count: counts[r.key] || 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

export default ReactionSummary;
