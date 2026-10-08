'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Flag, UserCheck, UserX, VolumeX, Volume2, Loader2, EyeOff } from 'lucide-react';
import ReportModal from './ReportModal';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * SafetyActions — renders self-contained safety rows (Report / Block / Mute)
 * for use inside card dropdown menus.
 *
 * Behavior:
 *   - Report always available (anonymous reports allowed; identity protected).
 *   - Block / Mute only shown when the viewer is signed in, the item has a
 *     real author user id, and it is not the viewer's own content.
 *   - Block and mute state is read from the server (never guessed) and the
 *     actions are enforced server-side — a hidden button is never the only
 *     layer of protection.
 *
 * Props:
 *   - item: feed item { id, type, userId, author:{username} }
 *   - onReport: optional legacy callback (kept for callers that already
 *     wire their own report flow)
 *   - onMenuClose: fn — closes the parent menu after an action
 */

const TARGET_MAP = { roast: 'roast', social_post: 'social_post' };

export default function SafetyActions({ item, onReport, onMenuClose }) {
  const [relationship, setRelationship] = useState(null); // null = not loaded
  const [currentUserId, setCurrentUserId] = useState(null);
  const [busy, setBusy] = useState(null); // 'block' | 'mute'
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [message, setMessage] = useState('');

  const authorUserId = item?.userId || null;
  const targetType = TARGET_MAP[item?.type] || (item?.type === 'comment' ? 'comment' : 'social_post');

  // Determine signed-in viewer + server-side relationship once
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.auth.getUser();
          if (!cancelled) setCurrentUserId(data?.user?.id || null);
        } catch {
          if (!cancelled) setCurrentUserId(null);
        }
      }
      if (authorUserId) {
        try {
          const res = await fetch(`/api/safety/relationship?user_id=${encodeURIComponent(authorUserId)}`);
          if (res.ok && !cancelled) {
            const data = await res.json();
            setRelationship(data);
          }
        } catch {
          // Relationship lookup is additive — fail without blocking the menu
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [authorUserId]);

  const isOwn = !!currentUserId && currentUserId === authorUserId;
  const canShowUserActions = !!(authorUserId && relationship?.signedIn && !isOwn);

  const handleReport = useCallback(() => {
    if (onReport) {
      onReport(item);
      onMenuClose?.();
      return;
    }
    setReportOpen(true);
  }, [item, onReport, onMenuClose]);

  const toggleBlock = useCallback(async () => {
    if (busy || !authorUserId) return;
    setBusy('block');
    setMessage('');
    try {
      const method = relationship?.viewer_blocks_other ? 'DELETE' : 'POST';
      const res = await fetch('/api/safety/blocks', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authorUserId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error || 'Could not update block');
      } else {
        setRelationship((prev) => ({ ...prev, viewer_blocks_other: method === 'POST' }));
        setConfirmBlock(false);
      }
    } catch {
      setMessage('Network error');
    } finally {
      setBusy(null);
    }
  }, [busy, authorUserId, relationship?.viewer_blocks_other]);

  const toggleMute = useCallback(async () => {
    if (busy || !authorUserId) return;
    setBusy('mute');
    setMessage('');
    try {
      const method = relationship?.viewer_mutes_other ? 'DELETE' : 'POST';
      const res = await fetch('/api/safety/mutes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authorUserId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error || 'Could not update mute');
      } else {
        setRelationship((prev) => ({ ...prev, viewer_mutes_other: method === 'POST' }));
      }
    } catch {
      setMessage('Network error');
    } finally {
      setBusy(null);
    }
  }, [busy, authorUserId, relationship?.viewer_mutes_other]);

  const blockedByAuthor = !!relationship?.other_blocks_viewer;
  const isBlocked = !!relationship?.viewer_blocks_other;
  const isMuted = !!relationship?.viewer_mutes_other;

  const hideItem = useCallback(async () => {
    if (busy || !item?.id) return;
    setBusy('hide');
    setMessage('');
    try {
      const contentType = item?.type === 'roast' ? 'roast' : 'social_post';
      const res = await fetch('/api/feed/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: contentType, content_id: item.id, action: 'hide' }),
      });
      if (!res.ok) {
        setMessage('Could not hide — try again');
      } else {
        setMessage('Hidden — you will see less like this');
        onMenuClose?.();
      }
    } catch {
      setMessage('Network error');
    } finally {
      setBusy(null);
    }
  }, [busy, item?.id, item?.type, onMenuClose]);

  return (
    <>
      {/* Report */}
      <button
        onClick={handleReport}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Flag className="w-3.5 h-3.5" />
        Report
      </button>

      {/* Hide / Not interested (viewer-only, silent) */}
      {item?.id && (item?.type === 'roast' || item?.type === 'social_post') && (
        <button
          onClick={hideItem}
          disabled={busy === 'hide'}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-[#1a1a1a] transition-colors"
          aria-label="Hide this post"
        >
          {busy === 'hide' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
          Hide · Not interested
        </button>
      )}

      {canShowUserActions && (
        <>
          {!blockedByAuthor && (isBlocked ? (
            <button
              onClick={toggleBlock}
              disabled={busy === 'block'}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-[#1a1a1a] transition-colors"
              aria-label="Unblock this user"
            >
              {busy === 'block' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              Unblock @{item?.author?.username}
            </button>
          ) : confirmBlock ? (
            <button
              onClick={toggleBlock}
              disabled={busy === 'block'}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-red-400 bg-red-500/10 transition-colors"
              aria-label={`Confirm blocking @${item?.author?.username}`}
            >
              {busy === 'block' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
              Confirm block @{item?.author?.username}?
            </button>
          ) : (
            <button
              onClick={() => setConfirmBlock(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              aria-label={`Block @${item?.author?.username}`}
            >
              <UserX className="w-3.5 h-3.5" />
              Block @{item?.author?.username}
            </button>
          ))}

          {/* Mute (distinct from block: one-directional, silent) */}
          {!blockedByAuthor && (
            <button
              onClick={toggleMute}
              disabled={busy === 'mute'}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-mono transition-colors ${
                isMuted ? 'text-amber-400 hover:bg-amber-500/10' : 'text-zinc-300 hover:bg-[#1a1a1a]'
              }`}
              aria-label={isMuted ? `Unmute @${item?.author?.username}` : `Mute @${item?.author?.username}`}
              aria-pressed={isMuted}
            >
              {busy === 'mute' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isMuted
                ? <Volume2 className="w-3.5 h-3.5" />
                : <VolumeX className="w-3.5 h-3.5" />}
              {isMuted ? 'Unmute' : 'Mute'} @{item?.author?.username}
            </button>
          )}

          {blockedByAuthor && (
            <p className="px-3 py-2 text-[10px] font-mono text-zinc-600 leading-snug">
              This user blocked you — interactions are restricted.
            </p>
          )}
        </>
      )}

      {message && <p className="px-3 pb-1 text-[10px] font-mono text-red-400">{message}</p>}

      {reportOpen && (
        <ReportModal
          targetType={targetType}
          targetId={item?.id}
          onClose={() => { setReportOpen(false); onMenuClose?.(); }}
        />
      )}
    </>
  );
}
