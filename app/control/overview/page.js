'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

/** /control/overview — real metrics only; null renders "Data unavailable". */
function Metric({ label, value }) {
  const display = value === null || value === undefined ? 'Data unavailable' : Number(value).toLocaleString();
  const missing = value === null || value === undefined;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${missing ? 'text-xs font-semibold text-zinc-600' : 'text-white'}`}>{display}</p>
    </div>
  );
}

export default function ControlOverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/control/overview', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not load overview.');
        setData(null);
        return;
      }
      setData(body);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mod = data?.moderation || {};
  const growth = data?.growth?.data || data?.growth || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-white">Platform Overview</h1>
        <button onClick={load} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : (
        <>
          <section aria-label="Trust and safety">
            <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Trust & Safety (live)</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric label="Open reports" value={mod.open_reports} />
              <Metric label="Escalated" value={mod.escalated_reports} />
              <Metric label="Mod actions 24h" value={mod.moderation_actions_24h} />
              <Metric label="High-risk 24h" value={mod.high_risk_events_24h} />
              <Metric label="Banned users" value={mod.banned_users} />
            </div>
          </section>
          <section aria-label="Growth snapshot">
            <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Growth snapshot (latest saved)</h2>
            {growth && Object.keys(growth).length ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {['dau', 'wau', 'mau', 'signups_7d', 'activation_rate_7d', 'referral_conversions_7d', 'shares_7d', 'posts_7d'].map((k) => (
                  <Metric key={k} label={k.replace(/_/g, ' ')} value={typeof growth[k] === 'number' ? growth[k] : null} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-zinc-500">Data unavailable — no saved snapshot yet.</p>
            )}
          </section>
          <p className="font-mono text-[11px] text-zinc-600">Fetched {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : '—'} · unsupported metrics show as unavailable, never estimated.</p>
        </>
      )}
    </div>
  );
}
