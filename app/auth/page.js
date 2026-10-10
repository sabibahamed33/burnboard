'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Flame, Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2, Check, AlertTriangle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { safeInternalPath } from '@/lib/growth/referral';
import { track } from '@/lib/analytics';
import { trackGrowthEvent } from '@/lib/experiments';

function getPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 2) return { score, label: 'Fair', color: 'bg-orange-500' };
  if (score <= 3) return { score, label: 'Good', color: 'bg-yellow-500' };
  if (score <= 4) return { score, label: 'Strong', color: 'bg-green-500' };
  return { score, label: 'Very Strong', color: 'bg-emerald-400' };
}

export default function AuthPage() {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [usernameSuggestion, setUsernameSuggestion] = useState('');
  // Expired/invalid callback links land here with ?error=auth_callback_failed.
  const [callbackError, setCallbackError] = useState('');
  // Email-confirmation-required projects: account exists, session pending.
  const [verifyPending, setVerifyPending] = useState('');
  // Password-reset confirmation state (forgot mode).
  const [resetSent, setResetSent] = useState('');
  // Deterministic post-success navigation: navigate EXACTLY once.
  // Without this, StrictMode double-effects + auth state callbacks could
  // assign window.location.href repeatedly (visible refresh loop).
  const navigatedRef = useRef(false);
  const timersRef = useRef([]);

  const navigateOnce = useCallback((url) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    window.location.href = url;
  }, []);

  // Set once an auth flow has SUCCEEDED and navigation is scheduled.
  // The submit button stays disabled from here until the page unloads, so
  // a double-click in the success beat can never create a duplicate
  // account/profile or overwrite the scheduled single navigation.
  const doneRef = useRef(false);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Switching tabs/modes re-arms the form (clears a stale success lock).
  // navigatedRef is intentionally NOT reset here: once a post-success
  // navigation is scheduled it must fire exactly once.
  useEffect(() => {
    doneRef.current = false;
  }, [mode]);

  const passwordStrength = getPasswordStrength(password);

  // Map low-level transport failures ("Failed to fetch", DNS, offline) to a
  // human-friendly message. Anything else passes through unchanged.
  const friendlyAuthError = (err, fallback) => {
    const msg = err?.message || '';
    if (
      typeof navigator !== 'undefined' && !navigator.onLine ||
      /failed to fetch|fetch failed|network|load failed|timeout|abort/i.test(msg)
    ) {
      return 'Cannot reach the authentication server. Check your connection and try again.';
    }
    return msg || fallback || 'Authentication failed. Please try again.';
  };

  // ── Post-signup continuation (Master Prompt 14) ────────────
  // Read the visitor's intended destination + optional referral from the URL
  // so a shared link → signup → original content loop keeps its context.
  const getNextPath = () => {
    try {
      return safeInternalPath(new URLSearchParams(window.location.search).get('next')) || null;
    } catch { return null; }
  };

  const getRefCode = () => {
    try {
      const ref = (new URLSearchParams(window.location.search).get('ref') || '').trim();
      return /^[a-z0-9]{6,12}$/i.test(ref) ? ref : null;
    } catch { return null; }
  };

  const getCallbackError = () => {
    try {
      return new URLSearchParams(window.location.search).get('error') || '';
    } catch { return ''; }
  };

  // Fire the real signup-destination save + referral claim (best-effort).
  const fireAttribution = useCallback(async ({ next, ref, isSignup }) => {
    if (isSignup && next) {
      fetch('/api/signup/destination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: next, ref: ref || '' }),
      }).catch(() => {});
    }
    if (ref) {
      // If the auth page itself carries ?ref=, record the visit up-front.
      fetch(`/api/referral/visit?code=${encodeURIComponent(ref)}`).catch(() => {});
    }
    // Claim any pending referral conversion cookie (idempotent server-side).
    fetch('/api/referral/claim', { method: 'POST' }).catch(() => {});
  }, []);

  // Returning users are redirected home; new visitors keep their destination.
  // Expired/invalid verification links surface a recovery message instead
  // of failing silently.
  // Guarded: runs once, cancelled on unmount, navigates at most once — so
  // this check can never drive a redirect loop by itself.
  useEffect(() => {
    if (getCallbackError() === 'auth_callback_failed') {
      setCallbackError(
        'That sign-in link expired or was already used. Sign in below with your password, or request a new link.'
      );
      track('auth_callback_failed_shown', {});
    }
    if (isSupabaseConfigured && supabase) {
      let cancelled = false;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled || !session || navigatedRef.current) return;
        fireAttribution({ next: null, ref: getRefCode(), isSignup: false });
        navigateOnce(getNextPath() || '/');
      }).catch(() => {});
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUsername = useCallback(async (value) => {
    const trimmed = value.trim();
    if (trimmed.length < 3 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameStatus('idle');
      setUsernameSuggestion('');
      return;
    }
    setUsernameStatus('checking');
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('username', trimmed)
          .single();
        if (data) {
          setUsernameStatus('taken');
          const num = Math.floor(Math.random() * 900) + 100;
          setUsernameSuggestion(`${trimmed}${num}`);
        } else {
          setUsernameStatus('available');
          setUsernameSuggestion('');
        }
      } else {
        // Backend unreachable/unconfigured: make no availability claim.
        setUsernameStatus('idle');
      }
    } catch {
      // Network/DB failure: make no availability claim (never fake "available").
      setUsernameStatus('idle');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (loading || doneRef.current) return; // duplicate-submission guard
    setLoading(true);

    try {
      if (!isSupabaseConfigured || !supabase) {
        console.error('[Auth] Backend not configured');
        setError('Authentication is temporarily unavailable. Please try again later.');
        setLoading(false);
        return;
      }

      const next = getNextPath();
      const ref = getRefCode();
      const trimmedEmail = email.trim();

      // ── Forgot password (email reset link, real Supabase flow) ──
      if (mode === 'forgot') {
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          setError('Enter the email address for your account.');
          setLoading(false);
          return;
        }
        trackGrowthEvent('password_reset_requested');
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/settings/security')}`,
        });
        if (resetError) {
          setError(friendlyAuthError(resetError, 'Could not send the reset email. Please try again.'));
        } else {
          // Neutral wording either way — never confirm whether the email
          // belongs to an account (no account-enumeration signal).
          setResetSent(trimmedEmail);
          setSuccess('');
        }
        setLoading(false);
        return;
      }

      if (mode === 'signup') {
        // Funnel entry: recorded locally + server-side (fire-and-forget,
        // never blocks signup). No PII — aggregate counts only.
        trackGrowthEvent('signup_started');        if (!username.trim() || username.length < 3) {
          setError('Username must be at least 3 characters');
          setLoading(false);
          return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
          setError('Username can only contain letters, numbers, and underscores');
          setLoading(false);
          return;
        }
        if (usernameStatus === 'taken') {
          setError(`Username taken — try ${usernameSuggestion || username + '123'}`);
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }
        if (!/\d/.test(password)) {
          setError('Password must contain at least 1 number');
          setLoading(false);
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.trim(), display_name: displayName.trim() || username.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next || '/')}`,
          }
        });

        if (signUpError) {
          // Neutral on existing accounts: guide without confirming whether
          // the email is registered (no account-enumeration signal).
          if (/already registered|already exists|already in use/i.test(signUpError.message || '')) {
            track('signup_existing_account', {});
            setError('An account with this email may already exist. Try signing in, or reset your password if needed.');
          } else {
            setError(friendlyAuthError(signUpError, 'Sign-up failed. Please try again.'));
          }
        } else if (data.user) {
          trackGrowthEvent('signup_completed');
          // Email-confirmation-required projects return a user but NO
          // session. Never claim a working account until the operation
          // confirms one: pending users get verification instructions and
          // a way to continue after confirming.
          if (!data.session) {
            setVerifyPending(email.trim());
            setSuccess('');
            setLoading(false);
            return;
          }
          const { error: profileError } = await supabase.from('user_profiles').upsert({
            id: data.user.id,
            username: username.trim(),
            display_name: displayName.trim() || username.trim(),
            karma: 0,
            level: 'Newbie',
          }, { onConflict: 'id', ignoreDuplicates: true });
          if (profileError) {
            // Repeated callbacks/inserts race on the same id: the profile
            // already exists, safe to continue silently. A username conflict
            // surfaces honestly — the user continues and fixes it in setup.
            const detail = `${profileError.message || ''} ${profileError.details || ''}`.toLowerCase();
            if (detail.includes('username')) {
              setError('That username was just taken. Continue — you can pick another in the next step.');
            }
            console.warn('[Auth] Profile insert:', profileError.message);
          }
          // Preserve the shared-link destination through signup (durable,
          // resurrected by /auth/callback when email confirmation is used).
          fireAttribution({ next, ref, isSignup: true });
          setSuccess('Account created! Setting things up...');
          // New accounts go through the short welcome flow first; the
          // original destination is preserved through it.
          // Single intentional navigation (navigateOnce guard) after a
          // short beat so the success state is perceivable. The session
          // cookie sync from @supabase/ssr + middleware means the /welcome
          // server guard now sees this session (previously it bounced back
          // to /auth in a loop).
          doneRef.current = true;
          timersRef.current.push(setTimeout(() => {
            navigateOnce(`/welcome?next=${encodeURIComponent(next || '/')}`);
          }, 1200));
        }
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(friendlyAuthError(signInError, 'Sign-in failed. Please try again.'));
        } else {
          // Real referral conversion on sign-in (idempotent, best-effort).
          fireAttribution({ next, ref, isSignup: false });
          if (signInData?.user) trackGrowthEvent('login_completed');
          setSuccess('Welcome back! Redirecting...');
          doneRef.current = true;
          timersRef.current.push(setTimeout(() => { navigateOnce(next || '/'); }, 1000));
        }
      }
    } catch (err) {
      setError(friendlyAuthError(err, 'Authentication failed'));
    } finally {
      // On success the button stays in its loading state until navigation
      // (doneRef) — no double-submit window during the success beat.
      if (!doneRef.current) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-md space-y-6 animate-slide-up">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff4d00] to-amber-600 flex items-center justify-center shadow-[0_0_30px_rgba(255,77,0,0.5)]">
              <Flame className="w-7 h-7 text-black fill-black" />
            </div>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight">
            {mode === 'signup' ? 'Join the Roast' : mode === 'forgot' ? 'Reset Password' : 'Welcome Back'}
          </h1>
          <p className="text-xs text-zinc-400">
            {mode === 'signup'
              ? 'Create an account to track your burns, earn karma, and build your roast reputation.'
              : mode === 'forgot'
                ? 'Enter your account email and we\u2019ll send you a reset link.'
                : 'Sign in to continue roasting and earning karma.'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass-strong rounded-3xl p-6 space-y-5 sm:p-7">
          {/* Tab Toggle (sign up / login — recovery uses its own header) */}
          {mode !== 'forgot' && (
          <div className="glass-soft flex p-1 rounded-2xl" role="tablist" aria-label="Authentication mode">
            <button
              onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'signup' ? 'bg-[#ff4d00] text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'login' ? 'bg-[#ff4d00] text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Login
            </button>
          </div>
          )}

          {/* Expired/invalid link recovery (from /auth/callback) */}
          {callbackError && (
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 font-mono space-y-2" role="alert">
              <p>{callbackError}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setCallbackError(''); setMode('login'); }}
                  className="text-[#ff4d00] underline underline-offset-2 hover:text-white"
                >
                  Continue to sign in
                </button>
                <button
                  type="button"
                  onClick={() => { setCallbackError(''); setMode('forgot'); setError(''); setSuccess(''); }}
                  className="text-zinc-400 underline underline-offset-2 hover:text-white"
                >
                  Get a new link
                </button>
              </div>
            </div>
          )}

          {/* Email-verification pending: account exists, session needs confirmation */}
          {verifyPending ? (
            <div className="space-y-4 text-center">
              <div className="bg-[#0a0a0a] border border-[#262626] rounded-2xl p-5 space-y-2.5">
                <p className="text-sm font-bold text-white">Check your email ✉️</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  We sent a confirmation link to <span className="text-zinc-200">{verifyPending}</span>.
                  Open it to verify your account, then continue below.
                </p>
              </div>
              {error && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono">{error}</div>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setError('');
                  setLoading(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                      trackGrowthEvent('verification_completed');
                      const next = getNextPath();
                      fireAttribution({ next, ref: getRefCode(), isSignup: true });
                      navigateOnce(`/welcome?next=${encodeURIComponent(next || '/')}`);
                    } else {
                      setError('Not verified yet — open the confirmation link first, then try again.');
                    }
                  } catch {
                    setError('Could not check verification status. Please try again.');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="btn-burn tactile w-full py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40"
              >
                {loading ? 'Checking…' : 'I verified — continue'}
              </button>
              <button
                type="button"
                onClick={() => { setVerifyPending(''); setMode('login'); setError(''); }}
                className="text-xs text-zinc-500 hover:text-zinc-300 font-mono"
              >
                Use a different email
              </button>
            </div>
          ) : (
          <>
          {/* Messages */}
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono">{error}</div>
          )}
          {success && (
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-400 font-mono">{success}</div>
          )}
          {resetSent && mode === 'forgot' && (
            <div className="bg-[#0a0a0a] border border-[#262626] rounded-2xl p-5 space-y-2.5 text-center">
              <p className="text-sm font-bold text-white">Reset link sent ✉️</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                If an account exists for <span className="text-zinc-200">{resetSent}</span>, a reset link is on its way.
                It expires soon — open it promptly.
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Username</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setUsernameStatus('idle'); }}
                      onBlur={(e) => checkUsername(e.target.value)}
                      placeholder="your_username"
                      required
                      maxLength={24}
                      className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
                    />
                    {usernameStatus === 'checking' && (
                      <Loader2 className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
                    )}
                    {usernameStatus === 'available' && (
                      <Check className="w-4 h-4 text-green-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                    {usernameStatus === 'taken' && (
                      <AlertTriangle className="w-4 h-4 text-red-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                  {usernameStatus === 'taken' && usernameSuggestion && (
                    <p className="text-[10px] text-red-400 mt-1 font-mono">
                      Username taken — try{' '}
                      <button
                        type="button"
                        onClick={() => { setUsername(usernameSuggestion); setUsernameStatus('available'); }}
                        className="text-[#ff4d00] underline hover:text-white"
                      >
                        {usernameSuggestion}
                      </button>
                    </p>
                  )}
                  {usernameStatus === 'available' && username.trim().length >= 3 && (
                    <p className="text-[10px] text-green-400 mt-1 font-mono">Username available ✓</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Display Name</label>
                  <div className="relative">
                    <span className="text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 text-sm">👤</span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="John the Roaster"
                      maxLength={40}
                      className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  required
                  className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full bg-[#0a0a0a] border border-[#262626] rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all ${
                          i <= passwordStrength.score ? passwordStrength.color : 'bg-[#262626]'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">Min 8 chars + 1 number</span>
                    <span className={`text-[10px] font-bold ${
                      passwordStrength.score <= 1 ? 'text-red-400' :
                      passwordStrength.score <= 2 ? 'text-orange-400' :
                      passwordStrength.score <= 3 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                </div>
              )}
            </div>
            )}

            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setSuccess(''); setCallbackError(''); }}
                  className="text-[11px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors min-h-[32px]"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-burn tactile w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider disabled:opacity-40"
            >
              {loading ? <span className="spinner w-4 h-4" aria-hidden /> : (
                <>
                  <Flame className="w-4 h-4 fill-black" />
                  <span>{mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            {mode === 'signup' && (
              <p className="text-center text-[10px] font-mono text-zinc-600">
                By creating an account you agree to our{' '}
                <a href="/terms" className="text-zinc-400 underline underline-offset-2 hover:text-white">Terms</a>
                {' '}and{' '}
                <a href="/privacy" className="text-zinc-400 underline underline-offset-2 hover:text-white">Privacy Policy</a>.
              </p>
            )}
          </form>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccess(''); setResetSent(''); }}
              className="w-full min-h-[32px] text-xs text-zinc-500 hover:text-zinc-300 font-mono"
            >
              ← Back to sign in
            </button>
          )}

          {/* Anonymous Option */}
          <div className="text-center pt-2 border-t border-[#222]">
            <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono">
              Skip — Continue as Anonymous 🔥
            </a>
          </div>
          </>
          )}
        </div>

        {/* Benefits */}
        {mode === 'signup' && (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Why create an account?</h3>
            <div className="space-y-2">
              {[
                { icon: '🏆', text: 'Earn karma & level up (Newbie → Savage)' },
                { icon: '📊', text: 'Track all your roasts in one profile' },
                { icon: '🔥', text: 'Build your roast reputation publicly' },
                { icon: '👤', text: 'Custom profile at /u/yourname' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs text-zinc-400">
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
