'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Send, RefreshCw, Wand2, ShieldCheck, MessageCircle } from 'lucide-react';

/**
 * /ai — Personal AI hub (Master Prompt 22)
 *
 * Three transparent, optional, user-controlled capabilities:
 *   · Guide — grounded product Q&A with cited topics. Never writes.
 *   · Digest — "while you were away" over YOUR follows/communities, computed
 *     from real data (an AI-free summary — nothing fabricated).
 *   · Polish — optional suggestions for a draft you paste. Draft-only.
 *
 * Transparency rules shown in the UI: AI suggestions are labeled, publishing
 * is always manual, and every capability is flag-gated server-side.
 */

const EXAMPLES = ['How do I join a community?', 'What can I do in a challenge?', 'How do blocking and reporting work?'];

function GuidePanel() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null); // { answer, sources }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask(q) {
    const query = (q ?? question).trim();
    if (!query || busy) return;
    setBusy(true);
    setError('');
    setAnswer(null);
    try {
      const res = await fetch('/api/ai/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ask failed');
      setAnswer(json);
      setQuestion('');
    } catch (e) {
      setError(e.message || 'Ask failed — try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#101014] border border-[#26262c] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-[#ff4d00]" />
        <h2 className="text-white font-bold text-sm">Ask the BurnBoard Guide</h2>
        <span className="text-[10px] font-mono text-zinc-600 uppercase ml-auto">grounded · read-only</span>
      </div>
      <p className="text-zinc-500 text-xs">Questions about how BurnBoard works. Answers cite their source topics and never reach beyond the product.</p>

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map(ex => (
          <button key={ex} onClick={() => ask(ex)} className="text-[11px] text-zinc-400 hover:text-white bg-[#18181c] border border-[#26262c] rounded-full px-3 py-1">
            {ex}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask()}
          placeholder="e.g. How do battles work?"
          className="flex-1 bg-[#18181c] border border-[#26262c] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
        />
        <button onClick={() => ask()} disabled={busy || !question.trim()}
          className="bg-[#ff4d00] disabled:opacity-40 text-black font-bold rounded-lg px-4 py-2 text-sm flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5" /> {busy ? '…' : 'Ask'}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {answer?.answer && (
        <div className="bg-[#18181c] border border-[#26262c] rounded-lg p-3 flex flex-col gap-2">
          <p className="text-zinc-200 text-sm leading-relaxed">{answer.answer}</p>
          {(answer.sources || []).length > 0 && (
            <p className="text-[11px] text-zinc-500">
              Sources: {answer.sources.map(s => <span key={s} className="text-emerald-400 font-mono">{s}</span>)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DigestPanel() {
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');
  const [scopeNote, setScopeNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ai/digest', { cache: 'no-store' });
      if (res.status === 401) { setNeedsAuth(true); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Digest failed');
      setItems(json.items || []);
      setNote(json.note || '');
      setScopeNote(json.transparency || '');
    } catch (e) {
      setError(e.message || 'Digest unavailable.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-[#101014] border border-[#26262c] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#ff4d00]" />
        <h2 className="text-white font-bold text-sm">While you were away</h2>
        <button onClick={load} className="ml-auto text-zinc-500 hover:text-white" title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {needsAuth && (
        <div className="text-zinc-500 text-sm">
          <p>Sign in to see a digest of your own network.</p>
          <a href="/login" className="inline-block mt-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">Sign in</a>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {!needsAuth && !busy && note && <p className="text-zinc-500 text-sm">{note}</p>}
      {scopeNote && <p className="text-[11px] text-zinc-600">{scopeNote}</p>}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <div key={`${item.kind}-${item.id}`} className="bg-[#18181c] border border-[#26262c] rounded-lg p-3">
              <p className="text-zinc-300 text-sm">{item.text || '(media post)'}</p>
              <p className="text-[10px] text-zinc-600 mt-1 font-mono uppercase">
                {item.kind === 'creator_post' ? 'from a user you follow' : 'in a community you joined'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PolishPanel() {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function polish() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Polish failed');
      setSuggestions(json.suggestions || []);
    } catch (e) {
      setError(e.message || 'Polish unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#101014] border border-[#26262c] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-[#ff4d00]" />
        <h2 className="text-white font-bold text-sm">Draft polish</h2>
        <span className="text-[10px] font-mono text-zinc-600 uppercase ml-auto">suggestions only</span>
      </div>
      <p className="text-zinc-500 text-xs">Paste a draft for optional feedback. Nothing is stored and nothing publishes — you stay in control.</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste your draft here…"
        className="bg-[#18181c] border border-[#26262c] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-zinc-500 min-h-[90px] resize-none"
      />
      <button onClick={polish} disabled={busy || !text.trim()}
        className="self-start bg-zinc-800 disabled:opacity-40 hover:bg-zinc-700 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
        <Wand2 className="w-3.5 h-3.5" /> {busy ? '…' : 'Suggest improvements'}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {suggestions.map((s, i) => (
            <p key={i} className="text-zinc-300 text-sm bg-[#18181c] border border-[#26262c] rounded-lg px-3 py-2">• {s}</p>
          ))}
        </div>
      )}
    </div>
  );
}

const CAPABILITIES = [
  { key: 'ai_personal_guide', label: 'Guide', description: 'Answer questions about how BurnBoard works.' },
  { key: 'ai_personal_digest', label: 'Daily digest', description: '“While you were away” from your follows and communities.' },
  { key: 'ai_content_polish', label: 'Draft polish', description: 'Optional suggestions on drafts you paste.' },
];

function ControlsPanel() {
  const [disabled, setDisabled] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/preferences', { cache: 'no-store' });
      if (res.status === 401) { setNeedsAuth(true); setLoading(false); return; }
      const json = await res.json();
      setDisabled(json.disabledCapabilities || []);
      setTopics(json.favoriteTopics || []);
    } catch {
      // preferences unavailable — leave defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(nextDisabled) {
    setError('');
    try {
      const res = await fetch('/api/ai/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabledCapabilities: nextDisabled }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch (e) {
      setError(e.message || 'Could not save preference.');
    }
  }

  async function clearAll() {
    if (!window.confirm('Clear all of your AI preferences and settings?')) return;
    setError('');
    try {
      const res = await fetch('/api/ai/preferences', { method: 'DELETE' });
      if (!res.ok) throw new Error('clear failed');
      setDisabled([]); setTopics([]);
    } catch (e) {
      setError(e.message || 'Could not clear preferences.');
    }
  }

  if (needsAuth) {
    return (
      <div className="bg-[#101014] border border-[#26262c] rounded-xl p-5">
        <p className="text-zinc-500 text-sm">Sign in to manage your AI preferences.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#101014] border border-[#26262c] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <h2 className="text-white font-bold text-sm">Your AI controls & memory</h2>
      </div>
      <p className="text-zinc-500 text-xs">
        BurnBoard keeps no hidden AI memory of your activity. The only saved state is what you
        toggle here — and you can clear it at any time.
      </p>
      {loading && <p className="text-zinc-600 text-xs">Loading…</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {!loading && (
        <div className="flex flex-col gap-2">
          {CAPABILITIES.map(cap => {
            const off = disabled.includes(cap.key);
            return (
              <div key={cap.key} className="flex items-center justify-between bg-[#18181c] border border-[#26262c] rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-zinc-200 font-semibold">{cap.label}</p>
                  <p className="text-[11px] text-zinc-500">{cap.description}</p>
                </div>
                <button
                  onClick={() => {
                    const next = off ? disabled.filter(k => k !== cap.key) : [...disabled, cap.key];
                    setDisabled(next); save(next);
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${off ? 'bg-zinc-700' : 'bg-emerald-600'}`}
                  title={off ? 'Enable' : 'Disable'}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${off ? 'left-0.5' : 'left-[22px]'}`} />
                </button>
              </div>
            );
          })}
          {topics.length > 0 && (
            <p className="text-[11px] text-zinc-500">Saved topics: {topics.join(', ')}</p>
          )}
          <button onClick={clearAll} className="self-start text-[11px] text-red-400 hover:text-red-300">
            Clear all AI preferences
          </button>
        </div>
      )}
    </div>
  );
}

export default function AIPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400">
            <Sparkles className="w-5 h-5 text-[#ff4d00]" />
            <h1 className="text-lg font-black text-white">Your BurnBoard AI</h1>
          </div>
          <a href="/" className="text-xs text-zinc-400 hover:text-white">← Back to Feed</a>
        </div>

        <p className="text-zinc-500 text-sm">
          Intelligence that helps you use BurnBoard better — <span className="text-zinc-300">under your control</span>.
          These tools read only what you authorize, suggest but never publish, and can be disabled anytime.
        </p>

        <GuidePanel />
        <DigestPanel />
        <PolishPanel />
        <ControlsPanel />

        <div className="text-[11px] text-zinc-600 flex items-center gap-2 pb-8">
          <ShieldCheck className="w-3.5 h-3.5" />
          AI is assistive by design: it cannot post, message, spend, or change your settings. Moderation and blocking stay authoritative.
        </div>
      </div>
    </div>
  );
}