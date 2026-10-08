'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Flame, ArrowLeft, ArrowRight, Loader2, Share2, Link2, Eye, Check } from 'lucide-react';
import { hasCreatedFirstHotSeat, markFirstHotSeatCreated, markFirstShareOpened, trackActivationEvent } from '@/lib/onboarding';
import { trackGrowthEvent } from '@/lib/experiments';

const CATEGORIES = [
  { id: 'photo', label: 'My Photo', emoji: '📸', desc: 'Get roasted on your look' },
  { id: 'vibe', label: 'My Vibe', emoji: '✨', desc: 'Roast my energy and aura' },
  { id: 'bio', label: 'My Bio', emoji: '📝', desc: 'Destroy my bio text' },
  { id: 'outfit', label: 'My Outfit', emoji: '👕', desc: 'Rate and roast my fit' },
  { id: 'idea', label: 'My Idea', emoji: '💡', desc: 'Roast my startup or project idea' },
  { id: 'dating_profile', label: 'My Dating Profile', emoji: '💘', desc: 'Crush my dating game' },
  { id: 'music_taste', label: 'My Music Taste', emoji: '🎵', desc: 'Judge my playlists' },
  { id: 'hot_take', label: 'My Hot Take', emoji: '🔥', desc: 'Destroy my controversial opinion' },
];

const HEAT_LEVELS = [
  { id: 'light', label: 'Light', emoji: '🙂', desc: 'Friendly and playful' },
  { id: 'savage', label: 'Savage', emoji: '🔥', desc: 'More intense but still funny' },
  { id: 'brutal', label: 'Brutal', emoji: '💀', desc: 'Maximum allowed intensity' },
];

export default function HotSeatCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const challengeToken = searchParams.get('challenge');
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [heatLevel, setHeatLevel] = useState('savage');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdHotSeat, setCreatedHotSeat] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!selectedCategory || !title.trim()) {
      setError('Please select a category and enter a title');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/hot-seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          title: title.trim(),
          context: context.trim(),
          heat_level: heatLevel,
          display_name: displayName.trim() || 'Anonymous',
          ...(challengeToken ? { challenge_token: challengeToken } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.details
          ? `${data.error} (${data.details})`
          : data.error || 'Failed to create hot seat';
        setError(msg);
        return;
      }

      setCreatedHotSeat(data.hot_seat);
      if (data._warning || data._fallback) {
        // Non-blocking: creation succeeded locally but DB isn't persisted.
        // Surface once in console; success screen still shows.
        console.warn(data._warning || 'Created with local fallback storage.');
      }
      setStep(4); // Success screen
      
      // Track first hot seat creation for activation
      const isFirst = !hasCreatedFirstHotSeat();
      if (isFirst) {
        markFirstHotSeatCreated(data.hot_seat.id);
        trackActivationEvent('first_hot_seat_created', { 
          hot_seat_id: data.hot_seat.id,
          category: selectedCategory,
          heat_level: heatLevel,
        });
        trackGrowthEvent('hot_seat_created', {
          hot_seat_id: data.hot_seat.id,
          category: selectedCategory,
          heat_level: heatLevel,
        });
      } else {
        trackGrowthEvent('hot_seat_created', {
          hot_seat_id: data.hot_seat.id,
          category: selectedCategory,
          heat_level: heatLevel,
        });
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdHotSeat) return;
    const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://burnboard.app'}/hot-seat/${createdHotSeat.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleShare = async () => {
    if (!createdHotSeat) return;
    const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://burnboard.app'}/hot-seat/${createdHotSeat.id}`;
    markFirstShareOpened();
    trackActivationEvent('share_cta_clicked', { hot_seat_id: createdHotSeat.id });
    if (navigator.share) {
      try {
        await navigator.share({
          title: `🔥 Put me on the Hot Seat — BURNBOARD`,
          text: `Roast me! I just put myself on the Hot Seat. Fire your best shots:`,
          url,
        });
      } catch {}
    } else {
      handleCopyLink();
    }
  };

  const selectedCat = CATEGORIES.find(c => c.id === selectedCategory);

  // ── Success Screen ──────────────────────────────────────────
  if (step === 4 && createdHotSeat) {
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://burnboard.app'}/hot-seat/${createdHotSeat.id}`;

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-lg mx-auto space-y-6 pt-8">
          {/* Success Header */}
          <div className="text-center space-y-4">
            <div className="text-6xl animate-bounce">🔥</div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#ff4d00]">
              You&apos;re on the Hot Seat
            </h1>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto">
              Share your link and watch the roasts roll in.
            </p>
          </div>

          {/* Hot Seat Summary Card */}
          <div className="bg-[#111] border border-[#ff4d00]/40 rounded-2xl p-5 space-y-4 shadow-[0_0_30px_rgba(255,77,0,0.15)]">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{selectedCat?.emoji || '🔥'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#ff4d00] font-mono font-bold uppercase">{selectedCat?.label || createdHotSeat.category}</p>
                <h2 className="text-base font-bold text-white truncate">{createdHotSeat.title}</h2>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="px-2 py-1 bg-[#1a1a1a] rounded-lg border border-[#333] text-zinc-300">
                {HEAT_LEVELS.find(h => h.id === createdHotSeat.heat_level)?.emoji} {HEAT_LEVELS.find(h => h.id === createdHotSeat.heat_level)?.label || createdHotSeat.heat_level}
              </span>
              <span className="px-2 py-1 bg-[#1a1a1a] rounded-lg border border-[#333] text-zinc-300">
                {createdHotSeat.display_name}
              </span>
            </div>

            {/* Share URL */}
            <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-3 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#ff4d00] shrink-0" />
              <span className="text-xs text-zinc-300 font-mono truncate flex-1">{shareUrl}</span>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopyLink}
                className={`py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  copied
                    ? 'bg-green-600 text-white'
                    : 'bg-[#1a1a1a] hover:bg-[#222] text-white border border-[#333] hover:border-[#ff4d00]/50'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>

              <button
                onClick={handleShare}
                className="py-3 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,77,0,0.4)]"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>

          {/* View Hot Seat */}
          <div className="text-center">
            {/* Show challenge completion message if this was from a challenge */}
            {challengeToken && (
              <div className="mb-4 bg-[#ff4d00]/10 border border-[#ff4d00]/30 rounded-xl p-3">
                <p className="text-xs font-mono text-[#ff4d00] font-bold">
                  🔥 Challenge Complete! You accepted the challenge.
                </p>
              </div>
            )}
            <Link
              href={`/hot-seat/${createdHotSeat.id}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] hover:border-[#ff4d00]/50 rounded-xl text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all"
            >
              <Eye className="w-4 h-4 text-[#ff4d00]" />
              View My Hot Seat
            </Link>
          </div>

          {/* Create Another */}
          <div className="text-center">
            <button
              onClick={() => {
                setStep(1);
                setSelectedCategory('');
                setTitle('');
                setContext('');
                setHeatLevel('savage');
                setDisplayName('');
                setCreatedHotSeat(null);
                setError('');
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono transition-colors"
            >
              + Create another Hot Seat
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Create Form ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222] pb-4">
          <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <div className="flex items-center gap-2 text-[#ff4d00] font-mono font-black text-sm">
            <Flame className="w-4 h-4 fill-[#ff4d00]" />
            <span>PUT ME ON THE HOT SEAT</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono">{error}</div>
        )}

        {/* Step Indicator */}
        <div className="flex items-center gap-2 justify-center">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                step >= s ? 'bg-[#ff4d00] text-black' : 'bg-[#1a1a1a] text-zinc-500 border border-[#333]'
              }`}>
                {step > s ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-[#ff4d00]' : 'bg-[#333]'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Category */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">What do you want roasted?</h2>
              <p className="text-xs text-zinc-400 mt-1">Pick a category for your Hot Seat.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-[#ff4d00]/10 border-[#ff4d00] shadow-[0_0_15px_rgba(255,77,0,0.2)]'
                      : 'bg-[#111] border-[#222] hover:border-[#333]'
                  }`}
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  <p className="text-sm font-bold text-white mt-2">{cat.label}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{cat.desc}</p>
                </button>
              ))}
            </div>

            <button
              onClick={() => { if (selectedCategory) setStep(2); }}
              disabled={!selectedCategory}
              className="w-full py-3 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(255,77,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Title & Context */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">What&apos;s the roast about?</h2>
              <p className="text-xs text-zinc-400 mt-1">Give people a clear target for their roasts.</p>
            </div>

            {/* Category Badge */}
            <div className="flex items-center gap-2 text-xs font-mono text-[#ff4d00]">
              <span className="text-lg">{selectedCat?.emoji}</span>
              <span className="font-bold uppercase">{selectedCat?.label}</span>
            </div>

            {/* Title Input */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                Title or Prompt *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Roast my startup idea"
                maxLength={200}
                className="w-full bg-[#111] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
              />
              <p className="text-[10px] text-zinc-500 mt-1 font-mono">{200 - title.length} chars left</p>
            </div>

            {/* Context Textarea */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                Context <span className="text-zinc-600">(optional)</span>
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g. I spent three months building this. Be honest."
                rows={3}
                maxLength={500}
                className="w-full bg-[#111] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30 resize-none"
              />
              <p className="text-[10px] text-zinc-500 mt-1 font-mono">{500 - context.length} chars left</p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                Display Name <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Anonymous"
                maxLength={40}
                className="w-full bg-[#111] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 bg-[#1a1a1a] hover:bg-[#222] text-zinc-300 font-bold rounded-xl transition-all border border-[#333] text-xs uppercase tracking-wider"
              >
                Back
              </button>
              <button
                onClick={() => { if (title.trim()) setStep(3); }}
                disabled={!title.trim()}
                className="flex-1 py-3 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(255,77,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Heat Level */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Choose your Heat Level</h2>
              <p className="text-xs text-zinc-400 mt-1">How intense should the roasts get?</p>
            </div>

            {/* Preview */}
            <div className="bg-[#111] border border-[#222] rounded-2xl p-4 space-y-2">
              <p className="text-[10px] text-zinc-500 font-mono uppercase">Your Hot Seat</p>
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedCat?.emoji}</span>
                <p className="text-sm font-bold text-white">{title}</p>
              </div>
              {context && <p className="text-xs text-zinc-400">{context}</p>}
            </div>

            <div className="space-y-3">
              {HEAT_LEVELS.map(level => (
                <button
                  key={level.id}
                  onClick={() => setHeatLevel(level.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    heatLevel === level.id
                      ? 'bg-[#ff4d00]/10 border-[#ff4d00] shadow-[0_0_15px_rgba(255,77,0,0.2)]'
                      : 'bg-[#111] border-[#222] hover:border-[#333]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{level.emoji}</span>
                    <div>
                      <p className="text-sm font-bold text-white">{level.label}</p>
                      <p className="text-[11px] text-zinc-400">{level.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <p className="text-[10px] text-zinc-500 text-center font-mono">
              Brutal does NOT mean harassment, hate speech, or targeted abuse.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 bg-[#1a1a1a] hover:bg-[#222] text-zinc-300 font-bold rounded-xl transition-all border border-[#333] text-xs uppercase tracking-wider"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(255,77,0,0.4)] disabled:opacity-40"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Flame className="w-4 h-4 fill-black" />
                    Create Hot Seat
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
