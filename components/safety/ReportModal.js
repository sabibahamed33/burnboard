'use client';

import React, { useState } from 'react';
import { Loader2, Flag, X, ChevronLeft, Check } from 'lucide-react';
import { reasonsForTarget } from '@/lib/safety';

/**
 * ReportModal — premium Liquid Glass universal report flow (USER-only).
 *
 * Steps: Report → Why → Context → Submit → Confirmation.
 * Per-target reason subsets; no internal moderation terminology.
 * Mobile-first bottom sheet, desktop centered dialog, accessible.
 *
 * Props: targetType, targetId, onClose
 */
export default function ReportModal({ targetType, targetId, onClose }) {
  const reasons = reasonsForTarget(targetType);
  const [step, setStep] = useState('reason'); // reason | context | done
  const [category, setCategory] = useState(null);
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!category || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/safety/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId,
          category,
          context: context.trim() ? context.trim().slice(0, 500) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setDone(true);
      setStep('done');
    } catch {
      setError('Network error — please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Report content"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#121214]/90 backdrop-blur-xl shadow-2xl max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-[#121214]/90 backdrop-blur-xl z-10">
          <h3 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30">
              <Flag className="h-3.5 w-3.5 text-red-400" />
            </span>
            Report
          </h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
            aria-label="Close report dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        {!done && (
          <div className="px-5 pb-1">
            <div className="flex gap-1.5" aria-hidden="true">
              {['reason', 'context'].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full ${
                    (s === 'reason' && (step === 'reason' || step === 'context')) ||
                    (s === 'context' && step === 'context')
                      ? 'bg-red-500'
                      : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {done ? (
          <div className="px-6 py-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <Check className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="text-base font-bold text-white">Thanks for letting us know</p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              We&rsquo;ll review this. Playful roasts stay — harassment doesn&rsquo;t.
            </p>
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black hover:bg-zinc-200 min-h-[44px]"
            >
              Done
            </button>
          </div>
        ) : step === 'reason' ? (
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm font-semibold text-white">Why are you reporting this?</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Choose the closest reason. Context matters — roasting isn&rsquo;t automatically a violation.
            </p>
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1" role="radiogroup" aria-label="Report reason">
              {reasons.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setCategory(r.id)}
                  role="radio"
                  aria-checked={category === r.id}
                  className={`text-left px-4 py-3 rounded-2xl text-sm border transition-all min-h-[44px] ${
                    category === r.id
                      ? 'bg-red-500/10 border-red-500/50 text-red-200'
                      : 'bg-white/5 border-white/10 text-zinc-200 hover:border-white/25 hover:bg-white/10'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => category && setStep('context')}
                disabled={!category}
                className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-40 hover:bg-zinc-200 min-h-[44px]"
              >
                Continue
              </button>
              <button
                onClick={onClose}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-300 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <button
              onClick={() => setStep('reason')}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white min-h-[44px]"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <p className="text-sm font-semibold text-white">Anything else we should know? <span className="text-zinc-500 font-normal">(optional)</span></p>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Add helpful context…"
              rows={4}
              maxLength={500}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 resize-none"
              aria-label="Optional additional context"
            />
            <p className="text-[11px] text-zinc-500">{context.length}/500</p>
            {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={submit}
                disabled={!category || submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40 min-h-[44px]"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                Submit report
              </button>
              <button
                onClick={onClose}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-300 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
