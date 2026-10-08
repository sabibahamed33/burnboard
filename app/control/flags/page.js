'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

/** /control/flags — effective flag inventory, read-only (operations+). */
export default function ControlFlagsPage() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/control/flags', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not load flags.');
        return;
      }
      setFlags(body.flags || []);
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
        <h1 className="text-lg font-black text-white">Feature Flags</h1>
        <button onClick={load} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-zinc-500">
        Read-only inventory. Effective value = environment override, else code default.
        The database table is declared intent only — runtime evaluation is code/env-driven by design.
      </p>
      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-white/10">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                <th scope="col" className="px-4 py-3">Flag</th>
                <th scope="col" className="px-4 py-3">Effective</th>
                <th scope="col" className="px-4 py-3">Code default</th>
                <th scope="col" className="px-4 py-3">Env override</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.name} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-zinc-200">{f.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 font-bold ${f.effective ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-zinc-400'}`}>
                      {f.effective ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-zinc-500">{String(f.code_default)}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-500">{f.env_override === null ? '—' : String(f.env_override)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
