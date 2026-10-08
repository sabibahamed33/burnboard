'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FileText, CalendarClock, Trash2, Upload, Loader2, EyeOff } from 'lucide-react';

/**
 * DraftsShelf — owner-only private drafts + scheduled posts.
 *
 * Lists the viewer's own unpublished posts (drafts, scheduled) with
 * Publish / Delete actions. Never rendered for other viewers — the API
 * itself is owner-only, this is purely a UI gate.
 */
export default function DraftsShelf({ userId, enabled }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchDrafts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/profile/content?user_id=${userId}&filter=drafts&limit=20`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDrafts(data.items || []);
    } catch {} finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    if (enabled && userId) fetchDrafts();
  }, [enabled, userId, fetchDrafts]);

  const publish = useCallback(async (draft) => {
    const target = ['public', 'followers', 'only_me'].includes(draft.metadata?.target_visibility)
      ? draft.metadata.target_visibility
      : 'public';
    setBusyId(draft.id);
    try {
      const res = await fetch(`/api/content/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: target }),
      });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      }
    } catch {} finally {
      setBusyId(null);
    }
  }, []);

  const remove = useCallback(async (draft) => {
    if (!window.confirm('Delete this draft permanently?')) return;
    setBusyId(draft.id);
    try {
      const res = await fetch(`/api/content/${draft.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      }
    } catch {} finally {
      setBusyId(null);
    }
  }, []);

  if (!enabled) return null;
  if (loaded && !loading && drafts.length === 0) return null;

  const labelFor = (d) => {
    if (d.visibility === 'scheduled' && d.metadata?.scheduled_at) {
      const when = new Date(d.metadata.scheduled_at);
      return `Scheduled · ${Number.isNaN(when.getTime()) ? 'soon' : when.toLocaleString()}`;
    }
    return 'Draft · only you can see this';
  };

  return (
    <section aria-label="Your drafts" className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <EyeOff className="w-3.5 h-3.5 text-zinc-500" aria-hidden />
        <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
          Private drafts{loading ? '' : ` (${drafts.length})`}
        </h3>
      </div>

      {loading && drafts.length === 0 ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-[#1a1a1a] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 bg-[#0d0d0d] border border-[#222] rounded-xl p-3">
              {d.mediaUrl ? (
                <img src={d.mediaUrl} alt="" aria-hidden className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="w-12 h-12 rounded-lg bg-[#1a1a1a] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-zinc-600" aria-hidden />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 truncate">{d.text || '(photo, no caption)'}</p>
                <p className="text-[10px] font-mono text-zinc-500 mt-0.5 flex items-center gap-1">
                  {d.visibility === 'scheduled' && <CalendarClock className="w-3 h-3" aria-hidden />}
                  {labelFor(d)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => publish(d)}
                  disabled={busyId === d.id}
                  aria-label="Publish draft"
                  title={`Publish (${d.metadata?.target_visibility || 'public'})`}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-[#ff4d00]/10 border border-[#ff4d00]/40 text-[#ff4d00] text-[11px] font-mono font-bold hover:bg-[#ff4d00]/20 transition-all disabled:opacity-50 min-h-[40px]"
                >
                  {busyId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Publish
                </button>
                <button
                  onClick={() => remove(d)}
                  disabled={busyId === d.id}
                  aria-label="Delete draft"
                  className="p-2 rounded-xl text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link href="/create" className="block text-center text-[11px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors">
        + New post
      </Link>
    </section>
  );
}
