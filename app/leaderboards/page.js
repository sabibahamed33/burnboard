'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Flame, Trophy, RefreshCw, Medal, Zap, Swords, Users } from 'lucide-react';
import { track } from '@/lib/analytics';
import { getViewerId } from '@/lib/identity';
import { getLevelInfo } from '@/lib/reputation/config';
import { formatCompact } from '@/lib/format';
import Avatar from '@/components/ui/Avatar';
import BadgeGrid from '@/components/reputation/BadgeGrid';
import StreakDisplay from '@/components/reputation/StreakDisplay';
import NotificationBell from '@/components/NotificationBell';

/**
 * /leaderboards — Rank: global recognition + progression.
 *
 * Real XP/levels from the centralized reputation system, real ranked rows
 * (reputation-based, never follower count), real achievements. Suspended
 * accounts are excluded server-side; blocked/muted users are filtered for
 * signed-in viewers. Empty boards render honest empty states — never
 * fabricated rows. Every public account here is a USER.
 */

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'weekly', label: 'Week' },
  { id: 'monthly', label: 'Month' },
  { id: 'all_time', label: 'All Time' },
];

const BOARD_TABS = [
  { id: 'global', label: 'Global' },
  { id: 'following', label: 'Following' },
];

const PAGE_LIMIT = 25;

function medalFor(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function BoardRow({ entry, highlight = false }) {
  const medal = medalFor(entry.rank);
  return (
    <Link
      href={entry.username ? `/u/${entry.username}` : '#'}
      className={`flex min-h-[64px] items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all active:scale-[0.99] ${
        highlight
          ? 'border-[#ff4d00]/50 bg-[#ff4d00]/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25'
      }`}
      aria-label={highlight ? `You are ranked ${entry.rank}` : `Rank ${entry.rank}: ${entry.display_name || entry.username}`}
    >
      <span className={`w-8 shrink-0 text-center text-sm font-black ${entry.rank <= 3 ? 'text-[#ff4d00]' : 'text-zinc-500'}`}>
        {medal || entry.rank}
      </span>
      <Avatar username={entry.username} size="md" src={entry.avatar_url} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white">
          {entry.display_name || `@${entry.username}`}
          {highlight && <span className="ml-2 rounded-full bg-[#ff4d00] px-2 py-0.5 text-[10px] font-black text-black">YOU</span>}
        </span>
        <span className="block truncate font-mono text-[11px] text-zinc-500">
          @{entry.username}{entry.level ? ` · ${entry.level}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-black text-[#ff4d00]">{formatCompact(entry.reputation)}</span>
        <span className="block font-mono text-[10px] text-zinc-500">Burn Rep</span>
      </span>
    </Link>
  );
}

export default function RankPage() {
  const [board, setBoard] = useState('global');
  const [period, setPeriod] = useState('all_time');
  const [entries, setEntries] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [viewerId, setViewerId] = useState(null);
  const [hero, setHero] = useState(null);
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const abortRef = useRef(null);

  // Signed-in identity + own block/mute lists (fail-open: global board
  // stays visible when safety lists are unreachable).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { viewerId: id } = await getViewerId();
        if (cancelled || !id) return;
        setViewerId(id);
        const [bRes, mRes, repRes] = await Promise.all([
          fetch('/api/safety/blocks').catch(() => null),
          fetch('/api/safety/mutes').catch(() => null),
          fetch(`/api/reputation?type=user&user_id=${encodeURIComponent(id)}`).catch(() => null),
        ]);
        if (cancelled) return;
        const hidden = new Set();
        try {
          const b = bRes?.ok ? await bRes.json().catch(() => ({})) : {};
          for (const r of b.blockedUsers || []) if (r.blocked_id) hidden.add(r.blocked_id);
          const m = mRes?.ok ? await mRes.json().catch(() => ({})) : {};
          const muted = m.mutedUsers || m.mutes || [];
          for (const r of muted) if (r.muted_id || r.userId) hidden.add(r.muted_id || r.userId);
        } catch {}
        setHiddenIds(hidden);
        if (repRes?.ok) {
          const rep = await repRes.json().catch(() => ({}));
          if (rep?.profile || rep?.reputation) setHero({ profile: rep.profile, reputation: rep.reputation, streak: rep.streak });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const applyHidden = useCallback((rows) => {
    if (!hiddenIds.size) return rows;
    return rows.filter((r) => !hiddenIds.has(r.user_id) && !hiddenIds.has(r.id));
  }, [hiddenIds]);

  const loadBoard = useCallback(async ({ reset = false, offsetValue = 0 } = {}) => {
    if (reset) {
      setLoading(true);
      setError('');
    } else {
      setLoadingMore(true);
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let rows = [];
      let more = false;
      if (board === 'following' && viewerId) {
        // Following board: viewer's real follows ranked by karma.
        const res = await fetch(
          `/api/follow/list?user_id=${encodeURIComponent(viewerId)}&type=following&limit=50`,
          { signal: controller.signal }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error('load');
        rows = (data.users || [])
          .map((u) => ({
            user_id: u.id,
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            reputation: u.karma || 0,
            level: u.level || null,
          }))
          .sort((a, b) => (b.reputation || 0) - (a.reputation || 0))
          .map((r, i) => ({ ...r, rank: i + 1 }));
      } else {
        const res = await fetch(
          `/api/reputation?type=leaderboard&period=${period}&limit=${PAGE_LIMIT}&offset=${offsetValue}`,
          { signal: controller.signal }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error('load');
        rows = data.leaderboard || [];
        more = rows.length >= PAGE_LIMIT;
      }
      const visible = applyHidden(rows);
      if (reset) {
        setEntries(visible);
        setOffset(offsetValue + PAGE_LIMIT);
        setHasMore(more);
      } else {
        const seen = new Set(entries.map((e) => `${e.user_id || e.id}`));
        setEntries((prev) => [...prev, ...visible.filter((e) => !seen.has(`${e.user_id || e.id}`))]);
        setOffset((o) => o + PAGE_LIMIT);
        setHasMore(more);
      }
      track('leaderboard_viewed', { period, board });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (reset) setError("Rankings couldn't load.");
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  }, [board, period, viewerId, entries, applyHidden]);

  useEffect(() => {
    setEntries([]);
    setOffset(0);
    loadBoard({ reset: true, offsetValue: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, period, viewerId, hiddenIds]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const heroRep = hero?.reputation?.rep || 0;
  const levelInfo = getLevelInfo(heroRep);
  const myRow = viewerId
    ? entries.find((e) => e.user_id === viewerId || e.id === viewerId)
    : null;
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Brand header */}
        <header className="flex min-h-[44px] items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5" aria-label="BurnBoard home">
            <Flame className="h-5 w-5 fill-[#ff4d00] text-[#ff4d00]" />
            <span className="text-[15px] font-black tracking-wide text-white">BURNBOARD</span>
          </Link>
          <NotificationBell />
        </header>

        {/* Hero */}
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-[28px] font-black leading-none tracking-tight text-white">
            <span aria-hidden="true">🏆</span> Rank
          </h1>
          <p className="text-[13px] text-zinc-400">See who&apos;s rising across BurnBoard.</p>
        </div>

        {/* Current user progress */}
        {viewerId && hero && (
          <section aria-label="Your progress" className="overflow-hidden rounded-[20px] border border-[#ff4d00]/25 bg-gradient-to-b from-[#ff4d00]/10 via-[#111] to-[#0a0a0a] p-5">
            <div className="flex items-center gap-3">
              <Avatar username={hero.profile?.username} size="md" src={hero.profile?.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">
                  {hero.profile?.display_name || `@${hero.profile?.username || 'you'}`}
                </p>
                <p className="font-mono text-[11px] text-zinc-400">
                  LEVEL {levelInfo.level} · {levelInfo.name} {levelInfo.emoji}
                </p>
              </div>
              {hero.streak?.current_streak > 0 && (
                <span className="shrink-0 rounded-full border border-[#ff4d00]/40 bg-[#ff4d00]/10 px-2.5 py-1 font-mono text-[11px] font-bold text-[#ff4d00]">
                  🔥 {hero.streak.current_streak}-day streak
                </span>
              )}
            </div>
            <div className="mt-3">
              <div
                className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/60"
                role="progressbar"
                aria-valuenow={Math.round((levelInfo.progress || 0))}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Level progress: ${formatCompact(heroRep)} Burn Rep`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-600 to-[#ff4d00] shadow-[0_0_12px_rgba(255,77,0,0.5)] transition-all duration-500"
                  style={{ width: `${Math.min(100, levelInfo.progress || 0)}%` }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-zinc-400">
                {formatCompact(heroRep)} XP
                {levelInfo.nextLevel
                  ? ` · ${formatCompact(levelInfo.progressToNext)} to ${levelInfo.nextLevel.name}`
                  : ' · Max level reached'}
              </p>
            </div>
            {myRow && (
              <p className="mt-2 font-mono text-[11px] text-emerald-300">
                You&apos;re #{myRow.rank} on this board
              </p>
            )}
          </section>
        )}

        {/* Board tabs */}
        <nav className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1" role="tablist" aria-label="Leaderboard">
          {BOARD_TABS.map((t) => {
            const active = board === t.id;
            const disabled = t.id === 'following' && !viewerId;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                disabled={disabled}
                title={disabled ? 'Sign in to rank people you follow' : undefined}
                onClick={() => setBoard(t.id)}
                className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 ${
                  active
                    ? 'bg-[#ff4d00] text-black shadow-[0_0_16px_rgba(255,77,0,0.35)]'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Periods */}
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1 no-scrollbar" role="tablist" aria-label="Time window">
          {PERIODS.map((p) => {
            const active = period === p.id;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={active}
                onClick={() => setPeriod(p.id)}
                className={`min-h-[40px] flex-1 whitespace-nowrap rounded-xl px-3 text-[11px] font-bold transition-all active:scale-95 ${
                  active
                    ? 'border border-white/15 bg-white/10 text-white'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-2" aria-live="polite" aria-label="Loading rankings">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border border-white/5 bg-[#111] p-3">
                <div className="h-8 w-8 rounded-full bg-[#1e1e1e]" />
                <div className="h-10 w-10 rounded-full bg-[#1e1e1e]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded bg-[#1e1e1e]" />
                  <div className="h-3 w-1/4 rounded bg-[#1a1a1a]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-bold text-zinc-200">Rankings couldn&apos;t load.</p>
            <button
              onClick={() => loadBoard({ reset: true, offsetValue: 0 })}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {/* Board */}
        {!loading && !error && (
          <div className="space-y-5">
            {entries.length === 0 ? (
              <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
                <div className="text-5xl" aria-hidden="true">🏆</div>
                <p className="text-sm font-bold text-zinc-200">No ranking data yet.</p>
                <p className="mx-auto max-w-xs text-xs text-zinc-500">
                  {board === 'following'
                    ? 'Follow people to rank them here.'
                    : 'Keep participating to appear here.'}
                </p>
                <Link
                  href={board === 'following' ? '/explore' : '/create'}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
                >
                  {board === 'following' ? <><Users className="h-4 w-4" /> Discover people</> : 'Create a post'}
                </Link>
              </div>
            ) : (
              <>
                {/* Podium */}
                {top3.length > 0 && (
                  <section aria-label="Top 3">
                    <div className="grid grid-cols-3 items-end gap-2">
                      {/* Mobile order: 2, 1, 3 via visual order classes */}
                      {[top3[1], top3[0], top3[2]].filter(Boolean).map((e) => {
                        const first = e.rank === 1;
                        return (
                          <Link
                            key={e.user_id || e.id}
                            href={e.username ? `/u/${e.username}` : '#'}
                            className={`flex flex-col items-center gap-1.5 rounded-[20px] border p-3 text-center transition-all active:scale-[0.98] ${
                              first
                                ? 'border-[#ff4d00]/40 bg-gradient-to-b from-[#ff4d00]/15 to-[#111] shadow-[0_0_28px_rgba(255,77,0,0.18)]'
                                : 'border-white/10 bg-white/[0.03]'
                            }`}
                            aria-label={`Rank ${e.rank}: ${e.display_name || e.username}`}
                          >
                            <span className={`text-xl ${first ? '' : 'grayscale'}`} aria-hidden="true">
                              {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉'}
                            </span>
                            <Avatar username={e.username} size={first ? 'md' : 'sm'} src={e.avatar_url} />
                            <span className="w-full">
                              <span className={`block truncate font-bold text-white ${first ? 'text-sm' : 'text-xs'}`}>
                                {e.display_name || `@${e.username}`}
                              </span>
                              <span className="mt-0.5 block font-mono text-[10px] text-[#ff4d00]">
                                {formatCompact(e.reputation)} XP
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Rows */}
                {rest.length > 0 && (
                  <section className="space-y-2" aria-label="More rankings">
                    {rest.map((e) => (
                      <BoardRow key={e.user_id || e.id} entry={e} highlight={viewerId && (e.user_id === viewerId || e.id === viewerId)} />
                    ))}
                  </section>
                )}

                {hasMore && board === 'global' && (
                  <button
                    onClick={() => loadBoard({ offsetValue: offset })}
                    disabled={loadingMore}
                    className="min-h-[44px] w-full rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-bold text-zinc-300 transition-all hover:border-white/25 hover:text-white disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}

            {/* Achievements */}
            {viewerId && (
              <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4" aria-label="Your achievements">
                <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-white">
                  <Medal className="h-4 w-4 text-[#ff4d00]" /> Your Achievements
                </h2>
                <BadgeGrid userId={viewerId} isOwnProfile />
              </section>
            )}

            {/* Battles teaser */}
            <section className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2">
                <Swords className="h-4 w-4 text-[#ff4d00]" />
                <p className="text-[13px] font-bold text-white">Compete for XP in Battles</p>
              </div>
              <Link href="/battles" className="flex min-h-[40px] items-center rounded-xl bg-[#ff4d00] px-4 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95">
                <Zap className="h-3.5 w-3.5" /> Play
              </Link>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
