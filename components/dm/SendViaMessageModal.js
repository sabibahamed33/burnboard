'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search, Loader2, Send, Lock } from 'lucide-react';
import { useDebouncedValue } from '@/lib/motion';
import Avatar from '@/components/ui/Avatar';

/**
 * SendViaMessageModal — share BurnBoard content privately.
 *
 * Post/profile/battle/challenge/community → select a user → send as a DM.
 * The server re-validates the share reference (visibility, blocks) before
 * anything is stored; the modal only submits the intent.
 *
 * Props: sharedKind, sharedId, onClose. On success navigates to the thread.
 */
export default function SendViaMessageModal({ sharedKind, sharedId, onClose }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [error, setError] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    fetch(`/api/search?scope=people&q=${encodeURIComponent(q)}&limit=6`)
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

  const handleSend = useCallback(async (person) => {
    if (sendingId) return;
    setSendingId(person.id);
    setError('');
    try {
      const res = await fetch('/api/dm/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: person.id, shared_kind: sharedKind, shared_id: sharedId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not send. Try again.');
        setSendingId(null);
        return;
      }
      onClose?.();
      router.push(`/messages?thread=${data.thread.id}`);
    } catch {
      setError('Could not send. Try again.');
      setSendingId(null);
    }
  }, [sharedKind, sharedId, sendingId, onClose, router]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Send via message">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-[#111] border-t sm:border border-[#222] sm:rounded-2xl max-h-[85vh] overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-[#222]">
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Send via message
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-zinc-400 hover:text-white transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono" role="alert">
              {error}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
              autoFocus
              aria-label="Search users to message"
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
                <div key={person.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#1a1a1a] transition-colors">
                  <Avatar username={person.username} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">@{person.username}</p>
                    {person.display_name && (
                      <p className="text-[11px] text-zinc-400 truncate">{person.display_name}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleSend(person)}
                    disabled={sendingId === person.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black text-[11px] font-mono font-bold transition-all disabled:opacity-50 min-h-[40px]"
                  >
                    {sendingId === person.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    Send
                  </button>
                </div>
              ))
            )}
          </div>

          <p className="text-[10px] font-mono text-zinc-600 flex items-center gap-1.5">
            <Lock className="w-3 h-3" aria-hidden="true" />
            Shared privately — only you two can see this message.
          </p>
        </div>
      </div>
    </div>
  );
}
