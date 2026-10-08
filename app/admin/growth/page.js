'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, TrendingUp, Users, Flame, Link2, Network,
  Sprout, Building2, Globe2, AlertTriangle, Activity, RefreshCw,
  Share2, Repeat, Info,
} from 'lucide-react';
import { useAdminAuth } from '@/components/admin/useAdminAuth';
import AdminAccessLock from '@/components/admin/AdminAccessLock';

/**
 * /admin/growth — Global Growth Dashboard (Master Prompt 18)
 *
 * Read-only aggregate view over real platform data (service-role computed
 * server-side at /api/growth/analytics). No user-level data is ever shown.
 * Protected by the shared admin gate (MP26): server-verified against
 * ADMIN_PASSWORD, never a client-embedded default.
 */

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-[#101014] border border-[#26262c] rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-mono uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
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

export default function AdminGrowthPage() {
  const { authenticated, secret, busy, error: gateError, unlock } = useAdminAuth();
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, alertsRes] = await Promise.all([
        fetch('/api/growth/analytics?days=30', {
          headers: { 'x-admin-password': secret },
        }),
        fetch('/api/growth/alerts', {
          headers: { 'x-admin-password': secret },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!res.ok) {
        setError(`Analytics endpoint returned ${res.status}`);
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
      setAlerts(alertsRes?.alerts || []);
    } catch (err) {
      setError(err?.message || 'Failed to load growth analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated && secret) load();
  }, [authenticated, secret, load]);

  if (!authenticated) {
    return (
      <AdminAccessLock title="Growth Dashboard" busy={busy} error={gateError} onSubmit={unlock} />
    );
  }

  const s = data?.snapshot;
  const history = data?.history || [];
  const signupSeries = history
    .map((h) => ({ date: h.date, signups: h.data?.signups?.last7d ?? 0 }))
    .filter((h) => h.signups > 0);
  const maxSignups = Math.max(1, ...signupSeries.map((h) => h.signups));

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-[#ff4d00]" />
          <h1 className="font-black text-xl">Global Growth Dashboard</h1>
          <span className="text-[11px] font-mono text-zinc-500">
            {s ? `generated ${s.generatedAt?.slice(0, 19).replace('T', ' ')}` : 'no snapshot yet'}
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
          <AlertTriangle className="w-4 h-4 inline mr-2" />{error} — make sure the daily cleanup cron has run
          and the growth_analytics_foundation migration is applied.
        </div>
      )}

      {!s && !error && (
        <div className="text-zinc-500 text-sm">
          {loading ? 'Computing aggregate snapshot…' : 'No snapshot data yet. Run the daily cleanup cron (or GET /api/growth/snapshot) to capture the first snapshot.'}
        </div>
      )}

      {s && (
        <>
          {/* Growth Alerts (MP23) — retention cliffs, activation drops,
              referral abuse, signup anomalies. Shown even when snapshots are
              sparse: the alerts endpoint degrades to what data exists. */}
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
          {/* Fallback anomalies when the alerts endpoint is unreachable */}
          {alerts.length === 0 && (s.anomalies || []).filter((a) => a.level === 'warn').map((a, i) => (
            <div key={i} className="bg-[#2a1400] border border-[#5a3a00] rounded-xl p-3 text-sm text-amber-300 mb-4">
              <AlertTriangle className="w-4 h-4 inline mr-2" />{a.detail}
            </div>
          ))}

          {/* North Star + funnel core */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Weekly Active" value={fmt(s.active?.wau)} sub={`DAU ${fmt(s.active?.dau)} · MAU ${fmt(s.active?.mau)} · ${s.active?.dauMauPct ?? '—'}% DAU/MAU`} />
            <StatCard icon={<Flame className="w-3.5 h-3.5" />} label="Activation (7d)" value={fmt(s.activation?.activated7d)} sub={`${s.activation?.activationRatePct ?? '—'}% of 7d signups`} />
            <StatCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Signups" value={fmt(s.signups?.total)} sub={`+${fmt(s.signups?.last7d)} this week · +${fmt(s.signups?.last30d)} 30d`} />
            <StatCard icon={<Link2 className="w-3.5 h-3.5" />} label="Referrals (7d)" value={fmt(s.referral?.conversions7d)} sub={`${s.referral?.conversionRatePct ?? '—'}% conversion · ${fmt(s.referral?.visits7d)} visits`} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <StatCard icon={<Network className="w-3.5 h-3.5" />} label="Network" value={fmt(s.network?.followsPerActiveUser)} sub={`${fmt(s.network?.totalFollows)} follows · ${fmt(s.network?.activeUsers30d)} actives`} />
            <StatCard icon={<Sprout className="w-3.5 h-3.5" />} label="Authors (7d)" value={fmt(s.creators?.active7d)} sub="authors with content" />
            <StatCard icon={<Building2 className="w-3.5 h-3.5" />} label="Communities" value={fmt(s.communities?.total)} sub={`+${fmt(s.communities?.new7d)} new · ${fmt(s.communities?.active7d)} active`} />
            <StatCard icon={<Globe2 className="w-3.5 h-3.5" />} label="Regions" value={(s.regions || []).length} sub={(s.regions || []).slice(0, 3).map((r) => `${r.locale}:${r.users}`).join(' · ')} />
          </div>

          {/* Viral loop health (MP23) */}
          <Section title="Viral Loop Health (7d)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Share2 className="w-3.5 h-3.5" />} label="Shares" value={fmt(s.shares?.total7d)} sub="real share events" />
              <StatCard icon={<Repeat className="w-3.5 h-3.5" />} label="K-Factor" value={s.virality?.kFactorEstimate ?? '—'} sub="conversions / inviting users" />
              <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Inviting Users" value={fmt(s.virality?.invitingUsers7d)} sub="referrers with a conversion" />
              <StatCard icon={<Link2 className="w-3.5 h-3.5" />} label="Activated Referrals" value={fmt(s.referral?.activatedConverted7d)} sub="converted + first-value (7d)" />
            </div>
            {(s.shares?.byChannel || []).length > 0 && (
              <div className="mt-3 text-[11px] text-zinc-500 font-mono">
                Channels: {(s.shares?.byChannel || []).slice(0, 6).map((c) => `${c.channel}:${fmt(c.cnt)}`).join(' · ')}
              </div>
            )}
            <p className="mt-2 text-[11px] text-zinc-600 font-mono">
              K-factor is a direction indicator only — judge it alongside activation & retention cohorts, never alone.
            </p>
          </Section>

          {/* Cohort retention */}
          <Section title="Cohort Retention (weekly signup cohorts)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="text-zinc-500 text-[11px] uppercase tracking-wider">
                    <th className="text-left py-1 pr-4">Cohort</th>
                    <th className="text-right py-1 pr-4">Size</th>
                    <th className="text-right py-1 pr-4">D1</th>
                    <th className="text-right py-1 pr-4">D7</th>
                    <th className="text-right py-1 pr-4">D30</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.cohorts || []).slice(-10).reverse().map((c) => (
                    <tr key={c.cohort} className="border-t border-[#1d1d23]">
                      <td className="py-2 pr-4 text-zinc-300">{c.cohort}</td>
                      <td className="py-2 pr-4 text-right">{fmt(c.size)}</td>
                      <td className="py-2 pr-4 text-right text-zinc-300">{c.d1_pct ?? '—'}%</td>
                      <td className="py-2 pr-4 text-right text-zinc-300">{c.d7_pct ?? '—'}%</td>
                      <td className="py-2 pr-4 text-right text-zinc-300">{c.d30_pct ?? '—'}%</td>
                    </tr>
                  ))}
                  {(!s.cohorts || s.cohorts.length === 0) && (
                    <tr><td colSpan={5} className="py-3 text-zinc-500">No cohort data yet (needs signups + activity).</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Snapshot history sparkline */}
          <Section title="Weekly Signups (snapshot history)">
            {signupSeries.length > 0 ? (
              <div className="flex items-end gap-1 h-20">
                {signupSeries.map((h) => (
                  <div key={h.date} title={`${h.date}: ${h.signups}`} className="flex-1 bg-[#ff4d00]/70 hover:bg-[#ff4d00] rounded-t"
                    style={{ height: `${Math.max(4, (h.signups / maxSignups) * 100)}%` }} />
                ))}
              </div>
            ) : (
              <div className="text-zinc-500 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" /> Snapshots accumulate daily from the cleanup cron.
              </div>
            )}
          </Section>
        </>
      )}
    </main>
  );
}