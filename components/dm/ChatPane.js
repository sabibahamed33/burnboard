'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Send, Loader2, ImagePlus, X, Reply, Trash2, Copy,
  Flag, UserX, Check, CheckCheck, MoreVertical,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';
import Avatar from '@/components/ui/Avatar';
import ReportModal from '@/components/safety/ReportModal';
import SharePreview from './SharePreview';

/**
 * ChatPane — one conversation: history, realtime, composer, safety.
 *
 * Props:
 *   thread: shaped thread ({ id, status, otherUser, requestedByMe })
 *   userId: viewer id
 *   onBack: mobile back to list
 *   onThreadChange: (patch) => void — update list entry (read counts, preview)
 *   onThreadGone: (threadId) => void — thread deleted/declined
 *   initialDraft: preserved unsent text when switching threads
 *   onDraftChange: (threadId, text) => void
 *
 * Realtime: exactly one channel per open thread
 * (dm-thread-<id>, INSERT on dm_messages filtered by thread). Created once
 * per thread id, removed on switch/unmount — never duplicated on rerender.
 * A 25s polling fallback covers missed events. Seen-ids dedupe reconnect
 * replays. Read marking fires only on actual viewing.
 */

const MAX_TEXT = 500;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Downscale + JPEG re-encode: strips EXIF/GPS before upload. */
function processImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) reject(new Error('Could not process that image.'));
            else resolve({ blob, previewUrl: URL.createObjectURL(blob) });
          },
          'image/jpeg',
          0.85
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

export default function ChatPane({
  thread, userId, onBack, onThreadChange, onThreadGone, initialDraft = '', onDraftChange,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState(initialDraft);
  const [replyTo, setReplyTo] = useState(null);
  const [photo, setPhoto] = useState(null); // { file, previewUrl }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [menuId, setMenuId] = useState(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [reportMsg, setReportMsg] = useState(null);
  const [showReportUser, setShowReportUser] = useState(false);
  const [busy, setBusy] = useState(false);

  const bottomRef = useRef(null);
  const topSentinelRef = useRef(null);
  const fileRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const threadIdRef = useRef(thread?.id);
  const textRef = useRef(text);
  threadIdRef.current = thread?.id;
  textRef.current = text;

  const isRequested = (thread?.status || 'active') === 'requested';
  const requestedByMe = !!thread?.requestedByMe;
  const other = thread?.otherUser;

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  // ── Load history ──────────────────────────────────────────
  const loadMessages = useCallback(async (refresh = false, cursorValue = null) => {
    const tid = threadIdRef.current;
    if (!tid) return;
    if (refresh) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (cursorValue) params.set('cursor', cursorValue);
      const res = await fetch(`/api/dm/threads/${tid}/messages?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || tid !== threadIdRef.current) return;
      const items = data.messages || [];
      for (const m of items) seenIdsRef.current.add(m.id);
      if (refresh) {
        setMessages(items);
        setCursor(data.nextCursor || null);
        setHasMore(!!data.hasMore);
        requestAnimationFrame(() => scrollToBottom(false));
      } else {
        setMessages((prev) => [...items, ...prev]);
        setCursor(data.nextCursor || null);
        setHasMore(!!data.hasMore);
      }
    } catch {
      if (refresh) setError('Could not load messages. Retry.');
    } finally {
      if (tid === threadIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [scrollToBottom]);

  // Reset per thread (drafts survive via parent map).
  useEffect(() => {
    seenIdsRef.current = new Set();
    setMessages([]);
    setCursor(null);
    setHasMore(false);
    setReplyTo(null);
    setPhoto(null);
    setError('');
    setMenuId(null);
    setText(initialDraft);
    loadMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  // Persist draft on change (unmount/switch never loses typed text).
  useEffect(() => {
    onDraftChange?.(thread?.id, text);
  }, [text, thread?.id, onDraftChange]);

  // ── Realtime: one channel per open thread ─────────────────
  useEffect(() => {
    const tid = thread?.id;
    if (!tid || !userId || !isSupabaseConfigured || !supabase) return;

    const markRead = () => {
      fetch(`/api/dm/threads/${tid}/read`, { method: 'POST' }).catch(() => {});
      onThreadChange?.(tid, { unreadCount: 0 });
    };

    const cleanup = subscribeRealtime(
      supabase,
      `dm-thread-${tid}`,
      (ch) =>
        ch.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${tid}` },
          (payload) => {
            const incoming = payload?.new;
            if (!incoming?.id || seenIdsRef.current.has(incoming.id)) return;
            seenIdsRef.current.add(incoming.id);
            setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
            onThreadChange?.(tid, {
              lastMessage: incoming.message || (incoming.shared_ref ? 'Shared something with you' : ''),
              lastMessageAt: incoming.created_at,
            });
            if (incoming.sender_id !== userId) {
              markRead();
              scrollToBottom(true);
            }
          }
        ).on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${tid}` },
          (payload) => {
            const gone = payload?.old?.id;
            if (gone) setMessages((prev) => prev.filter((m) => m.id !== gone));
          }
        )
    );

    // Mark as read on actual viewing (not on list render).
    markRead();
    // Polling fallback every 25s covers missed realtime events.
    const poll = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/dm/threads/${tid}/messages?limit=10`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || tid !== threadIdRef.current) return;
        const fresh = (data.messages || []).filter((m) => !seenIdsRef.current.has(m.id));
        if (fresh.length > 0) {
          for (const m of fresh) seenIdsRef.current.add(m.id);
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const merged = [...prev, ...fresh.filter((m) => !ids.has(m.id))];
            merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return merged;
          });
          if (fresh.some((m) => m.sender_id !== userId)) markRead();
        }
      } catch {}
    }, 25000);

    return () => {
      clearInterval(poll);
      if (typeof cleanup === 'function') cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, userId]);

  // ── Send ──────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const tid = threadIdRef.current;
    if (!tid || sending) return;
    const body = textRef.current.trim().slice(0, MAX_TEXT);
    if (!body && !photo) return;
    setSending(true);
    setError('');
    try {
      let attachmentUrl = null;
      if (photo?.file) {
        const path = `dm/${userId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('post-media')
          .upload(path, photo.file, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw new Error('Photo upload failed. Try again.');
        const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(path);
        attachmentUrl = urlData?.publicUrl || null;
        if (!attachmentUrl) throw new Error('Photo upload failed. Try again.');
      }

      const res = await fetch(`/api/dm/threads/${tid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: body,
          attachment_url: attachmentUrl,
          reply_to_id: replyTo?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Message could not send. Retry.');

      if (data.message && !seenIdsRef.current.has(data.message.id)) {
        seenIdsRef.current.add(data.message.id);
        setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      }
      setText('');
      setReplyTo(null);
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      setPhoto(null);
      onThreadChange?.(tid, {
        lastMessage: body || 'Sent a photo',
        lastMessageAt: new Date().toISOString(),
      });
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (e) {
      // Local recovery: text is preserved, user retries explicitly.
      setError(e.message || 'Message could not send. Retry.');
    } finally {
      setSending(false);
    }
  }, [thread, sending, photo, replyTo, userId, onThreadChange, scrollToBottom]);

  const pickPhoto = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Images must be under 10MB.');
      return;
    }
    try {
      const processed = await processImage(file);
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      setPhoto({ file: new File([processed.blob], 'photo.jpg', { type: 'image/jpeg' }), previewUrl: processed.previewUrl });
      setError('');
    } catch {
      setError('Could not process that image. Try another one.');
    }
  }, [photo]);

  const handleDelete = useCallback(async (msg) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    setMenuId(null);
    try {
      const res = await fetch(`/api/dm/messages/${msg.id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      }
    } catch {}
  }, []);

  const handleCopy = useCallback(async (msg) => {
    setMenuId(null);
    try {
      await navigator.clipboard.writeText(msg.message || '');
    } catch {}
  }, []);

  const handleReview = useCallback(async (action) => {
    const tid = threadIdRef.current;
    if (!tid || busy) return;
    if (action !== 'accept' && !window.confirm(action === 'block' ? 'Block this user? You will not hear from them again.' : 'Delete this request?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dm/threads/${tid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        if (action === 'accept') {
          onThreadChange?.(tid, { status: 'active' });
          loadMessages(true);
        } else {
          onThreadGone?.(tid);
        }
      }
    } catch {} finally {
      setBusy(false);
    }
  }, [busy, onThreadChange, onThreadGone, loadMessages]);

  const handleBlockUser = useCallback(async () => {
    if (!other?.id || busy) return;
    if (!window.confirm(`Block @${other.username}?`)) return;
    setBusy(true);
    setHeaderMenu(false);
    try {
      const res = await fetch('/api/safety/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: other.id }),
      });
      if (res.ok) onThreadGone?.(thread?.id);
    } catch {} finally {
      setBusy(false);
    }
  }, [other, busy, thread?.id, onThreadGone]);

  const replyTarget = replyTo ? messages.find((m) => m.id === replyTo.id) : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-white/[0.06] bg-[#111]/80 backdrop-blur-md">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden p-2 -ml-2 rounded-xl text-zinc-400 hover:text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {other ? (
          <Link href={other.username ? `/u/${other.username}` : '#'} className="flex items-center gap-2.5 min-w-0 flex-1">
            <Avatar username={other.username} size="md" src={other.avatarUrl} />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white truncate">
                {other.displayName || `@${other.username}`}
              </span>
              <span className="block text-[11px] font-mono text-zinc-500 truncate">
                @{other.username}
                {isRequested && (requestedByMe ? ' · request sent' : ' · wants to message you')}
              </span>
            </span>
          </Link>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Conversation</p>
          </div>
        )}
        <div className="relative shrink-0">
          <button
            onClick={() => setHeaderMenu((v) => !v)}
            aria-label="Conversation options"
            aria-expanded={headerMenu}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {headerMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-20 overflow-hidden">
              {other?.username && (
                <Link
                  href={`/u/${other.username}`}
                  className="block px-3 py-2.5 text-xs font-mono text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                  onClick={() => setHeaderMenu(false)}
                >
                  View profile
                </Link>
              )}
              <button
                onClick={() => { setHeaderMenu(false); setShowReportUser(true); }}
                className="w-full text-left px-3 py-2.5 text-xs font-mono text-zinc-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
              >
                <Flag className="w-3.5 h-3.5" /> Report user
              </button>
              <button
                onClick={handleBlockUser}
                className="w-full text-left px-3 py-2.5 text-xs font-mono text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
              >
                <UserX className="w-3.5 h-3.5" /> Block user
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Incoming request banner */}
      {isRequested && !requestedByMe && (
        <div className="shrink-0 mx-3 sm:mx-4 mt-3 bg-amber-500/[0.07] border border-amber-500/30 rounded-2xl p-3.5 space-y-2.5">
          <p className="text-xs text-amber-200 leading-relaxed">
            <span className="font-bold">@{other?.username}</span> wants to message you. Accept to start chatting.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleReview('accept')}
              disabled={busy}
              className="flex-1 py-2 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black text-xs font-bold transition-all disabled:opacity-50 min-h-[44px]"
            >
              Accept
            </button>
            <button
              onClick={() => handleReview('decline')}
              disabled={busy}
              className="flex-1 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] text-zinc-300 text-xs font-bold hover:border-zinc-500 transition-all disabled:opacity-50 min-h-[44px]"
            >
              Delete
            </button>
            <button
              onClick={() => handleReview('block')}
              disabled={busy}
              aria-label="Block sender"
              className="px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] text-red-400 hover:border-red-500/50 transition-all disabled:opacity-50 min-h-[44px]"
            >
              <UserX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {isRequested && requestedByMe && (
        <div className="shrink-0 mx-3 sm:mx-4 mt-3 bg-white/[0.03] border border-white/10 rounded-2xl px-3.5 py-2.5">
          <p className="text-[11px] font-mono text-zinc-400">
            Request sent — they will see your message once they accept.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 space-y-2" role="log" aria-label="Messages" aria-live="off">
        {loading ? (
          <div className="space-y-2 pt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`h-10 w-2/3 rounded-2xl bg-white/[0.04] animate-pulse ${i % 2 ? 'ml-auto' : ''}`} />
            ))}
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                onClick={() => loadMessages(false, cursor)}
                disabled={loadingMore}
                className="mx-auto block px-4 py-1.5 text-[11px] font-mono text-zinc-500 hover:text-white transition-colors"
              >
                {loadingMore ? 'Loading…' : 'Load older messages'}
              </button>
            )}
            {messages.length === 0 && !hasMore && (
              <div className="text-center pt-10 space-y-2">
                <p className="text-3xl" aria-hidden="true">👋</p>
                <p className="text-xs text-zinc-500 font-mono">No messages yet. Say hi.</p>
              </div>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === userId;
              const menuOpen = menuId === m.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div
                      className={`relative px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                        mine
                          ? 'bg-[#ff4d00] text-black rounded-br-md'
                          : 'bg-white/[0.07] border border-white/[0.08] text-zinc-100 rounded-bl-md'
                      }`}
                    >
                      {m.reply_to_id && (
                        <ReplyQuote messageId={m.reply_to_id} messages={messages} mine={mine} />
                      )}
                      {m.attachment_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.attachment_url}
                          alt="Shared photo"
                          loading="lazy"
                          className="rounded-xl max-h-64 object-cover mb-1.5 -mx-0.5"
                        />
                      )}
                      {m.message && <p className="whitespace-pre-wrap">{m.message}</p>}
                      {m.shared_ref && <SharePreview sharedRef={m.shared_ref} />}
                      <div className={`flex items-center gap-1 mt-1 text-[10px] font-mono ${mine ? 'text-black/60 justify-end' : 'text-zinc-500'}`}>
                        <span>{timeAgo(m.created_at)}</span>
                        {mine && (m.is_read
                          ? <CheckCheck className="w-3 h-3" aria-label="Seen" />
                          : <Check className="w-3 h-3" aria-label="Sent" />)}
                      </div>
                      <button
                        onClick={() => setMenuId(menuOpen ? null : m.id)}
                        aria-label="Message options"
                        className={`absolute top-1 ${mine ? '-left-9' : '-right-9'} p-1.5 rounded-lg text-zinc-600 hover:text-white transition-colors min-h-[32px] min-w-[32px]`}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                      {menuOpen && (
                        <div className={`absolute top-7 ${mine ? 'right-0' : 'left-0'} w-40 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-20 overflow-hidden`}>
                          <button
                            onClick={() => { setReplyTo({ id: m.id }); setMenuId(null); }}
                            className="w-full text-left px-3 py-2.5 text-xs font-mono text-zinc-300 hover:bg-white/5 transition-colors flex items-center gap-2"
                          >
                            <Reply className="w-3.5 h-3.5" /> Reply
                          </button>
                          {m.message && (
                            <button
                              onClick={() => handleCopy(m)}
                              className="w-full text-left px-3 py-2.5 text-xs font-mono text-zinc-300 hover:bg-white/5 transition-colors flex items-center gap-2"
                            >
                              <Copy className="w-3.5 h-3.5" /> Copy
                            </button>
                          )}
                          {mine ? (
                            <button
                              onClick={() => handleDelete(m)}
                              className="w-full text-left px-3 py-2.5 text-xs font-mono text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          ) : (
                            <button
                              onClick={() => { setMenuId(null); setReportMsg(m); }}
                              className="w-full text-left px-3 py-2.5 text-xs font-mono text-zinc-300 hover:bg-white/5 transition-colors flex items-center gap-2"
                            >
                              <Flag className="w-3.5 h-3.5" /> Report
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 mx-3 sm:mx-4 mb-2 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-400 font-mono flex items-center justify-between gap-2" role="alert">
          <span className="truncate">{error}</span>
          <button onClick={() => setError('')} className="shrink-0 p-1 text-red-400 hover:text-white" aria-label="Dismiss error">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#111]/80 backdrop-blur-md px-3 sm:px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {isRequested ? (
          <p className="text-center text-[11px] font-mono text-zinc-500 py-2.5">
            {requestedByMe
              ? 'Request pending — you can send more once they accept.'
              : 'Accept the request above to reply.'}
          </p>
        ) : (
          <>
            {replyTarget && (
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 mb-2">
                <Reply className="w-3.5 h-3.5 text-[#ff4d00] shrink-0" aria-hidden="true" />
                <p className="flex-1 min-w-0 text-[11px] text-zinc-400 truncate">
                  {replyTarget.message || (replyTarget.attachment_url ? 'Photo' : 'Shared content')}
                </p>
                <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1 text-zinc-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {photo?.previewUrl && (
              <div className="relative inline-block mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="Attachment preview" className="h-20 rounded-xl border border-white/10 object-cover" />
                <button
                  onClick={() => { if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl); setPhoto(null); }}
                  aria-label="Remove photo"
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-black/80 border border-white/20 text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                aria-label="Attach a photo"
                className="shrink-0 p-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-zinc-300 hover:text-white hover:border-[#ff4d00]/50 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={isRequested ? 'Write your request message…' : 'Message…'}
                rows={1}
                aria-label="Write a message"
                className="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00]/60 resize-none max-h-32 min-h-[44px]"
              />
              <button
                onClick={handleSend}
                disabled={sending || (!text.trim() && !photo)}
                aria-label="Send message"
                className="shrink-0 p-2.5 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black transition-all disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Report message */}
      {reportMsg && (
        <ReportModal
          targetType="dm_message"
          targetId={reportMsg.id}
          onClose={() => setReportMsg(null)}
        />
      )}
      {showReportUser && other && (
        <ReportModal
          targetType="user"
          targetId={other.id}
          onClose={() => setShowReportUser(false)}
        />
      )}
    </div>
  );
}

function ReplyQuote({ messageId, messages, mine }) {
  const target = messages.find((m) => m.id === messageId);
  if (!target) return null;
  return (
    <div className={`mb-1.5 pl-2 border-l-2 ${mine ? 'border-black/40' : 'border-[#ff4d00]/60'}`}>
      <p className={`text-[11px] truncate ${mine ? 'text-black/70' : 'text-zinc-400'}`}>
        {target.message || (target.attachment_url ? 'Photo' : 'Shared content')}
      </p>
    </div>
  );
}
