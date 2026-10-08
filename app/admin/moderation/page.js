'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Loader2, RefreshCw, Flag, Gavel } from 'lucide-react';

/**
 * /admin/moderation — internal safety staff queue (NOT public).
 * Requires a platform moderator session (user_profiles.is_moderator/is_admin).
 * Prioritizes by severity; every action audited server-side.
 */
function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'border-white/10 bg-white/5 text-zinc-300',
    critical: 'border-red-500/40 bg-red-500/10 text-red-300',
    high: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
    ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tones[tone] || tones.default}`}>{children}</span>;
}

export default function AdminModerationPage() {
  const [tab, setTab] = useState('reports');
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');
  const [enforce, setEnforce] = useState({ userId: '', action: 'warn', actionType: 'comment', reason: '' });
  const [enforceMsg, setEnforceMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const endpoint = tab === 'reports' ? `/api/safety/moderation?status=${status}&limit=50` : `/api/safety/appeals?status=${status === 'open' ? 'open' : 'all'}&limit=50`;
      const res = await fetch(endpoint, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setError('Sign in with your safety staff account.'); setItems([]); return; }
      if (res.status === 403) { setError('Safety staff only — this queue is not public.'); setItems([]); return; }
      if (!res.ok) { setError(data.error || 'Could not load queue.'); setItems([]); return; }
      setItems(tab === 'reports' ? data.reports || [] : data.appeals || []);
      setTotal(data.total || 0);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tab, status]);

  useEffect(() => { load(); }, [load]);

  const act = async (report, action) => {
    setBusy(`${action}-${report.id}`);
    try {
      const res = await fetch('/api/safety/moderation', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id, action, moderatorNote: note || null }),
      });
      if (!res.ok) throw new Error('action');
      await load();
    } catch {
      setError('Action failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const contentAct = async (report, action) => {
    if (action === 'hide_content' && !window.confirm('Remove this content from public view? It can be restored later.')) return;
    setBusy(`${action}-${report.id}`);
    try {
      const res = await fetch('/api/safety/moderation', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id, action, moderatorNote: note || null }),
      });
      if (!res.ok) throw new Error('action');
      await load();
    } catch {
      setError('Action failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const decideAppeal = async (appeal, decision) => {
    setBusy(`${decision}-${appeal.id}`);
    try {
      const res = await fetch('/api/safety/appeals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appealId: appeal.id, decision, reviewerNote: note || null }),
      });
      if (!res.ok) throw new Error('action');
      await load();
    } catch {
      setError('Action failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const runEnforcement = async () => {
    setEnforceMsg('');
    if (!enforce.userId.trim() || !enforce.reason.trim()) { setEnforceMsg('User ID and reason are required.'); return; }
    if (['suspend', 'ban'].includes(enforce.action) && !window.confirm(`${enforce.action === 'ban' ? 'Ban' : 'Suspend'} this user? The user will be notified with an appeal path.`)) return;
    setBusy('enforce');
    try {
      const res = await fetch('/api/safety/enforcement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: enforce.userId.trim(), action: enforce.action, actionType: enforce.actionType, reason: enforce.reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setEnforceMsg(data.error || 'Enforcement failed.'); return; }
      setEnforceMsg(`Done: ${data.action}. User notified with appeal path.`);
      setEnforce({ userId: '', action: 'warn', actionType: 'comment', reason: '' });
    } finally {
      setBusy(null);
    }
  };

  const sevTone = (s) => (s === 'high' || s === 'critical' ? 'critical' : s === 'medium' ? 'high' : 'default');
  const sorted = [...items].sort((a, b) => {
    const rank = (x) => (x.severity === 'high' || x.severity === 'critical' ? 0 : x.status === 'escalated' ? 1 : 2);
    return rank(a) - rank(b) || new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-24 pt-6">
      <header className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
        <h1 className="flex items-center gap-2 text-xl font-black text-white"><Shield className="h-5 w-5 text-emerald-400" /> Safety Review Queue</h1>
        <p className="mt-1 text-sm text-zinc-400">Internal only. Sorted by severity — high-risk first. Reports are signals, never auto-proof.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="flex rounded-2xl border border-white/10 overflow-hidden" role="tablist" aria-label="Queue type">
            {['reports', 'appeals'].map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`min-h-[44px] px-4 text-xs font-bold capitalize ${tab === t ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>{t}</button>
            ))}
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"
            className="min-h-[44px] rounded-2xl border border-white/10 bg-black/40 px-3 text-xs text-white">
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="escalated">Escalated</option>
            <option value="all">All</option>
          </select>
          <button onClick={load} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-zinc-200">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh{total ? ` (${total})` : ''}
          </button>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (kept private from users)…"
          className="mt-3 w-full min-h-[44px] rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder-zinc-600" aria-label="Internal note" />
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : !sorted.length ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10 text-center text-sm text-zinc-500">Queue is clear. No real reports waiting.</div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => (
            <li key={r.id} className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Flag className="h-4 w-4 text-red-400" />
                <span className="text-sm font-bold text-white">{r.target_type} · {r.category || r.enforcement_type}</span>
                {r.severity && <Badge tone={sevTone(r.severity)}>{r.severity}</Badge>}
                {r.status && <Badge>{r.status}</Badge>}
                <span className="ml-auto text-[11px] text-zinc-500">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
              </div>
              <p className="break-all font-mono text-[11px] text-zinc-500">target: {r.target_id || r.enforcement_target_id}</p>
              {r.context && <p className="text-xs text-zinc-400 leading-relaxed">{r.context}</p>}
              {r.explanation && <p className="text-xs text-zinc-400 leading-relaxed">{r.explanation}</p>}
              <div className="flex flex-wrap gap-2">
                {tab === 'reports' ? (
                  <>
                    <button onClick={() => act(r, 'in_review')} disabled={!!busy} className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200">Take</button>
                    <button onClick={() => contentAct(r, 'restrict_content')} disabled={!!busy} className="min-h-[44px] rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-300">Limit</button>
                    <button onClick={() => contentAct(r, 'hide_content')} disabled={!!busy} className="min-h-[44px] rounded-xl border border-red-500/40 bg-red-500/10 px-3 text-xs font-bold text-red-300">Remove</button>
                    <button onClick={() => contentAct(r, 'restore_content')} disabled={!!busy} className="min-h-[44px] rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-300">Restore</button>
                    <button onClick={() => act(r, 'dismiss')} disabled={!!busy} className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-400">Dismiss</button>
                    <button onClick={() => act(r, 'resolve')} disabled={!!busy} className="min-h-[44px] rounded-xl bg-white px-3 text-xs font-bold text-black">Resolve</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => decideAppeal(r, 'reversed')} disabled={!!busy} className="min-h-[44px] rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-300">Reverse</button>
                    <button onClick={() => decideAppeal(r, 'upheld')} disabled={!!busy} className="min-h-[44px] rounded-xl bg-white px-3 text-xs font-bold text-black">Uphold</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-white"><Gavel className="h-4 w-4 text-amber-400" /> User enforcement</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={enforce.userId} onChange={(e) => setEnforce({ ...enforce, userId: e.target.value })} placeholder="User ID"
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder-zinc-600" aria-label="User ID" />
          <select value={enforce.action} onChange={(e) => setEnforce({ ...enforce, action: e.target.value })}
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white" aria-label="Enforcement action">
            <option value="warn">Warn</option>
            <option value="restrict">Restrict</option>
            <option value="lift">Lift restriction</option>
            <option value="suspend">Suspend</option>
            <option value="unsuspend">Unsuspend</option>
          </select>
          <select value={enforce.actionType} onChange={(e) => setEnforce({ ...enforce, actionType: e.target.value })}
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white" aria-label="Restriction scope">
            {['post', 'comment', 'community_create', 'community_join', 'challenge_create', 'invite', 'battle', 'report', 'all'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input value={enforce.reason} onChange={(e) => setEnforce({ ...enforce, reason: e.target.value })} placeholder="Reason (shown to user, no reporter info)"
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder-zinc-600" aria-label="Reason" />
        </div>
        {enforceMsg && <p className="text-xs text-zinc-300">{enforceMsg}</p>}
        <button onClick={runEnforcement} disabled={busy === 'enforce'}
          className="min-h-[44px] rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-50">
          {busy === 'enforce' ? 'Working…' : 'Apply + notify user'}
        </button>
      </section>
    </div>
  );
}
