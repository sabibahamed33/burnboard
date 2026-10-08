'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Flame, Swords, Trophy, RefreshCw, Loader2, ArrowUpRight } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

/**
 * /battles — Battles hub (reference composition, real data only).
 *
 * Battles are profile-vs-profile matchups: the schema carries no titles,
 * schedules, or deadlines, so this hub shows LIVE (is_active) and FINISHED
 * (recorded history with real winners) — no invented timers or counts.
 * Voting happens in the arena (/battle?battle=id deep links work).
 */

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n || 0);
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" aria-hidden="true" />
      Live
    </span>
  );
}

function VersusHeader({ p1, p2, compact = false }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`min-w-0 flex-1 truncate font-bold text-white ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>
        @{p1 || '???'}
      </span>
      <span className="shrink-0 rounded-full bg-[#ff4d00] px-2.5 py-1 text-[10px] font-black italic text-black">
        VS
      </span>
      <span className={`min-w-0 flex-1 truncate text-right font-bold text-white ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>
        @{p2 || '???'}
      </span>
    </div>
  );
}

function VoteBar({ votes1, votes2 }) {
  const total = (votes1 || 0) + (votes2 || 0);
  const pct1 = total > 0 ? Math.round((votes1 / total) * 100) : 50;
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[11px] font-bold">
        <span className="text-[#ff4d00]">{pct1}%</span>
        <span className="text-zinc-500">{formatCount(total)} votes</span>
        <span className="text-blue-400">{100 - pct1}%</span>
      </div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/50"
        role="img"
        aria-label={`${pct1}% to ${100 - pct1}% by votes`}
      >
        <div className="h-full bg-gradient-to-r from-orange-600 to-[#ff4d00] transition-all duration-500" style={{ width: `${pct1}%` }} />
        <div className="h-full flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500" />
      </div>
    </div>
  );
}

export default function BattlesHubPage() {
  const [tab, setTab] = useState('live');
  const [live, setLive] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [liveRes, histRes] = await Promise.all([
        fetch('/api/battles?status=live&limit=12').catch(() => null),
        fetch('/api/battles?status=finished&limit=12').catch(() => null),
      ]);
      if (liveRes?.ok) {
        const d = await liveRes.json().catch(() => ({}));
        setLive(d.battles || []);
      }
      if (histRes?.ok) {
        const d = await histRes.json().catch(() => ({}));
        setHistory(d.history || []);
      }
    } catch {
      setError("Battles couldn't load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      fetch('/api/growth/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'discovery_opened', metadata: { surface: 'battles' } }),
      }).catch(() => {});
    } catch {}
  }, []);

  const hero = live.length ? live[0] : null;
  const rest = live.slice(1);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 pt-4 sm:px-6">
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
            <span aria-hidden="true">🔥</span> Battles
          </h1>
          <p className="text-[13px] text-zinc-400">Compete. Roast. Vote. Win.</p>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1" role="tablist" aria-label="Battles">
          {[
            { key: 'live', label: `Live${live.length ? ` (${live.length})` : ''}` },
            { key: 'finished', label: `Finished${history.length ? ` (${history.length})` : ''}` },
          ].map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-xs font-bold transition-all active:scale-95 ${
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

        {/* Loading */}
        {loading && (
          <div className="space-y-3" aria-live="polite" aria-label="Loading">
            {[0, 1].map((i) => (
              <div key={i} className="animate-pulse rounded-[20px] border border-white/5 bg-[#111] p-5">
                <div className="mx-auto h-4 w-2/3 rounded bg-[#1e1e1e]" />
                <div className="mx-auto mt-3 h-2.5 w-full rounded-full bg-[#1a1a1a]" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-bold text-zinc-200">Battles couldn&apos;t load.</p>
            <button
              onClick={load}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {!loading && !error && tab === 'live' && (
          <div className="space-y-5">
            {/* Hero battle */}
            {hero ? (
              <section aria-label="Featured battle" className="overflow-hidden rounded-[24px] border border-[#ff4d00]/25 bg-gradient-to-b from-[#ff4d00]/10 via-[#111] to-[#0a0a0a] p-5 shadow-[0_0_40px_rgba(255,77,0,0.12)] sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <LiveBadge />
                  <Link href="/battle" className="flex min-h-[36px] items-center gap-0.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-[#ff4d00]">
                    Enter Arena <span aria-hidden="true">›</span>
                  </Link>
                </div>
                <VersusHeader p1={hero.profile1?.username} p2={hero.profile2?.username} />
                <div className="mt-4">
                  <VoteBar votes1={hero.votes1} votes2={hero.votes2} />
                </div>
                <Link
                  href={`/battle?battle=${hero.id}`}
                  className="mt-4 flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[#ff4d00] text-sm font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-[0.99]"
                >
                  <Swords className="h-4 w-4" /> Vote in this Battle
                </Link>
              </section>
            ) : (
              <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                <div className="text-4xl" aria-hidden="true">⚔️</div>
                <p className="text-sm font-bold text-zinc-200">No live Battles right now.</p>
                <p className="mx-auto max-w-xs text-xs text-zinc-500">New matchups open as people get roasted. Check finished Battles below.</p>
              </div>
            )}

            {/* Rest of live */}
            {rest.length > 0 && (
              <section className="space-y-3" aria-label="More live battles">
                {rest.map((b) => (
                  <Link
                    key={b.id}
                    href={`/battle?battle=${b.id}`}
                    className="block rounded-[20px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl transition-all hover:border-[#ff4d00]/40 active:scale-[0.99]"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <LiveBadge />
                      <span className="font-mono text-[10px] text-zinc-500">{formatCount(b.votes)} votes</span>
                    </div>
                    <VersusHeader compact p1={b.profile1?.username} p2={b.profile2?.username} />
                    <div className="mt-3">
                      <VoteBar votes1={b.votes1} votes2={b.votes2} />
                    </div>
                  </Link>
                ))}
              </section>
            )}
          </div>
        )}

        {!loading && !error && tab === 'finished' && (
          <div className="space-y-3">
            {history.length > 0 ? (
              history.map((h) => (
                <section
                  key={h.id}
                  aria-label="Battle result"
                  className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-base" aria-hidden="true">🏆</span>
                    <h2 className="text-[13px] font-extrabold tracking-tight text-white">
                      Winner: @{h.winner?.username || '???'}
                    </h2>
                    <span className="ml-auto font-mono text-[10px] text-zinc-600">
                      {h.completedAt ? new Date(h.completedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <VersusHeader compact p1={h.profile1?.username} p2={h.profile2?.username} />
                  <div className="mt-3">
                    <VoteBar votes1={h.votes1} votes2={h.votes2} />
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-zinc-600">
                    Final · {h.rounds || 1} {h.rounds === 1 ? 'round' : 'rounds'}
                    {h.battle_id && (
                      <Link href={`/battle?battle=${h.battle_id}`} className="ml-2 text-[#ff4d00] hover:text-white">
                        View Battle →
                      </Link>
                    )}
                  </p>
                </section>
              ))
            ) : (
              <div className="space-y-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                <div className="text-4xl" aria-hidden="true">🏆</div>
                <p className="text-sm font-bold text-zinc-200">No finished Battles yet.</p>
                <p className="mx-auto max-w-xs text-xs text-zinc-500">Completed Battles and their winners will appear here.</p>
              </div>
            )}
          </div>
        )}

        {/* Arena CTA */}
        {!loading && !error && (
          <div className="space-y-3 border-t border-white/10 pt-6 text-center">
            <Link
              href="/battle"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-6 text-sm font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
            >
              <Swords className="h-4 w-4" /> Enter the Arena
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
