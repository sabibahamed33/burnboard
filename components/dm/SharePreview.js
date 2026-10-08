'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Avatar from '@/components/ui/Avatar';

/**
 * SharePreview — rich preview for content shared in a DM.
 *
 * Renders ONLY a live-validated reference: the preview is fetched from
 * /api/dm/preview at render time, so deleted, moderated, or newly-private
 * content shows "no longer available" instead of a stale snapshot.
 */
export default function SharePreview({ sharedRef }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sharedRef?.kind || !sharedRef?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/dm/preview?kind=${encodeURIComponent(sharedRef.kind)}&id=${encodeURIComponent(sharedRef.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sharedRef?.kind, sharedRef?.id]);

  if (!sharedRef?.kind || !sharedRef?.id) return null;

  if (loading) {
    return (
      <div className="mt-1.5 rounded-xl border border-white/10 bg-black/30 p-3 animate-pulse" aria-hidden="true">
        <div className="h-3 w-2/3 rounded bg-white/10" />
        <div className="h-3 w-1/3 rounded bg-white/10 mt-2" />
      </div>
    );
  }

  if (!preview || preview.available === false) {
    return (
      <div className="mt-1.5 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] font-mono text-zinc-500">
        Shared content is no longer available.
      </div>
    );
  }

  return (
    <Link
      href={preview.url || '#'}
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 p-2.5 hover:border-[#ff4d00]/50 transition-colors"
    >
      {preview.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          className="w-11 h-11 rounded-lg object-cover shrink-0"
        />
      ) : preview.kind === 'profile' ? (
        <Avatar username={(preview.subtitle || '?').replace('@', '')} size="md" src={preview.image} />
      ) : (
        <span className="w-11 h-11 rounded-lg bg-[#ff4d00]/10 border border-[#ff4d00]/30 flex items-center justify-center text-sm shrink-0" aria-hidden="true">
          {preview.kind === 'community' ? '👥' : preview.kind === 'challenge' ? '⚡' : preview.kind === 'battle' ? '⚔️' : '🔥'}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#ff4d00]">
          {preview.label}
        </span>
        <span className="block text-xs font-bold text-white truncate">{preview.title}</span>
        {preview.subtitle && (
          <span className="block text-[11px] text-zinc-400 truncate">{preview.subtitle}</span>
        )}
      </span>
    </Link>
  );
}
