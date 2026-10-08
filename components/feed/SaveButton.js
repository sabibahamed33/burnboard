'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bookmark } from 'lucide-react';

/**
 * SaveButton — private save/unsave toggle for a post.
 *
 * Resolves initial state from GET /api/saves. Hides itself when saving
 * is unavailable (signed out, table missing, creator disabled saving) —
 * never a dead control.
 */
export default function SaveButton({ postId, disabled = false, className = '' }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!postId || disabled) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/saves?post_id=${encodeURIComponent(postId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setVisible(false);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!cancelled && data.success) {
          setSaved(!!data.saved);
          setVisible(true);
        } else if (!cancelled) {
          setVisible(false);
        }
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, disabled]);

  const toggle = useCallback(async () => {
    if (busy || !postId) return;
    setBusy(true);
    const next = !saved;
    setSaved(next); // optimistic
    try {
      const res = await fetch('/api/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action: next ? 'save' : 'unsave' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (res.status === 503 || res.status === 401) setVisible(false);
        else setSaved(!next); // roll back
      } else {
        setSaved(!!data.saved);
      }
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }, [busy, postId, saved]);

  if (!visible) return null;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? 'Remove from saved' : 'Save post'}
      aria-pressed={saved}
      className={`flex items-center justify-center p-1.5 rounded-xl transition-all active:scale-90 min-h-[36px] min-w-[36px] disabled:opacity-50 ${
        saved ? 'text-[#ff4d00]' : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
      } ${className}`}
    >
      <Bookmark className={`w-4 h-4 ${saved ? 'fill-[#ff4d00]' : ''}`} />
    </button>
  );
}
