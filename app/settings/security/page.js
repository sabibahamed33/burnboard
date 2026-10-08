'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, Loader2, Check, LogOut, Smartphone, KeyRound } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Settings → Security (real capabilities only).
 *
 * - Change password: real Supabase Auth updateUser (email sign-in only;
 *   OAuth users are told their password lives with their provider).
 * - This session: real current-session info + sign out everywhere on
 *   this device (supabase.auth.signOut).
 * - No other-sessions list exists in this architecture, so none is shown.
 * - No account-deletion flow exists, so none is offered (never faked).
 */
export default function SecurityCenterPage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [provider, setProvider] = useState(null);
  const [lastSignIn, setLastSignIn] = useState(null);
  const [error, setError] = useState('');

  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwOk, setPwOk] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isSupabaseConfigured || !supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        const prov = user.app_metadata?.provider || (user.email ? 'email' : 'unknown');
        setProvider(prov);
        setLastSignIn(user.last_sign_in_at || null);
      } catch {
        if (!cancelled) setError('Something went wrong. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const changePassword = async () => {
    setPwMsg('');
    setPwOk(false);
    if (newPw.length < 8) {
      setPwMsg('Use at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg('Passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password: newPw });
      if (upErr) {
        setPwMsg(friendlyAuthError(upErr.message));
        return;
      }
      setPwOk(true);
      setPwMsg('Password changed.');
      setNewPw('');
      setConfirmPw('');
    } catch {
      setPwMsg('Could not change password. Please try again.');
    } finally {
      setPwBusy(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch {} finally {
      try {
        window.location.href = '/';
      } catch {}
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-28 pt-6 sm:pb-16">
      <Link href="/settings" className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <header className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] p-6 backdrop-blur-xl">
        <h1 className="flex items-center gap-2 text-xl font-black text-white">
          <Lock className="h-5 w-5 text-emerald-400" /> Security
        </h1>
        <p className="mt-1 text-sm text-zinc-400">Protect your account and sessions.</p>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : !signedIn ? (
        <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-sm font-bold text-white">You&apos;re signed out.</p>
          <p className="text-xs text-zinc-500">Sign in to manage account security.</p>
          <Link href="/auth" className="inline-flex min-h-[44px] items-center rounded-2xl bg-white px-5 text-sm font-bold text-black">
            Sign in
          </Link>
        </div>
      ) : (
        <>
          {/* Sign-in method */}
          <section aria-label="Sign-in method" className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-white">
              <KeyRound className="h-4 w-4 text-zinc-400" /> How you sign in
            </h2>
            <p className="text-xs leading-relaxed text-zinc-400">
              {provider === 'email'
                ? 'Email and password. You can change your password below.'
                : `External provider${provider && provider !== 'unknown' ? ` (${provider})` : ''}. Your password is managed there — BurnBoard never sees it.`}
            </p>
          </section>

          {/* Change password (email accounts only — real capability) */}
          {provider === 'email' && (
            <section aria-label="Change password" className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
              <h2 className="text-sm font-extrabold text-white">Change password</h2>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password (8+ characters)"
                autoComplete="new-password"
                aria-label="New password"
                className="min-h-[48px] w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
              />
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                aria-label="Confirm new password"
                className="min-h-[48px] w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
              />
              {pwMsg && (
                <p role={pwOk ? 'status' : 'alert'} className={`text-xs ${pwOk ? 'text-emerald-300' : 'text-red-300'}`}>
                  {pwOk && <Check className="mr-1 inline h-3.5 w-3.5" />}{pwMsg}
                </p>
              )}
              <button
                onClick={changePassword}
                disabled={pwBusy || !newPw || !confirmPw}
                className="min-h-[44px] w-full rounded-2xl bg-white text-sm font-bold text-black transition-all hover:bg-zinc-200 disabled:opacity-50"
              >
                {pwBusy ? 'Saving…' : 'Save new password'}
              </button>
            </section>
          )}

          {/* This session */}
          <section aria-label="This session" className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-white">
              <Smartphone className="h-4 w-4 text-zinc-400" /> This session
            </h2>
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-zinc-500">This device & browser</span>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-300">Current</span>
            </div>
            {lastSignIn && (
              <p className="font-mono text-[11px] text-zinc-600">
                Signed in {new Date(lastSignIn).toLocaleString()}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-zinc-600">
              Only the current session is visible here. Signing out ends it on this device.
            </p>
          </section>

          {/* Sign out */}
          <button
            onClick={signOut}
            disabled={signingOut}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-zinc-200 transition-all hover:border-red-500/40 hover:text-white disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}
    </div>
  );
}

function friendlyAuthError(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('length') || m.includes('short') || m.includes('weak')) {
    return 'That password is too weak. Try a longer one.';
  }
  if (m.includes('same') || m.includes('different')) {
    return 'Choose a password different from your current one.';
  }
  if (m.includes('rate') || m.includes('limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return 'Could not change password. Please try again.';
}
