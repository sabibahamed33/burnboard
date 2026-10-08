'use client';

import { useState, useEffect } from 'react';
import { getLevelInfo as getCentralLevelInfo } from '@/lib/reputation/config';

// Presentation for each level name. Thresholds, names, and progression live
// in lib/reputation/config.js (the single source of truth) — this file only
// decides how a level looks.
const LEVEL_STYLE = {
  Spark: { color: '#94a3b8', icon: '✨' },
  Ember: { color: '#fb923c', icon: '🕯️' },
  Flame: { color: '#f97316', icon: '🔥' },
  Blaze: { color: '#ef4444', icon: '🔥' },
  Inferno: { color: '#dc2626', icon: '🌋' },
  Supernova: { color: '#7c3aed', icon: '💫' },
  Legend: { color: '#eab308', icon: '👑' },
};

export function getLevelInfo(reputation) {
  const info = getCentralLevelInfo(reputation || 0);
  const style = LEVEL_STYLE[info.name] || LEVEL_STYLE.Spark;
  const current = { level: info.level, name: info.name, ...style };
  const next = info.nextLevel
    ? {
        level: info.level + 1,
        name: info.nextLevel.name,
        ...(LEVEL_STYLE[info.nextLevel.name] || LEVEL_STYLE.Spark),
      }
    : null;
  const progress = (info.progress || 0) / 100;
  return {
    current,
    next,
    progress: Math.min(progress, 1),
    toNext: info.progressToNext || 0,
  };
}

export default function LevelBadge({ reputation, compact = false }) {
  const levelInfo = getLevelInfo(reputation);

  if (compact) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '12px',
          background: `${levelInfo.current.color}20`,
          color: levelInfo.current.color,
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        {levelInfo.current.icon} {levelInfo.current.name}
      </span>
    );
  }

  return (
    <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontSize: '32px' }}>{levelInfo.current.icon}</span>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: levelInfo.current.color }}>
            {levelInfo.current.name}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Level {levelInfo.current.level}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {reputation.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Burn Rep</div>
        </div>
      </div>

      {levelInfo.next && (
        <div>
          <div style={{
            height: '8px',
            background: 'var(--border)',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '6px',
          }}>
            <div style={{
              height: '100%',
              width: `${levelInfo.progress * 100}%`,
              background: `linear-gradient(90deg, ${levelInfo.current.color}, ${levelInfo.next.color})`,
              borderRadius: '4px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {levelInfo.toNext.toLocaleString()} rep to {levelInfo.next.icon} {levelInfo.next.name}
          </div>
        </div>
      )}

      {!levelInfo.next && (
        <div style={{ fontSize: '13px', color: levelInfo.current.color, fontWeight: 600 }}>
          You&apos;ve reached the highest level! 👑
        </div>
      )}
    </div>
  );
}
