'use client';

import React, { useState, useCallback } from 'react';
import { Loader2, Search } from 'lucide-react';

/**
 * /control/users — least-privilege USER lookup (support+).
 * Safe fields only. Enforcement reuses the existing audited safety APIs
 * (linked, never duplicated).
 */
export default function ControlUsersPage() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    const query = q.trim();
    if (query.length < 2) {
      setError('Type at least 2 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/control/users?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Lookup failed.');
        setUsers([]);
      } else {
        setUsers(body.users || []);
      }
      setSearched(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [q]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black text-white">User Operations</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); search(); }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Username or display name…"
          aria-label="Search users"
          className="min-h-[44px] flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder-zinc-600"
        />
        <button type="submit" disabled={loading} className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-black disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </form>
      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {searched && !loading && !users.length && !error && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-zinc-500">No users found.</p>
      )}
      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white">{u.display_name || u.username || 'User'}</span>
              {u.username && <span className="font-mono text-xs text-zinc-500">@{u.username}</span>}
              {u.is_banned
                ? <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-300">Banned</span>
                : (u.restrictions?.length
                  ? <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">Restricted</span>
                  : <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">Active</span>)}
              <span className="ml-auto font-mono text-[11px] text-zinc-600">{u.follower_count ?? 0} followers</span>
            </div>
            {u.bio && <p className="text-xs leading-relaxed text-zinc-400">{u.bio}</p>}
            {!!u.restrictions?.length && (
              <ul className="space-y-1">
                {u.restrictions.map((r, i) => (
                  <li key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[11px] text-amber-200">
                    {r.action_type}{r.reason ? ` — ${r.reason}` : ''}{r.expires_at ? ` until ${new Date(r.expires_at).toLocaleDateString()}` : ' (no expiry)'}
                  </li>
                ))}
              </ul>
            )}
            <p className="font-mono text-[11px] text-zinc-600">
              Enforcement uses the audited Moderation workspace — this view is read-only by design.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
