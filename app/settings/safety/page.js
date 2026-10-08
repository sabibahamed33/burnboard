'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Shield, Loader2, UserX, VolumeX, Flag, Gavel, Check } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const CONTROLS = [
  { key: 'roast_control', label: 'Who can roast you', hint: 'Playful roasts stay fun when you choose the crowd.' },
  { key: 'comment_control', label: 'Who can comment', hint: 'Control replies on your posts.' },
  { key: 'mention_control', label: 'Who can mention you', hint: 'Reduce unwanted callouts.' },
  { key: 'tag_control', label: 'Who can tag you', hint: 'Approve the spotlight on your terms.' },
  { key: 'message_control', label: 'Who can message you', hint: 'Requests from others wait for approval.' },
];
const OPTIONS = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'people_i_follow', label: 'People I follow' },
  { id: 'followers', label: 'Followers' },
  { id: 'nobody', label: 'Nobody' },
];

function Section({ icon, title, children }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-white tracking-wide">{icon}{title}</h2>
      {children}
    </section>
  );
}

export default function SafetyCenterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [settings, setSettings] = useState(null);
  const [mine, setMine] = useState(null);
  const [usernames, setUsernames] = useState({});
  const [busy, setBusy] = useState(null);
  const [appealForm, setAppealForm] = useState({ type: 'content_removal', targetType: 'social_post', targetId: '', explanation: '' });
  const [appealMsg, setAppealMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isSupabaseConfigured && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth'); return; }
      }
      const [sRes, mRes] = await Promise.all([fetch('/api/safety/settings'), fetch('/api/safety/mine')]);
      if (!sRes.ok || !mRes.ok) throw new Error('load');
      const s = await sRes.json();
      const m = await mRes.json();
      setSettings(s.settings);
      setMine(m);
      const ids = [...(m.blocks || []).map((b) => b.userId), ...(m.mutes || []).map((x) => x.userId)];
      if (ids.length) {
        const uRes = await fetch(`/api/safety/users?ids=${encodeURIComponent(ids.slice(0, 50).join(','))}`);
        if (uRes.ok) {
          const u = await uRes.json();
          const map = {};
          for (const p of u.users || []) map[p.id] = p.username ? `@${p.username}` : 'User';
          setUsernames(map);
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const saveControl = async (key, value) => {
    setBusy(key);
    setSaved('');
    try {
      const res = await fetch('/api/safety/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('save');
      const data = await res.json();
      setSettings(data.settings);
      setSaved('Saved');
      setTimeout(() => setSaved(''), 2000);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const toggleList = async (kind, userId) => {
    const endpoint = kind === 'block' ? '/api/safety/blocks' : '/api/safety/mutes';
    setBusy(`${kind}-${userId}`);
    try {
      const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
      if (!res.ok) throw new Error('remove');
      await load();
    } catch {
      setError('Could not update. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const submitAppeal = async () => {
    setAppealMsg('');
    if (!appealForm.targetId.trim() || !appealForm.explanation.trim()) { setAppealMsg('Add the content ID and a short explanation.'); return; }
    setBusy('appeal');
    try {
      const res = await fetch('/api/safety/appeals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enforcementType: appealForm.type,
          enforcementTargetType: appealForm.targetType,
          enforcementTargetId: appealForm.targetId.trim(),
          explanation: appealForm.explanation.trim().slice(0, 1000),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setAppealMsg(data.error || 'Could not submit appeal.'); return; }
      setAppealMsg('Appeal submitted — we will review it.');
      setAppealForm({ type: 'content_removal', targetType: 'social_post', targetId: '', explanation: '' });
      const mRes = await fetch('/api/safety/mine');
      if (mRes.ok) setMine(await mRes.json());
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center px-4">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-6">
      <Link href="/settings/profile" className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <header className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] backdrop-blur-xl p-6">
        <h1 className="flex items-center gap-2 text-xl font-black text-white"><Shield className="h-5 w-5 text-emerald-400" /> Safety &amp; Privacy</h1>
        <p className="mt-1 text-sm text-zinc-400">Block, mute, report, control — all in one calm place. You&rsquo;re a <span className="text-zinc-200 font-semibold">user</span> here; everyone gets the same tools.</p>
        {saved && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3.5 w-3.5" />{saved}</p>}
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      <Section icon={<UserX className="h-4 w-4 text-red-400" />} title={`Blocked (${mine?.blocks?.length || 0})`}>
        {!mine?.blocks?.length ? <p className="text-sm text-zinc-500">Nobody blocked. Blocking removes follows both ways and hides each other everywhere.</p> :
          <ul className="space-y-2">
            {mine.blocks.map((b) => (
              <li key={b.userId} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
                <span className="text-sm text-zinc-200">{usernames[b.userId] || 'User'}</span>
                <button onClick={() => toggleList('block', b.userId)} disabled={busy === `block-${b.userId}`}
                  className="min-h-[44px] rounded-xl px-3 text-xs font-bold text-zinc-300 hover:text-white">
                  {busy === `block-${b.userId}` ? 'Working…' : 'Unblock'}
                </button>
              </li>
            ))}
          </ul>}
      </Section>

      <Section icon={<VolumeX className="h-4 w-4 text-amber-400" />} title={`Muted (${mine?.mutes?.length || 0})`}>
        {!mine?.mutes?.length ? <p className="text-sm text-zinc-500">Nobody muted. Muting is silent — they&rsquo;ll never know.</p> :
          <ul className="space-y-2">
            {mine.mutes.map((m) => (
              <li key={m.userId} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
                <span className="text-sm text-zinc-200">{usernames[m.userId] || 'User'}</span>
                <button onClick={() => toggleList('mute', m.userId)} disabled={busy === `mute-${m.userId}`}
                  className="min-h-[44px] rounded-xl px-3 text-xs font-bold text-zinc-300 hover:text-white">
                  {busy === `mute-${m.userId}` ? 'Working…' : 'Unmute'}
                </button>
              </li>
            ))}
          </ul>}
      </Section>

      <Section icon={<Shield className="h-4 w-4 text-sky-400" />} title="Interaction controls">
        {CONTROLS.map((c) => (
          <div key={c.key} className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-bold text-white">{c.label}</p>
            <p className="text-xs text-zinc-500">{c.hint}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={c.label}>
              {OPTIONS.map((o) => (
                <button key={o.id} role="radio" aria-checked={settings?.[c.key] === o.id}
                  onClick={() => saveControl(c.key, o.id)} disabled={busy === c.key}
                  className={`min-h-[44px] rounded-xl border px-2 py-2 text-xs font-semibold transition-all ${
                    settings?.[c.key] === o.id ? 'border-sky-500/50 bg-sky-500/10 text-sky-200' : 'border-white/10 bg-black/30 text-zinc-400 hover:border-white/25'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section icon={<Flag className="h-4 w-4 text-red-400" />} title={`My reports (${mine?.reports?.length || 0})`}>
        {!mine?.reports?.length ? <p className="text-sm text-zinc-500">No reports yet. Thanks for keeping BurnBoard human.</p> :
          <ul className="space-y-2">
            {mine.reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs">
                <span className="text-zinc-300">{r.targetType} · {r.category}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold text-zinc-300">{r.status}</span>
              </li>
            ))}
          </ul>}
      </Section>

      {!!mine?.restrictions?.length && (
        <Section icon={<Gavel className="h-4 w-4 text-amber-400" />} title="Account notices">
          <ul className="space-y-2">
            {mine.restrictions.map((r, i) => (
              <li key={i} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                Limited: <b>{r.action_type}</b>{r.reason ? ` — ${r.reason}` : ''}{r.expires_at ? ` until ${new Date(r.expires_at).toLocaleDateString()}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon={<Gavel className="h-4 w-4 text-violet-400" />} title="Appeal a decision">
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={appealForm.type} onChange={(e) => setAppealForm({ ...appealForm, type: e.target.value })}
              className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white" aria-label="Enforcement type">
              <option value="content_removal">Content removal</option>
              <option value="content_restriction">Content restriction</option>
              <option value="account_restriction">Account restriction</option>
              <option value="account_ban">Suspension</option>
            </select>
            <select value={appealForm.targetType} onChange={(e) => setAppealForm({ ...appealForm, targetType: e.target.value })}
              className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white" aria-label="Content type">
              <option value="social_post">Post</option>
              <option value="comment">Comment</option>
              <option value="user">Account</option>
              <option value="roast">Roast</option>
            </select>
          </div>
          <input value={appealForm.targetId} onChange={(e) => setAppealForm({ ...appealForm, targetId: e.target.value })}
            placeholder="Content or notice ID (from your notification)"
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white placeholder-zinc-600" aria-label="Content ID" />
          <textarea value={appealForm.explanation} onChange={(e) => setAppealForm({ ...appealForm, explanation: e.target.value })}
            placeholder="Why should we take another look?"
            rows={3} maxLength={1000}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder-zinc-600 resize-none" aria-label="Appeal explanation" />
          {appealMsg && <p className="text-xs text-zinc-300">{appealMsg}</p>}
          <button onClick={submitAppeal} disabled={busy === 'appeal'}
            className="min-h-[44px] rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black hover:bg-zinc-200 disabled:opacity-50">
            {busy === 'appeal' ? 'Submitting…' : 'Submit appeal'}
          </button>
        </div>
        {!!mine?.appeals?.length && (
          <ul className="space-y-2 pt-2">
            {mine.appeals.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs">
                <span className="text-zinc-300">{a.enforcementType} · {a.targetType}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold text-zinc-300">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
