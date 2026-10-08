'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain, Activity, AlertTriangle, RefreshCw, Eye, ThumbsDown,
  Users, Share2, Sprout, Network, Layers, GitBranch,
  Cpu, Coins, Timer, Inbox, Info,
} from 'lucide-react';
import { useAdminAuth } from '@/components/admin/useAdminAuth';
import AdminAccessLock from '@/components/admin/AdminAccessLock';

/**
 * /admin/ai — Recommendation Intelligence Dashboard (Master Prompt 27)
 *
 * Aggregate health of the personalization & discovery system: signal volume,
 * explicit negative feedback, creator concentration (echo-chamber proxy),
 * new-creator reach (cold-start fairness), community/format mix, interest
 * graph + user control usage, and AI usage/cost/queue state. Computed from
 * real rows only — every number is labeled with what it measures and its
 * limits. Rollback signals for ranking experiments live here.
 * Protected by the shared admin gate.
 */

function StatCard({ icon, label, value, sub, tone = 'default' }) {
  const tones = { default: '', ok: 'text-emerald-400', warn: 'text-amber-400', danger: 'text-red-400' };
  return (
    <div className="bg-[#101014] border border-[#26262c] rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-mono uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-black ${tones[tone] || 'text-white'}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 font-mono">{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-6">
      <h2 className="text-xs font-mono uppercase tracking-widest text-[#ff4d00] mb-2">{title}</h2>
      <div className="bg-[#0a0a0e] border border-[#1d1d23] rounded-xl p-4">{children}</div>
    </div>
  );
}

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}

function pct(n) {
  if (n === null || n === undefined) return '—';
  return `${Math.round(Number(n) * 100)}%`;
}

export default function AdminAiPage() {
  const { authenticated, secret, busy, error: gateError, unlock } = useAdminAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/intelligence', {
        headers: { 'x-admin-password': secret },
        cache: 'no-store',
      });
      if (!res.ok) {
        setError(`Intelligence endpoint returned ${res.status}`);
        setData(null);
        return;
      }
      setData(await res.json());
    } catch (err) {
      setError(err?.message || 'Failed to load intelligence data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    if (authenticated && secret) load();
  }, [authenticated, secret, load]);

  if (!authenticated) {
    return (
      <AdminAccessLock title="Recommendation Intelligence" busy={busy} error={gateError} onSubmit={unlock} />
    );
  }

  const reco = data?.reco;
  const ai = data?.ai;
  const alerts = data?.alerts || [];
  const v = reco?.volume || {};
  const e = reco?.ecosystem || {};
  const i = reco?.interests || {};

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-[#ff4d00]" />
          <h1 className="font-black text-xl">Recommendation Intelligence</h1>
          <span className="text-[11px] font-mono text-zinc-500">
            {data ? `updated ${data.generatedAt?.slice(11, 19)} UTC · ${data.windowDays || 7}d window` : 'loading…'}
          </span>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 bg-[#101014] border border-[#26262c] rounded-lg px-3 py-1.5 text-xs font-mono hover:border-[#ff4d00]/50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {error && (
        <div className="bg-[#2a0a0a] border border-[#5a1a1a] rounded-xl p-4 text-sm text-red-400 mb-4">
          <AlertTriangle className="w-4 h-4 inline mr-2" />{error}
        </div>
      )}

      {reco?.available === false && (
        <div className="bg-[#2a1400] border border-[#5a3a00] rounded-xl p-4 text-sm text-amber-300 mb-4">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          Recommendation health unavailable{reco?.reason === 'reco_tables_missing' ? ' — the personalization tables are not present (apply migrations).' : ' — set the SUPABASE_SERVICE_ROLE_KEY to read aggregate signals (the anon key cannot see owner-scoped tables).'}
        </div>
      )}

      {reco?.available === true && (
        <>
          {/* Rollback signals (computed, actionable) */}
          {alerts.length > 0 && (
            <div className="space-y-2 mb-4">
              {alerts.map((a, i) => (
                <div key={i} className={`rounded-xl p-3 text-sm ${
                  a.level === 'warn'
                    ? 'bg-[#2a1400] border border-[#5a3a00] text-amber-300'
                    : 'bg-[#0f1a12] border border-[#1d3a2a] text-emerald-300'
                }`}>
                  {a.level === 'warn'
                    ? <AlertTriangle className="w-4 h-4 inline mr-2" />
                    : <Info className="w-4 h-4 inline mr-2" />}
                  {a.detail}
                </div>
              ))}
            </div>
          )}
          {alerts.length === 0 && (
            <div className="bg-[#0f1a12] border border-[#1d3a2a] rounded-xl p-3 text-sm text-emerald-300 mb-4">
              <Activity className="w-4 h-4 inline mr-2" />No recommendation health alerts in the window.
            </div>
          )}

          {/* Signal + feedback volume */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Activity className="w-3.5 h-3.5" />} label="Signals 7d" value={fmt(v.signals7d)} sub={`${fmt(v.signals24h)} in last 24h`} />
            <StatCard icon={<Eye className="w-3.5 h-3.5" />} label="Feed impressions" value={fmt(v.impressions7d)} sub="server-deduped content views" />
            <StatCard icon={<ThumbsDown className="w-3.5 h-3.5" />} label="Explicit negatives" value={fmt(v.negatives7d)} sub={`${fmt(v.negatives24h)} in 24h`} tone={v.negatives7d > 0 ? 'warn' : 'ok'} />
            <StatCard icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Negatives / 1k" value={fmt(v.negativeFeedbackPerKImpressions)} sub="trend indicator, not a precise rate" tone={v.negativeFeedbackPerKImpressions > 40 ? 'warn' : 'ok'} />
          </div>

          {/* Ecosystem + fairness */}
          <Section title="Ecosystem health & fairness (bounded engagement sample)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Users reached" value={fmt(e.creatorsReached7d)} sub={`of ${fmt(e.sampleSize)} sampled signals`} />
              <StatCard
                icon={<Share2 className="w-3.5 h-3.5" />}
                label="Top-10 concentration"
                value={e.top10Concentration === null ? '—' : `${Math.round(e.top10Concentration * 100)}%`}
                sub="top users' share of sample"
                tone={e.top10Concentration > 0.55 ? 'warn' : 'ok'}
              />
              <StatCard
                icon={<Sprout className="w-3.5 h-3.5" />}
                label="New-user share"
                value={pct(e.newCreatorShare)}
                sub={`${fmt(e.newCreatorCount)} users < 90 days old`}
                tone={e.newCreatorShare < 0.1 ? 'warn' : 'ok'}
              />
              <StatCard icon={<Network className="w-3.5 h-3.5" />} label="Communities reached" value={fmt(e.communitiesReached7d)} sub="distinct in sample" />
            </div>
            {(e.engagementEventCounts || []).length > 0 && (
              <div className="mt-3 text-[11px] text-zinc-500 font-mono">
                Formats: {(e.engagementEventCounts || []).map((t) => `${t.event}:${fmt(t.count)}`).join(' · ')}
              </div>
            )}
            <p className="mt-2 text-[11px] text-zinc-600 font-mono">
              Concentration and new-user share are measured over the most recent {fmt(e.sampleSize)} engagement
              signals (reactions, comments, replies, shares, follows, votes) — a bounded sample, never a census.
            </p>
          </Section>

          {/* Interest graph + user control */}
          <Section title="Interest graph & user control">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Layers className="w-3.5 h-3.5" />} label="Affinity rows" value={fmt(i.affinityRows)} sub="decaying interest graph" />
              <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Personalized" value={fmt(i.personalizedUsers)} sub="users with For You on" />
              <StatCard icon={<Activity className="w-3.5 h-3.5" />} label="Opted out" value={fmt(i.personalizationDisabled)} sub="explicit off" />
              <StatCard icon={<GitBranch className="w-3.5 h-3.5" />} label="Resets 7d" value={fmt(i.recentResets7d)} sub="interest resets" />
            </div>
          </Section>
        </>
      )}

      {/* AI subsystem */}
      <Section title="AI subsystem">
        {ai?.available === false ? (
          <p className="text-[11px] text-zinc-500 font-mono">
            AI usage unavailable{ai?.reason === 'ai_tables_missing' ? ' — the AI tables are not present (apply migrations).' : ' — set the SUPABASE_SERVICE_ROLE_KEY.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Cpu className="w-3.5 h-3.5" />} label="AI calls 7d" value={fmt(ai?.usage?.calls7d)} sub={`${fmt(ai?.usage?.failures7d)} failed`} />
            <StatCard
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              label="Failure rate"
              value={ai?.usage?.failureRatePct ? `${ai.usage.failureRatePct}%` : '—'}
              sub={`${fmt(ai?.usage?.fallbackCalls7d)} builtin fallbacks`}
              tone={ai?.usage?.failureRatePct > 10 ? 'warn' : 'ok'}
            />
            <StatCard icon={<Coins className="w-3.5 h-3.5" />} label="Est. cost 7d" value={ai?.usage?.estimatedCostUsd != null ? `$${ai.usage.estimatedCostUsd}` : '—'} sub="estimated provider cost" />
            <StatCard icon={<Timer className="w-3.5 h-3.5" />} label="Avg latency" value={ai?.usage?.avgLatencyMs != null ? `${ai.usage.avgLatencyMs}ms` : '—'} sub="successful calls" />
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <StatCard icon={<Inbox className="w-3.5 h-3.5" />} label="Jobs pending" value={ai?.available ? fmt(ai?.jobs?.pending) : '—'} sub={ai?.available ? 'background queue' : 'table unavailable'} tone={ai?.available && ai?.jobs?.pending > 50 ? 'warn' : 'ok'} />
          <StatCard icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Jobs failed 7d" value={ai?.available ? fmt(ai?.jobs?.failed7d) : '—'} sub="dead-letter visibility" />
          <StatCard icon={<Layers className="w-3.5 h-3.5" />} label="Content metadata" value={ai?.available ? fmt(ai?.coverage?.contentMetadataRows) : '—'} sub={`${fmt(ai?.coverage?.providerMetadataRows)} with real-provider evidence`} />
        </div>
        <p className="mt-3 text-[11px] text-zinc-600 font-mono leading-relaxed">
          AI metrics come from the append-only ai_usage_log (90-day retention) and the ai_jobs queue. Cost is an
          estimate from provider metadata — exact billing lives with the provider. The product never depends on AI:
          the builtin fallback chain keeps ranking and content understanding running without a provider key.
          Only <strong className="text-zinc-400">real-provider</strong> content metadata ({fmt(ai?.coverage?.providerMetadataRows)} rows)
          ever shapes the For You feed (a low-quality popularity dampener); builtin rows and missing metadata change nothing.
        </p>
      </Section>

      {/* Honest scope note */}
      <div className="mt-6">
        <div className="bg-[#0a0a0e] border border-[#1d1d23] rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 font-mono leading-relaxed flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Every figure is computed from real rows — nothing is fabricated. Concentration / new-user share are
              bounded samples; impression counts are deduped per item per day, so derived rates are trend indicators.
              This is the measurement layer for ranking experiments: a ranking change that trips the negative-feedback
              or concentration signals is a rollback candidate (docs/ai/AI_HEALTH.md). Full population analytics,
              offline eval baselines, and DB-backed ranking experiments remain staged work.
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
