'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

/** /control/health — real signals only; unreachable reads as unavailable. */
function Row({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="font-mono text-xs text-zinc-400">{label}</span>
      <span className={`font-mono text-xs font-bold ${ok === true ? 'text-emerald-300' : ok === false ? 'text-red-300' : 'text-zinc-500'}`}>
        {value}
      </span>
    </div>
  );
}

export default function ControlHealthPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/control/health', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not load health.');
        return;
      }
      setHealth(body.health);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-white">System Health</h1>
        <button onClick={load} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : health ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Row label="app" value={health.app?.status ?? 'unavailable'} ok={health.app?.status === 'ok'} />
          <Row label="database" value={health.database?.status === 'ok' ? `ok · ${health.database.latencyMs}ms` : (health.database?.status ?? 'unavailable')} ok={health.database?.status === 'ok' ? true : health.database?.status === 'error' ? false : null} />
          <Row label="open reports" value={health.queues?.open_reports ?? 'unavailable'} ok={health.queues?.open_reports === null || health.queues?.open_reports === undefined ? null : true} />
          <Row label="escalated reports" value={health.queues?.escalated_reports ?? 'unavailable'} ok={health.queues?.escalated_reports === null || health.queues?.escalated_reports === undefined ? null : (health.queues.escalated_reports > 0 ? false : true)} />
          <Row label="cache" value={health.cache ? 'reporting' : 'unavailable'} ok={health.cache ? true : null} />
          <Row label="rate limiter" value={health.rate_limiter ? 'reporting' : 'unavailable'} ok={health.rate_limiter ? true : null} />
        </div>
      ) : null}
      <p className="font-mono text-[11px] text-zinc-600">No secrets or environment values are ever displayed here. Queue depth doubles as reliability signal.</p>
    </div>
  );
}
