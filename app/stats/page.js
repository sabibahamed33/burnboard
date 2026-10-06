'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BarChart3, Flame, Users, TrendingUp, ArrowLeft, Loader2,
  Building2, Swords, Target, MessageSquare, AlertTriangle,
} from 'lucide-react';

/**
 * /stats — Authentic platform stats (Master Prompt 23, Section 52).
 *
 * Every number is a REAL aggregate computed server-side from public tables
 * (/api/stats). No fabricated social proof: if there is no data yet, the
 * page says so instead of inventing numbers.
 */

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className="bg-[#111] border border-[#222] p-4 rounded-2xl">
      <span className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono">
        {icon}
        <span>{label}</span>
      </span>
      <div className={`text-2xl font-black font-mono mt-1 ${accent || 'text-white'}`}>{fmt(value)}</div>
      {sub && <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`stats ${r.status}`))))
      .then((json) => {
        if (!cancelled) {
          setStats(json.stats || null);
          if (json.configured === false) setError('Stats are not configured yet.');
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load stats. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const s = stats;
  const weeklyAvg = s && s.roasts7d !== null && s.roasts7d !== undefined
    ? Math.round(s.roasts7d / 7)
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-[#222] pb-4">
          <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Feed</span>
          </Link>
          <div className="flex items-center gap-2 text-[#ff4d00] font-mono font-black text-sm">
            <BarChart3 className="w-4 h-4" />
            <span>BURNBOARD TELEMETRY</span>
          </div>
        </div>

        <div className="bg-[#111] border border-[#222] rounded-3xl p-6 sm:p-8 space-y-3">
          <h1 className="text-2xl sm:text-3xl font-black font-mono">GLOBAL ROAST STATS</h1>
          <p className="text-xs text-zinc-400 font-mono">
            Real aggregate numbers, straight from the platform. No fake stats — ever.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-xs font-mono">
            <Loader2 className="w-4 h-4 animate-spin" /> Crunching real numbers…
          </div>
        )}

        {error && !loading && (
          <div className="bg-[#2a0a0a] border border-[#5a1a1a] rounded-2xl p-4 text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {s && (
          <>
            {/* Core roast KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Roasts" value={s.roasts} accent="text-[#ff4d00]" sub="all-time, visible only" />
              <StatCard label="Roasts This Week" value={s.roasts7d} sub={weeklyAvg !== null ? `≈ ${fmt(weeklyAvg)}/day` : null} />
              <StatCard label="Roasts Today" value={s.roastsToday} accent="text-emerald-400" sub="so far" />
              <StatCard label="Hot Seats" value={s.hotSeats} sub="profiles on the seat" />
            </div>

            {/* Platform health */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Members" value={s.members} icon={<Users className="w-3.5 h-3.5" />} />
              <StatCard label="Communities" value={s.communities} sub="public communities" />
              <StatCard label="Battles" value={s.battles} sub="1v1 roast battles" />
              <StatCard label="Challenges" value={s.challenges} sub="open challenges" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Posts" value={s.posts} sub="social posts" />
              <StatCard label="Target Profiles" value={s.profiles} sub="profiles submitted" />
            </div>

            {/* Honesty note */}
            <div className="bg-[#111] border border-[#222] rounded-2xl p-4 text-[11px] text-zinc-500 font-mono leading-relaxed">
              <TrendingUp className="w-3.5 h-3.5 inline mr-1.5 text-[#ff4d00]" />
              Counts include only visible (moderated-visible) content. Numbers update in near real time — no estimates, no rounding up.
            </div>
          </>
        )}

        {!s && !error && !loading && (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-2">
            <Flame className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-400 font-bold">No stats yet</p>
            <p className="text-xs text-zinc-500">Real numbers will appear here as the first roasts roll in.</p>
          </div>
        )}
      </div>
    </div>
  );
}