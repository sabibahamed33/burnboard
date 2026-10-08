'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Search, Plus, Loader2, X, Settings2, Check,
  MessageCircle, ShieldCheck,
} from 'lucide-react';
import { useDebouncedValue } from '@/lib/motion';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import BottomSheet from '@/components/ui/BottomSheet';
import ChatPane from '@/components/dm/ChatPane';
import { DM_PRIVACY_OPTIONS } from '@/lib/dm';
import { track } from '@/lib/analytics';

/**
 * /messages — Direct Messages inbox.
 *
 * Chats (active conversations) + Requests (incoming message requests) +
 * new conversations + per-user messaging privacy. Deep links:
 *   ?thread=<id> — open a conversation
 *   ?user=<id>   — start (or resume) a conversation with a user
 *
 * Read state reflects actual viewing: opening a chat marks it read, and
 * the list never marks anything read by rendering. Unsent drafts survive
 * thread switches (kept in memory per thread, never uploaded).
 */

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

function MessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [tab, setTab] = useState('chats'); // chats | requests
  const [threads, setThreads] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [pendingUser, setPendingUser] = useState(null); // ?user= new-chat target
  const [listQuery, setListQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacy, setPrivacy] = useState('everyone');
  const [privacySaving, setPrivacySaving] = useState(false);

  const draftsRef = useRef({});

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthChecked(true);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user || null;
      setUserId(user?.id || null);
      setAuthChecked(true);
      if (!user) router.push('/auth');
    });
  }, [router]);

  // ── Load threads + requests ───────────────────────────────
  const loadThreads = useCallback(async () => {
    try {
      const [chatsRes, reqRes] = await Promise.all([
        fetch('/api/dm/threads?status=active&limit=30'),
        fetch('/api/dm/threads?status=requested&limit=30'),
      ]);
      const chats = chatsRes.ok ? await chatsRes.json().catch(() => ({})) : {};
      const reqs = reqRes.ok ? await reqRes.json().catch(() => ({})) : {};
      setThreads(chats.threads || []);
      // Incoming requests only (mine-pending stays a thread preview).
      setRequests((reqs.threads || []).filter((t) => !t.requestedByMe));
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    loadThreads();
    // List polling fallback (20s) + refetch on focus.
    const poll = setInterval(() => {
      if (!document.hidden) loadThreads();
    }, 20000);
    const onFocus = () => loadThreads();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId, loadThreads]);

  // ── Privacy setting ───────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    fetch('/api/dm/privacy')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.dm_privacy) setPrivacy(d.dm_privacy);
      })
      .catch(() => {});
  }, [userId]);

  const savePrivacy = useCallback(async (value) => {
    setPrivacySaving(true);
    try {
      const res = await fetch('/api/dm/privacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dm_privacy: value }),
      });
      if (res.ok) setPrivacy(value);
    } catch {} finally {
      setPrivacySaving(false);
    }
  }, []);

  // ── Deep links (?thread= / ?user=) ────────────────────────
  useEffect(() => {
    if (!userId || loading) return;
    const threadParam = searchParams.get('thread');
    const userParam = searchParams.get('user');
    if (threadParam) {
      const found =
        threads.find((t) => t.id === threadParam) ||
        requests.find((t) => t.id === threadParam);
      if (found) {
        setSelectedId(found.id);
        if (found.status === 'requested') setTab('requests');
        return;
      }
    }
    if (userParam) {
      const existing = threads.find((t) => t.otherUser?.id === userParam);
      if (existing) {
        setSelectedId(existing.id);
      } else {
        // New-chat target: resolve a display header via the preview API.
        fetch(`/api/dm/preview?kind=profile&id=${encodeURIComponent(userParam)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((p) => {
            if (p?.available) {
              setPendingUser({
                id: userParam,
                username: (p.subtitle || '').replace('@', ''),
                displayName: p.title,
                avatarUrl: p.image,
              });
              setSelectedId(`new:${userParam}`);
            }
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loading]);

  const handleThreadChange = useCallback((threadId, patch) => {
    if (patch?.status === 'active') {
      // Request accepted → move to chats.
      setRequests((prev) => prev.filter((t) => t.id !== threadId));
      loadThreads();
      setTab('chats');
      return;
    }
    const apply = (list) =>
      list.map((t) => (t.id === threadId ? { ...t, ...patch } : t));
    setThreads(apply);
    setRequests(apply);
  }, [loadThreads]);

  const handleThreadGone = useCallback((threadId) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setRequests((prev) => prev.filter((t) => t.id !== threadId));
    setSelectedId((sel) => (sel === threadId ? null : sel));
  }, []);

  const handleDraftChange = useCallback((threadId, draftText) => {
    if (!threadId) return;
    draftsRef.current[threadId] = draftText;
  }, []);

  const openThread = useCallback((id) => {
    setSelectedId(id);
    setPendingUser(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('thread', id);
      url.searchParams.delete('user');
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }, []);

  const selectedThread =
    threads.find((t) => t.id === selectedId) ||
    requests.find((t) => t.id === selectedId) ||
    null;

  const filteredThreads = threads.filter((t) => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      t.otherUser?.username?.toLowerCase().includes(q) ||
      t.otherUser?.displayName?.toLowerCase().includes(q) ||
      t.lastMessage?.toLowerCase().includes(q)
    );
  });

  if (!authChecked || (loading && threads.length === 0 && requests.length === 0)) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-3 pt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] text-white h-[100dvh] flex flex-col">
      <div className="flex-1 min-h-0 max-w-5xl w-full mx-auto flex">
        {/* ═══ Conversation list ═══ */}
        <aside className={`${selectedId ? 'hidden' : 'flex'} lg:flex flex-col w-full lg:w-80 shrink-0 border-r border-white/[0.06] min-h-0`}>
          <div className="shrink-0 px-4 pt-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black uppercase tracking-wider font-mono">Messages</h1>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowPrivacy(true)}
                  aria-label="Messaging privacy"
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowNewChat(true)}
                  aria-label="New conversation"
                  className="p-2 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-1 bg-[#111] p-1 rounded-xl border border-[#222]" role="tablist" aria-label="Inbox sections">
              {[
                { key: 'chats', label: 'Chats' },
                { key: 'requests', label: `Requests${requests.length > 0 ? ` (${requests.length})` : ''}` },
              ].map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all min-h-[40px] ${
                    tab === t.key ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className="w-full bg-[#111] border border-[#222] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00]/60 min-h-[44px]"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
            {tab === 'requests' ? (
              requests.length === 0 ? (
                <EmptyState
                  icon="📭"
                  title="No message requests"
                  hint="When someone you don't follow messages you, it lands here for review."
                />
              ) : (
                requests.map((t) => (
                  <ThreadRow key={t.id} thread={t} selected={selectedId === t.id} onOpen={() => openThread(t.id)} showRequest />
                ))
              )
            ) : filteredThreads.length === 0 ? (
              <EmptyState
                icon={threads.length === 0 ? '💬' : '🔍'}
                title={threads.length === 0 ? 'No conversations yet' : 'No matches'}
                hint={threads.length === 0 ? 'Share a post via message, or start a new conversation.' : 'Try a different search.'}
                action={threads.length === 0 ? { label: 'Start a conversation', onClick: () => setShowNewChat(true) } : null}
              />
            ) : (
              filteredThreads.map((t) => (
                <ThreadRow key={t.id} thread={t} selected={selectedId === t.id} onOpen={() => openThread(t.id)} />
              ))
            )}
          </div>
        </aside>

        {/* ═══ Active conversation ═══ */}
        <section className={`${selectedId ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 min-h-0 flex-col`}>
          {selectedThread ? (
            <ChatPane
              key={selectedThread.id}
              thread={selectedThread}
              userId={userId}
              onBack={() => setSelectedId(null)}
              onThreadChange={handleThreadChange}
              onThreadGone={handleThreadGone}
              initialDraft={draftsRef.current[selectedThread.id] || ''}
              onDraftChange={handleDraftChange}
            />
          ) : pendingUser && selectedId === `new:${pendingUser.id}` ? (
            <NewChatPane
              target={pendingUser}
              userId={userId}
              onBack={() => { setPendingUser(null); setSelectedId(null); }}
              onCreated={(thread) => {
                setThreads((prev) => [thread, ...prev]);
                setPendingUser(null);
                openThread(thread.id);
              }}
            />
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center p-8">
              <div className="text-center space-y-3 max-w-xs">
                <p className="text-4xl" aria-hidden="true">💬</p>
                <p className="text-sm font-bold text-white">Your messages live here</p>
                <p className="text-xs text-zinc-500 font-mono leading-relaxed">
                  Pick a conversation — or share any post via message to start one.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* New conversation */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onPick={(person) => {
            setShowNewChat(false);
            const existing = threads.find((t) => t.otherUser?.id === person.id);
            if (existing) {
              openThread(existing.id);
            } else {
              setPendingUser(person);
              setSelectedId(`new:${person.id}`);
            }
          }}
        />
      )}

      {/* Privacy settings */}
      <BottomSheet open={showPrivacy} onClose={() => setShowPrivacy(false)} title="Who can message you?">
        <div className="space-y-2 pb-2">
          <p className="text-[11px] font-mono text-zinc-500 leading-relaxed flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            Applies to new conversations. Existing chats keep working, and blocked users can never message you.
          </p>
          {DM_PRIVACY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => savePrivacy(opt.key)}
              disabled={privacySaving}
              aria-pressed={privacy === opt.key}
              className={`w-full flex items-start gap-3 text-left px-3.5 py-3 rounded-xl border transition-all min-h-[56px] disabled:opacity-50 ${
                privacy === opt.key
                  ? 'bg-[#ff4d00]/10 border-[#ff4d00]/50'
                  : 'bg-[#111] border-[#222] hover:border-[#333]'
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white">{opt.label}</span>
                <span className="block text-[11px] font-mono text-zinc-500 mt-0.5">{opt.desc}</span>
              </span>
              {privacy === opt.key && <Check className="w-4 h-4 text-[#ff4d00] shrink-0 mt-1" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function ThreadRow({ thread, selected, onOpen, showRequest = false }) {
  const other = thread.otherUser;
  return (
    <button
      onClick={onOpen}
      aria-current={selected || undefined}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all min-h-[68px] ${
        selected ? 'bg-[#ff4d00]/10 border border-[#ff4d00]/40' : 'hover:bg-white/[0.04] border border-transparent'
      }`}
    >
      <Avatar username={other?.username || '?'} size="md" src={other?.avatarUrl} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-white truncate">
            {other?.displayName || (other?.username ? `@${other.username}` : 'Conversation')}
          </span>
          {showRequest && (
            <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0">
              Request
            </span>
          )}
          {thread.unreadCount > 0 && (
            <span className="ml-auto shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-[#ff4d00] text-black text-[10px] font-black font-mono flex items-center justify-center" aria-label={`${thread.unreadCount} unread`}>
              {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
            </span>
          )}
        </span>
        <span className="block text-xs text-zinc-400 truncate mt-0.5">
          {thread.lastMessage || (showRequest ? 'Wants to message you' : 'No messages yet')}
        </span>
      </span>
      <span className="text-[10px] font-mono text-zinc-600 shrink-0">{timeAgo(thread.lastMessageAt)}</span>
    </button>
  );
}

function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="text-center py-10 px-4 space-y-2">
      <p className="text-3xl" aria-hidden="true">{icon}</p>
      <p className="text-sm font-bold text-zinc-300">{title}</p>
      <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">{hint}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-4 py-2 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black text-xs font-bold transition-all min-h-[44px]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function NewChatModal({ onClose, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    fetch(`/api/search?scope=people&q=${encodeURIComponent(q)}&limit=8`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setResults(data?.people || []);
          setSearching(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="New conversation">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-[#111] border-t sm:border border-[#222] sm:rounded-2xl max-h-[85vh] overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-[#222]">
          <h3 className="text-sm font-black text-white uppercase tracking-wider">New conversation</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-zinc-400 hover:text-white transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
              autoFocus
              aria-label="Search users"
              className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
            />
          </div>
          <div className="overflow-y-auto max-h-[50vh]">
            {searching ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-[#ff4d00]" aria-hidden="true" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-center text-xs text-zinc-500 font-mono py-6">
                {query.trim().length >= 2 ? 'No users found.' : 'Type at least 2 characters to search.'}
              </p>
            ) : (
              results.map((person) => (
                <button
                  key={person.id}
                  onClick={() => onPick(person)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#1a1a1a] transition-colors text-left min-h-[56px]"
                >
                  <Avatar username={person.username} size="md" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white truncate">@{person.username}</span>
                    {person.display_name && (
                      <span className="block text-[11px] text-zinc-400 truncate">{person.display_name}</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewChatPane({ target, userId, onBack, onCreated }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    const body = text.trim().slice(0, 500);
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/dm/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: target.id, text: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not start conversation.');
        setSending(false);
        return;
      }
      track('dm_thread_created', { requested: !!data.requested });
      onCreated?.(data.thread);
    } catch {
      setError('Could not start conversation. Retry.');
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-white/[0.06] bg-[#111]/80 backdrop-blur-md">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden p-2 -ml-2 rounded-xl text-zinc-400 hover:text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Avatar username={target.username} size="md" src={target.avatarUrl} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white truncate">
            {target.displayName || `@${target.username}`}
          </span>
          <span className="block text-[11px] font-mono text-zinc-500">New conversation</span>
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-6">
        <div className="text-center space-y-2 max-w-xs">
          <MessageCircle className="w-8 h-8 text-zinc-600 mx-auto" aria-hidden="true" />
          <p className="text-sm font-bold text-white">Message @{target.username}</p>
          <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
            Your first message starts the conversation. If they don&apos;t follow you, it arrives as a request they can accept or delete.
          </p>
        </div>
      </div>
      {error && (
        <div className="shrink-0 mx-3 sm:mx-4 mb-2 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-400 font-mono" role="alert">
          {error}
        </div>
      )}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#111]/80 backdrop-blur-md px-3 sm:px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleStart();
              }
            }}
            placeholder={`Message @${target.username}…`}
            rows={1}
            aria-label="Write the first message"
            className="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00]/60 resize-none max-h-32 min-h-[44px]"
          />
          <button
            onClick={handleStart}
            disabled={sending || !text.trim()}
            aria-label="Send first message"
            className="shrink-0 p-2.5 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black transition-all disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6">
          <div className="max-w-5xl mx-auto space-y-3 pt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <MessagesInner />
    </Suspense>
  );
}
