'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

/** /control/audit — immutable trail (admin+). No edit path exists. */
export default function ControlAuditPage() {
  const [entries, setEntries] = useState([]);
  const [moderation, setModeration] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/control/audit?limit=50', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not load audit trail.');
        return;
      }
      setEntries(body.entries || []);
      setModeration(body.moderation || []);
      setTotal(body.total || 0);
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
        <h1 className="text-lg font-black text-white">Audit Logs {total ? <span className="font-mono text-xs font-normal text-zinc-500">({total})</span> : null}</h1>
        <button onClick={load} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : (
        <>
          <section aria-label="Admin actions">
            <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Privileged actions</h2>
            {!entries.length ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-zinc-500">No audit entries yet.</p>
            ) : (
              <ul className="space-y-2">
                {entries.map((e) => (
                  <li key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-white">{e.action}</span>
                      <span className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-zinc-400">{e.role_used}</span>
                      <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${e.result === 'ok' ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300'}`}>{e.result}</span>
                      <span className="ml-auto font-mono text-[11px] text-zinc-600">{e.created_at ? new Date(e.created_at).toLocaleString() : ''}</span>
                    </div>
                    {(e.target_type || e.reason) && (
                      <p className="mt-1 font-mono text-[11px] text-zinc-500">
                        {[e.target_type, e.target_id, e.reason].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Moderation actions">
            <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Recent moderation actions</h2>
            {!moderation.length ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-zinc-500">No moderation actions yet.</p>
            ) : (
              <ul className="space-y-2">
                {moderation.map((m) => (
                  <li key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-[11px] text-zinc-400">
                    <span className="font-bold text-zinc-200">{m.action_type}</span> · {m.target_type} · {String(m.target_id || '').slice(0, 12)}
                    <span className="float-right text-zinc-600">{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
