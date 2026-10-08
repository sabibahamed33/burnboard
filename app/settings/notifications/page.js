'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Loader2, Check } from 'lucide-react';

/**
 * Settings → Notifications (USER preferences).
 * Toggle non-essential categories. Safety and critical account notices
 * have no toggle — they are always delivered, by design.
 */
const ROWS = [
  { key: 'follow_alerts', label: 'Follows', hint: 'Someone follows you.' },
  { key: 'roast_alerts', label: 'Roasts & reactions', hint: 'Roasts, comments, replies, mentions, reactions.' },
  { key: 'dm_alerts', label: 'Messages', hint: 'New messages and message requests.' },
  { key: 'battle_alerts', label: 'Battles', hint: 'Invites, results, and Battle updates.' },
  { key: 'upvote_alerts', label: 'Leaderboards', hint: 'Ranking and leaderboard updates.' },
  { key: 'levelup_alerts', label: 'Levels & achievements', hint: 'Level-ups and unlocked achievements.' },
  { key: 'push_enabled', label: 'Push on this device', hint: 'Browser notifications when BurnBoard is open.' },
  { key: 'email_notifications', label: 'Email updates', hint: 'Recaps and important email. Never spam.' },
];

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/account/notifications', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/auth';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error('load');
      setPrefs(data.prefs || {});
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key, value) => {
    setSaving(key);
    setError('');
    try {
      const res = await fetch('/api/account/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('save');
      setPrefs((p) => ({ ...p, [key]: value }));
      setSaved('Saved');
      setTimeout(() => setSaved(''), 2000);
      try {
        fetch('/api/growth/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'notification_preference_changed', metadata: { key: value } }),
        }).catch(() => {});
      } catch {}
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-6">
      <Link href="/settings/profile" className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <header className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] backdrop-blur-xl p-6">
        <h1 className="flex items-center gap-2 text-xl font-black text-white"><Bell className="h-5 w-5 text-amber-400" /> Notifications</h1>
        <p className="mt-1 text-sm text-zinc-400">Choose what nudges you. Safety and account notices always stay on.</p>
        {saved && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3.5 w-3.5" />{saved}</p>}
      </header>
      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-3 space-y-1" aria-label="Notification preferences">
          {ROWS.map((r) => {
            const on = prefs?.[r.key] !== false;
            const busy = saving === r.key;
            return (
              <div key={r.key} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{r.label}</p>
                  <p className="text-xs text-zinc-500">{r.hint}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={on}
                  aria-label={r.label}
                  disabled={busy}
                  onClick={() => toggle(r.key, !on)}
                  className={`relative h-8 w-[52px] shrink-0 rounded-full border transition-all min-h-[32px] ${on ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-white/15 bg-white/5'}`}
                >
                  <span className={`absolute top-1 h-[22px] w-[22px] rounded-full transition-all ${on ? 'left-[26px] bg-emerald-400' : 'left-1 bg-zinc-500'}`} />
                </button>
              </div>
            );
          })}
        </section>
      )}
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-5 py-4 text-xs leading-relaxed text-zinc-500">
        Safety notices, restriction updates, and appeal decisions are always delivered —
        muting the world never mutes your own account safety.
      </div>
    </div>
  );
}
