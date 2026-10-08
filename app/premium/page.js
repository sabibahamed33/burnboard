'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Gem, Check, Loader2, ArrowRight, ShieldCheck, CreditCard } from 'lucide-react';

/**
 * /premium — BurnBoard Premium landing page (Master Prompt 15).
 *
 * Transparent, no-scarcity pricing: real catalog + real prices from
 * /api/monetization/catalog. Checkout starts only from an explicit button
 * tap; recurring billing terms are stated plainly. In dev/test a TEST MODE
 * badge is shown; everything renders gracefully when monetization isn't
 * available yet.
 */

export default function PremiumPage() {
  const [catalog, setCatalog] = useState(null); // { available, products, testMode }
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null); // priceId being checked out
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/monetization/catalog');
        const data = await res.json();
        if (!cancelled) setCatalog(data);
      } catch {
        if (!cancelled) setCatalog({ available: false, products: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const startCheckout = useCallback(async (priceId) => {
    setStarting(priceId);
    setError('');
    // Revenue funnel event (MP24, Section 87): upgrade intent. Best-effort,
    // non-blocking — analytics never stands between a user and checkout.
    fetch('/api/growth/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'upgrade_started',
        subjectId: null,
        metadata: { product_key: 'premium', price_id: priceId },
      }),
    }).catch(() => {});
    try {
      const res = await fetch('/api/monetization/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Checkout could not be started. Please sign in and try again.');
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError('Checkout could not be started. Please try again.');
    } finally {
      setStarting(null);
    }
  }, []);

  const premium = catalog?.products?.find(p => p.key === 'premium');

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-6 py-6">
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
            <Gem className="w-7 h-7" />
            <h1 className="text-2xl font-black uppercase tracking-wider font-mono">BurnBoard Premium</h1>
          </div>
          <p className="text-xs text-zinc-400 max-w-md mx-auto font-mono leading-relaxed">
            More tools for posting, more control for everyone. Real value — never a paywall on safety, privacy, or basic participation.
          </p>

          {catalog?.testMode && (
            <p className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider border border-amber-400/30 bg-amber-400/10 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
              ⚠️ TEST MODE — no real payments
            </p>
          )}
        </header>

        {loading && (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#ff4d00]" />
          </div>
        )}

        {!loading && (!catalog?.available || !premium) && (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-3">
            <p className="text-3xl">🔧</p>
            <p className="text-sm font-bold text-zinc-300">Premium isn&apos;t available on this deployment yet.</p>
            <p className="text-xs text-zinc-500">Once the monetization migration is applied and a provider is configured, pricing will appear here.</p>
          </div>
        )}

        {/* Value points — features stay honest, no paywalled safety */}
        {!loading && premium && (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { emoji: '📊', title: 'Advanced insights', text: 'Deeper insight into what performs, built on real data. Available to every user.' },
                { emoji: '🎨', title: 'Profile customization', text: 'Make your profile yours without losing your identity.' },
                { emoji: '🚀', title: 'Priority discovery & controls', text: 'More tools to find and be found — and to tune your feed.' },
              ].map(f => (
                <div key={f.title} className="bg-[#111] border border-[#222] rounded-2xl p-4">
                  <p className="text-2xl mb-2">{f.emoji}</p>
                  <p className="text-sm font-bold text-white">{f.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{f.text}</p>
                </div>
              ))}
            </div>

            {/* Pricing */}
            <div className="grid sm:grid-cols-2 gap-4">
              {(premium.prices || []).map(price => (
                <div key={price.id} className="bg-gradient-to-br from-[#1a0a00] via-[#111] to-[#0a0a0a] border-2 border-[#ff4d00]/30 rounded-2xl p-6 space-y-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-white">{price.label}</p>
                    <p className="text-2xl font-black text-[#ff4d00]">{price.display}</p>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-500 -mt-2">{price.periodLabel}</p>
                  <button
                    onClick={() => startCheckout(price.id)}
                    disabled={starting === price.id}
                    className="w-full py-3 rounded-xl bg-[#ff4d00] hover:bg-[#ff6622] text-black font-black text-sm transition-all shadow-[0_0_20px_rgba(255,77,0,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {starting === price.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Get Premium <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <div className="space-y-1.5">
                    {(premium.features || []).map((f, i) => (
                      <p key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                        <Check className="w-3.5 h-3.5 text-[#ff4d00] mt-0.5 shrink-0" />
                        {f}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Honest billing terms */}
            <div className="bg-[#0e0e0e] border border-[#1f1f1f] rounded-2xl p-4 space-y-2 text-[11px] text-zinc-500 leading-relaxed">
              <p className="flex items-center gap-2 font-bold text-zinc-300">
                <ShieldCheck className="w-4 h-4 text-[#ff4d00]" />
                Clear terms, always
              </p>
              <p>• You are never auto-charged. Every purchase requires an explicit, informed tap.</p>
              <p>• Recurring plans renew only if you keep them; you can cancel at any time and keep access until the end of the paid period.</p>
              <p>• Blocking, reporting, privacy controls, and core safety features are free for everyone — always.</p>
            </div>

            {error && (
              <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-4 text-center">
                <p className="text-xs text-red-400 font-mono">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-zinc-600">
              <CreditCard className="w-3.5 h-3.5" />
              Payments are processed securely and verified server-side.
            </div>
          </>
        )}

        <p className="text-center pb-4">
          <Link href="/settings/billing" className="text-[11px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors">
            Manage your subscription & billing history →
          </Link>
        </p>
      </div>
    </div>
  );
}