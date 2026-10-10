'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Play, AlertTriangle } from 'lucide-react';

/** /control/observability — real telemetry only; gaps render honestly. */
const WINDOWS = [
  { key: '1h', label: '1h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
];
const SEVS = [
  { key: '', label: 'All severities' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

function Card({ title, children }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl" aria-label={title}>
      <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}

function SevBadge({ sev }) {
  const tone = sev === 'critical'
    ? 'border-red-500/50 bg-red-500/15 text-red-300'
    : sev === 'high'
      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
      : 'border-white/10 bg-white/5 text-zinc-300';
  return <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${tone}`}>{sev}</span>;
}

function Unavailable({ what }) {
  return <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-zinc-500">Data unavailable — {what}</p>;
}

export default function ObservabilityPage() {
  const [window, setWindow] = useState('24h');
  const [severity, setSeverity] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ window });
      if (severity) params.set('severity', severity);
      const res = await fetch(`/api/control/observability?${params}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not load observability.');
        setData(null);
        return;
      }
      setData(body);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [window, severity]);

  useEffect(() => { load(); }, [load]);

  const runChecks = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/control/observability', { method: 'POST', cache: 'no-store' });
      await res.json().catch(() => ({}));
    } catch {}
    setRunning(false);
    load();
  }, [load]);

  const stats = data?.errors?.stats;
  const groups = data?.errors?.groups || [];
  const synthetic = data?.synthetic;
  const alerts = data?.alerts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-black text-white">Observability</h1>
        <span className="font-mono text-[11px] text-zinc-600">
          {data?.fetchedAt ? `fresh · ${new Date(data.fetchedAt).toLocaleTimeString()}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setWindow(w.key)}
                aria-pressed={window === w.key}
                className={`min-h-[40px] rounded-xl px-3 font-mono text-xs font-bold ${window === w.key ? 'bg-white text-black' : 'border border-white/10 text-zinc-400'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Severity filter"
            className="min-h-[40px] rounded-xl border border-white/10 bg-black/40 px-3 font-mono text-xs text-zinc-200"
          >
            {SEVS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button onClick={load} className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200" aria-label="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={runChecks} disabled={running} className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-black disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run checks
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading" /></div>
      ) : !data ? null : (
        <>
          <Card title="Application health">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <span className="font-mono text-xs text-zinc-400">app</span>
                <span className="font-mono text-xs font-bold text-emerald-300">{data.health?.app?.status ?? 'unavailable'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <span className="font-mono text-xs text-zinc-400">database</span>
                <span className="font-mono text-xs font-bold text-zinc-200">
                  {data.health?.database?.status === 'ok'
                    ? `ok · ${data.health.database.latencyMs}ms`
                    : (data.health?.database?.status ?? 'unavailable')}
                </span>
              </div>
            </div>
            <p className="mt-2 font-mono text-[11px] text-zinc-600">
              deployment {data.deployment?.commit ?? 'unavailable'} · {data.deployment?.env ?? ''} · {data.deployment?.status ?? ''}
            </p>
          </Card>

          <Card title={`Errors · ${window} (${stats?.total ?? 0} events, ${stats?.activeGroups ?? 0} groups, ${stats?.last15m ?? 0} in 15m)`}>
            {groups.length === 0 ? (
              <Unavailable what="no error groups in this window on this instance." />
            ) : (
              <div className="space-y-2">
                {groups.slice(0, 20).map((g) => (
                  <div key={g.fingerprint} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <SevBadge sev={g.severity} />
                      <span className="font-mono text-xs font-bold text-white">{g.kind}</span>
                      <span className="font-mono text-[11px] text-zinc-500">{g.route}</span>
                      <span className="ml-auto font-mono text-[11px] text-zinc-400">{g.count}x · last {new Date(g.lastSeen).toLocaleTimeString()}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">{g.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Synthetic checks">
            {!synthetic || synthetic.status === 'never_run' ? (
              <Unavailable what="no synthetic run yet on this instance — press Run checks." />
            ) : (
              <div className="space-y-1.5">
                <p className="font-mono text-[11px] text-zinc-500">
                  {synthetic.runnablePassed}/{synthetic.runnable} runnable passed · {synthetic.at ? new Date(synthetic.at).toLocaleString() : ''}
                </p>
                {(synthetic.checks || []).map((c) => (
                  <div key={c.name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <span aria-hidden="true">{c.configured === false ? '⚪' : c.ok ? '🟢' : '🔴'}</span>
                    <span className="font-mono text-xs text-zinc-200">{c.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-zinc-500">
                      {c.configured === false ? 'Monitoring not configured' : `${c.status ?? '—'} · ${c.ms ?? '—'}ms`}
                    </span>
                  </div>
                ))}
                {(synthetic.checks || []).some((c) => c.configured === false) && (
                  <p className="font-mono text-[11px] text-zinc-600">Authenticated journeys need TEST_* credentials — documented, never faked.</p>
                )}
              </div>
            )}
          </Card>

          <Card title="Alerts">
            {!alerts?.configured ? (
              <p className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center text-xs text-amber-200/80">
                Monitoring not configured — set OBS_ALERT_WEBHOOK_URL to activate delivery. Detections still record below.
              </p>
            ) : (
              <p className="font-mono text-[11px] text-emerald-300/80">Alert delivery configured.</p>
            )}
            {(alerts?.pending || []).length === 0 ? (
              <p className="mt-2 font-mono text-[11px] text-zinc-600">No alerts fired on this instance yet.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {(alerts.pending || []).slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{a.title}</p>
                      <p className="font-mono text-[11px] text-zinc-500">{a.severity} · {a.delivered ? 'delivered' : (a.reason || 'pending')} · {a.at}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Performance budgets">
            <div className="space-y-1.5">
              {(data.budgets || []).map((b) => (
                <div key={b.metric} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <span className="font-mono text-xs font-bold text-zinc-200">{b.metric}</span>
                  <span className="font-mono text-[11px] text-zinc-500">budget {b.budget} · {b.basis}</span>
                  <span className="ml-auto text-right font-mono text-[11px] text-zinc-400">{b.observed}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
