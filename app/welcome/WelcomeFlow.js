'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Flame, ArrowRight, ArrowLeft, Check, Loader2, Sparkles, Users, Compass,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { trackGrowthEvent } from '@/lib/experiments';
import InterestPicker from '@/components/feed/InterestPicker';
import SuggestedForYou from '@/components/discover/SuggestedForYou';

const STEP_KEY = 'burnboard_welcome_step';
const DONE_KEY = 'burnboard_welcome_done';

const STEPS = ['Welcome', 'Identity', 'Interests', 'Discover', 'Start'];

/**
 * WelcomeFlow — short, skippable first-time setup.
 *
 * Every step reuses real systems (POST /api/profile for identity with
 * server-authoritative username validation, the real topics API via
 * InterestPicker, real follow suggestions via SuggestedForYou). Nothing is
 * forced: each step skips, entered input is preserved across steps, and the
 * validated destination (`next`) is honored at the end. Refreshing resumes
 * at the persisted step.
 */
export default function WelcomeFlow({ next = '/', here = '/welcome' }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [identityError, setIdentityError] = useState('');
  const [identityOk, setIdentityOk] = useState(false);

  // Resume after refresh; never reopen once done (this route is only
  // entered explicitly, but the guard is cheap and deterministic).
  // Client-side session check backs the server guard: signed-out visitors
  // bounce to /auth with this flow remembered (no protected content —
  // every step here is generic copy plus the visitor's own empty form).
  useEffect(() => {
    try {
      const saved = parseInt(sessionStorage.getItem(STEP_KEY) || '0', 10);
      if (Number.isFinite(saved) && saved >= 0 && saved < STEPS.length) setStep(saved);
    } catch {}
    // Funnel entry, recorded locally + server-side (never blocks setup).
    trackGrowthEvent('welcome_opened');
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && !data?.session) {
        router.replace(`/auth?next=${encodeURIComponent(here)}`);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill identity from the auth record (set at signup).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata || {};
      if (meta.username) setUsername(String(meta.username));
      if (meta.display_name) setDisplayName(String(meta.display_name));
    }).catch(() => {});
  }, []);

  const goStep = useCallback((n) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, n));
    setStep(clamped);
    try { sessionStorage.setItem(STEP_KEY, String(clamped)); } catch {}
  }, []);

  const finish = useCallback((skipped) => {
    try {
      sessionStorage.removeItem(STEP_KEY);
      localStorage.setItem(DONE_KEY, new Date().toISOString());
    } catch {}
    trackGrowthEvent('onboarding_completed', { skipped: !!skipped });
    router.push(next || '/');
  }, [next, router]);

  const skipAll = useCallback(() => {
    trackGrowthEvent('onboarding_skipped', { fromStep: STEPS[step] });
    finish(true);
  }, [finish, step]);

  // Save identity via the authoritative profile endpoint. Empty fields are
  // left untouched server-side; username conflicts surface inline.
  const saveIdentity = useCallback(async () => {
    setIdentityError('');
    const payload = {};
    if (displayName.trim()) payload.display_name = displayName.trim().slice(0, 50);
    if (bio.trim()) payload.bio = bio.trim().slice(0, 200);
    if (username.trim()) payload.username = username.trim();
    if (Object.keys(payload).length === 0) {
      goStep(2);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIdentityError(data.error || 'Could not save. You can skip and fix this later in Settings.');
        return;
      }
      setIdentityOk(true);
      trackGrowthEvent('profile_setup_completed');
      goStep(2);
    } catch {
      setIdentityError('Connection issue — your input is preserved. Retry or skip; nothing is lost.');
    } finally {
      setSaving(false);
    }
  }, [username, displayName, bio, goStep]);

  return (
    <div className="min-h-screen text-white flex items-center justify-center p-4 font-mono" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="w-full max-w-md space-y-5 animate-slide-up">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <div
                key={label}
                title={label}
                className={`h-1.5 rounded-full transition-all ${i <= step ? 'w-8 bg-[#ff4d00]' : 'w-4 bg-[#262626]'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={skipAll}
            className="min-h-[44px] px-3 text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            Skip all →
          </button>
        </div>

        <div className="glass-strong rounded-3xl p-6 space-y-5 sm:p-7">
          {/* ── Step 0: Welcome ─────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ff4d00] to-amber-600 flex items-center justify-center shadow-[0_0_30px_rgba(255,77,0,0.5)]">
                <Flame className="w-8 h-8 text-black fill-black" />
              </div>
              <h1 className="text-xl font-black uppercase tracking-tight">Get roasted by real humans</h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                No AI. Just humans. Discover posts, drop roasts and reactions,
                comment, follow people, join communities, and enter Battles
                or Challenges.
              </p>
              <div className="grid grid-cols-2 gap-2 text-left">
                {[
                  { icon: '🔥', text: 'Roast & react to posts' },
                  { icon: '💬', text: 'Comment & follow people' },
                  { icon: '👥', text: 'Join communities' },
                  { icon: '⚔️', text: 'Enter Battles & Challenges' },
                ].map((f) => (
                  <div key={f.text} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[11px] text-zinc-300">
                    <span aria-hidden="true">{f.icon}</span>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { track('welcome_step_continued', { step: 'welcome' }); goStep(1); }}
                className="btn-burn tactile w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
              >
                Set up my profile <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Step 1: Identity ────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h1 className="text-xl font-black uppercase tracking-tight">Your identity</h1>
                <p className="text-xs text-zinc-400">Everything is optional — skip and do it later in Settings.</p>
              </div>
              <div>
                <label htmlFor="welcome-username" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Username</label>
                <input
                  id="welcome-username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setIdentityError(''); setIdentityOk(false); }}
                  placeholder="your_username"
                  maxLength={20}
                  autoComplete="username"
                  className="min-h-[48px] w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
                />
                <p className="mt-1 text-[10px] text-zinc-600">3–20 characters: letters, numbers, underscores.</p>
              </div>
              <div>
                <label htmlFor="welcome-display" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Display name</label>
                <input
                  id="welcome-display"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John the Roaster"
                  maxLength={50}
                  autoComplete="nickname"
                  className="min-h-[48px] w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
                />
              </div>
              <div>
                <label htmlFor="welcome-bio" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Bio <span className="text-zinc-600 normal-case">(optional)</span></label>
                <textarea
                  id="welcome-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A line about you…"
                  rows={2}
                  maxLength={200}
                  className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30 resize-none"
                />
              </div>
              {identityError && (
                <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2.5 text-xs text-red-300">{identityError}</p>
              )}
              {identityOk && (
                <p role="status" className="flex items-center gap-1.5 text-xs text-emerald-300"><Check className="w-3.5 h-3.5" /> Saved.</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goStep(0)}
                  aria-label="Back"
                  className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={saveIdentity}
                  disabled={saving}
                  className="btn-burn tactile flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { track('welcome_step_skipped', { step: 'identity' }); goStep(2); }}
                className="w-full min-h-[32px] text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── Step 2: Interests (real topics API) ─────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h1 className="flex items-center justify-center gap-2 text-xl font-black uppercase tracking-tight">
                  <Sparkles className="w-5 h-5 text-[#ff4d00]" /> Pick interests
                </h1>
                <p className="text-xs text-zinc-400">Tunes your feed. Optional — skip freely.</p>
              </div>
              <InterestPicker onApplied={() => trackGrowthEvent('interest_selection_completed')} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goStep(1)}
                  aria-label="Back"
                  className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { track('welcome_step_continued', { step: 'interests' }); goStep(3); }}
                  className="btn-burn tactile flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => { track('welcome_step_skipped', { step: 'interests' }); goStep(3); }}
                className="w-full min-h-[32px] text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── Step 3: Discover (real suggestions only) ────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h1 className="flex items-center justify-center gap-2 text-xl font-black uppercase tracking-tight">
                  <Users className="w-5 h-5 text-[#ff4d00]" /> Find your people
                </h1>
                <p className="text-xs text-zinc-400">Real suggestions only — following is optional. New here? More people appear as the community grows; Explore always has more.</p>
              </div>
              <SuggestedForYou />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goStep(2)}
                  aria-label="Back"
                  className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { track('welcome_step_continued', { step: 'discover' }); goStep(4); }}
                  className="btn-burn tactile flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => { track('welcome_step_skipped', { step: 'discover' }); goStep(4); }}
                className="w-full min-h-[32px] text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── Step 4: Get started ─────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
                <Check className="h-7 w-7 text-emerald-400" />
              </div>
              <h1 className="text-xl font-black uppercase tracking-tight">You&apos;re in 🔥</h1>
              <p className="text-xs text-zinc-400">Pick where to start — nothing is required.</p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => finish(false)}
                  className="btn-burn tactile flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-sm font-black uppercase tracking-wider"
                >
                  <Compass className="w-4 h-4" /> Start exploring
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/create" onClick={() => finish(false)} className="flex min-h-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:border-[#ff4d00]/40 hover:text-white">
                    Create a post
                  </Link>
                  <Link href="/c" onClick={() => finish(false)} className="flex min-h-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:border-[#ff4d00]/40 hover:text-white">
                    Communities
                  </Link>
                  <Link href="/battle" onClick={() => finish(false)} className="flex min-h-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:border-[#ff4d00]/40 hover:text-white">
                    Battles
                  </Link>
                  <Link href="/challenges" onClick={() => finish(false)} className="flex min-h-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:border-[#ff4d00]/40 hover:text-white">
                    Challenges
                  </Link>
                </div>
              </div>
              <p className="text-[10px] text-zinc-600">You can finish your profile anytime in Settings → Profile.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
