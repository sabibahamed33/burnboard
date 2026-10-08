'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Plus } from 'lucide-react';

/** /control/incidents — SEV tracking (all staff read; operations+ write). */
const SEVS = ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'];
const STATUSES = ['open', 'investigating', 'mitigated', 'resolved'];

function SevBadge({ sev }) {
  const tone = sev === 'SEV-1'
    ? 'border-red-500/50 bg-red-500/15 text-red-300'
    : sev === 'SEV-2'
      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
      : 'border-white/10 bg-white/5 text-zinc-300';
  return <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${tone}`}>{sev}</span>;
}

export default function ControlIncidentsPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', severity: 'SEV-4', subsystem: '' });
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/control/incidents?status=${status}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not load incidents.');
        return;
      }
      setItems(body.incidents || []);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const open = async () => {
    if (form.title.trim().length < 4) {
      setError('Give the incident a short title.');
      return;
    }
    setBusy('open');
    setError('');
    try {
      const res = await fetch('/api/control/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title.trim(), severity: form.severity, subsystem: form.subsystem.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not open incident.');
        return;
      }
      setForm({ title: '', severity: 'SEV-4', subsystem: '' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const update = async (id, patch) => {
    setBusy(id);
    try {
      const res = await fetch('/api/control/incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch, note: note || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Update failed.');
        return;
      }
      setNote('');
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-white">Incidents</h1>
        <div className="flex gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"
            className="min-h-[44px] rounded-2xl border border-white/10 bg-black/40 px-3 text-xs text-white">
            {['open', 'investigating', 'mitigated', 'resolved', 'all'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={load} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <section aria-label="Open incident" className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Open incident</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_130px_150px]">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Short title (e.g. Feed latency spike)" aria-label="Incident title"
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder-zinc-600" />
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} aria-label="Severity"
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white">
            {SEVS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={form.subsystem} onChange={(e) => setForm({ ...form, subsystem: e.target.value })}
            placeholder="Subsystem" aria-label="Subsystem"
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder-zinc-600" />
        </div>
        <button onClick={open} disabled={busy === 'open'} className="min-h-[44px] rounded-2xl bg-white px-5 text-sm font-bold text-black disabled:opacity-50">
          {busy === 'open' ? 'Opening…' : 'Open incident'}
        </button>
      </section>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : !items.length ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-zinc-500">No incidents in this state.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <SevBadge sev={i.severity} />
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-300">{i.status}</span>
                {i.subsystem && <span className="font-mono text-[11px] text-zinc-500">{i.subsystem}</span>}
                <span className="ml-auto font-mono text-[11px] text-zinc-600">{i.created_at ? new Date(i.created_at).toLocaleString() : ''}</span>
              </div>
              <p className="text-sm font-bold text-white">{i.title}</p>
              {!!i.timeline?.length && (
                <ul className="space-y-1 border-l border-white/10 pl-3">
                  {i.timeline.slice(-4).map((t, n) => (
                    <li key={n} className="font-mono text-[11px] text-zinc-500">
                      {t.at ? new Date(t.at).toLocaleString() : ''} — {t.note}
                    </li>
                  ))}
                </ul>
              )}
              {i.resolution && <p className="text-xs leading-relaxed text-emerald-300/90">Resolution: {i.resolution}</p>}
              <div className="flex flex-wrap gap-2">
                <select defaultValue="" onChange={(e) => e.target.value && update(i.id, { status: e.target.value })} aria-label={`Change status for ${i.title}`}
                  className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white" disabled={!!busy}>
                  <option value="">Set status…</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Timeline note or resolution…"
                  aria-label="Timeline note" className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white placeholder-zinc-600" />
                <button onClick={() => update(i.id, { note: note || 'Status updated' })} disabled={!!busy}
                  className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200 disabled:opacity-50">
                  Add note
                </button>
                <button onClick={() => note && update(i.id, { status: 'resolved', resolution: note })} disabled={!!busy || !note}
                  className="min-h-[44px] rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-xs font-bold text-emerald-300 disabled:opacity-50">
                  Resolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
