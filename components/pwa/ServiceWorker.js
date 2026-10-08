'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * PWA shell helpers (USER experience, Liquid Glass, non-blocking):
 *  - ServiceWorkerRegistrar: registers /sw.js once, surfaces a subtle
 *    "New version available → Refresh" pill when an update is waiting.
 *    Never interrupts typing, posting, messaging, or safety flows.
 *  - ConnectionBanner: neutral offline indicator with manual retry.
 *    No fake success — actions still require a connection.
 */

export function ServiceWorkerRegistrar() {
  const [updateWaiting, setUpdateWaiting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let registration = null;
    let cancelled = false;

    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller && !cancelled) {
          setUpdateWaiting(true);
        }
      });
    };

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (cancelled) return;
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        setUpdateWaiting(true);
        return;
      }
      reg.addEventListener('updatefound', onUpdateFound);
    }).catch(() => {
      // SW is progressive enhancement — never break the app.
    });

    // A new worker taking control means fresh assets are live.
    const onControllerChange = () => setUpdateWaiting(false);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelled = true;
      registration?.removeEventListener('updatefound', onUpdateFound);
      navigator.serviceWorker.removeEventListener?.('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg?.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else {
            window.location.reload();
          }
        });
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, []);

  if (!updateWaiting) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-2xl border border-white/10 bg-[#121214]/90 backdrop-blur-xl px-4 py-2.5 shadow-2xl"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="text-xs font-semibold text-zinc-200">New version available</span>
      <button
        onClick={applyUpdate}
        className="min-h-[36px] rounded-xl bg-white px-3 text-xs font-bold text-black hover:bg-zinc-200"
      >
        Refresh
      </button>
    </div>
  );
}

export function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('onLine' in navigator)) return;
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  const retry = () => {
    setRetrying(true);
    try {
      if (navigator.onLine) {
        window.location.reload();
      } else {
        window.setTimeout(() => setRetrying(false), 1500);
      }
    } catch {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[70] flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-950/90 backdrop-blur-xl px-4 py-2"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-400" />
      <span className="text-xs font-semibold text-amber-200">You&rsquo;re offline. Reconnect to continue.</span>
      <button
        onClick={retry}
        disabled={retrying}
        className="flex min-h-[32px] items-center gap-1 rounded-lg border border-amber-500/40 px-2.5 text-[11px] font-bold text-amber-200 disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
        {retrying ? 'Checking…' : 'Retry'}
      </button>
    </div>
  );
}
