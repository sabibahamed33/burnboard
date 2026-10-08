'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Gift, Loader2, X, Lock } from 'lucide-react';

/**
 * TipModal — \"Support this creator\" voluntary one-time tips (Master Prompt 15).
 *
 * Fetches the creator's standardized tip tiers (POST /api/monetization/tip),
 * then starts a provider checkout for the chosen amount. Every payment is
 * verified server-side by the webhook pipeline; supporters never enter card
 * data here and no card data is ever stored. Self-tips are rejected by the
 * server. Renders a friendly unavailable state when monetization isn't set up.
 */

export default function TipModal({ open, onClose, creatorId, creatorName }) {
  const [data, setData] = useState(null); // { available, prices, testMode }
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(null); // priceId
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    setLoading(true);
    const load = async () => {
      try {
        const res = await fetch('/api/monetization/tip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creator_id: creatorId }),
        });
        if (res.status === 401) {
          if (!cancelled) setSignedOut(true);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          if (json.error) setError(json.error);
        }
      } catch {
        if (!cancelled) setData({ available: false, prices: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, creatorId]);

  const startCheckout = useCallback(async (priceId) => {
    setStarting(priceId);
    setError('');
    try {
      const res = await fetch('/api/monetization/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || 'Checkout could not be started. Please try again.');
        return;
      }
      window.location.href = json.checkoutUrl;
    } catch {
      setError('Checkout could not be started. Please try again.');
    } finally {
      setStarting(null);
    }
  }, []);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`Support @${creatorName || 'this user'}`}
    >
      <div className="w-full max-w-sm bg-[#111] border border-[#333] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222]">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-[#ff4d00]" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">
              Support @{creatorName || 'user'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-zinc-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {signedOut ? (
            <div className="text-center space-y-3 py-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Sign in to support users. It&apos;s free to join and takes seconds.
              </p>
              <a
                href="/auth"
                className="inline-flex items-center justify-center w-full py-2.5 rounded-xl bg-[#ff4d00] text-black font-bold text-xs hover:bg-[#ff6622] transition-all"
              >
                Sign in
              </a>
            </div>
          ) : loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#ff4d00]" />
            </div>
          ) : !data?.available ? (
            <div className="text-center space-y-2 py-4">
              <p className="text-2xl">🔧</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {data?.error || 'Tips aren&apos;t available for this user yet.'}
              </p>
              <p className="text-[10px] font-mono text-zinc-600">
                Users activate support once monetization is enabled on this deployment.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-400 leading-relaxed">
                A voluntary one-time tip — a genuine thank-you with no hidden terms. It goes directly to the user (minus the standard platform fee).
              </p>

              <div className="grid grid-cols-2 gap-2">
                {data.prices.map(price => (
                  <button
                    key={price.id}
                    onClick={() => startCheckout(price.id)}
                    disabled={starting === price.id}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1a1a1a] border border-[#333] text-white font-black text-sm hover:border-[#ff4d00]/60 hover:bg-[#ff4d00]/10 transition-all disabled:opacity-50"
                  >
                    {starting === price.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      price.display
                    )}
                  </button>
                ))}
              </div>

              {data.testMode && (
                <p className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider border border-amber-400/30 bg-amber-400/10 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
                  ⚠️ TEST MODE — no real payment
                </p>
              )}

              {error && (
                <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3">
                  <p className="text-[11px] text-red-300">{error}</p>
                </div>
              )}

              <p className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
                <Lock className="w-3 h-3" />
                Payments verified server-side. No card data touches this page.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}