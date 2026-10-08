'use client';

import React, { useState } from 'react';
import { Link2, Check, Share2, MessageCircle, X, Loader2 } from 'lucide-react';
import { trackShare } from '@/lib/growth/share';
import SendViaMessageModal from '@/components/dm/SendViaMessageModal';

/**
 * ShareSheet — unified BurnBoard share experience (Liquid Glass).
 *
 * One surface for every share action the product supports:
 *   - Copy Link (canonical public URL → "Link copied.")
 *   - Native Share (only rendered when the device supports it)
 *   - Send via Message (only for DM-shareable kinds; the server
 *     re-validates visibility before attaching anything)
 *
 * Every completed share records a REAL server-validated share row via
 * trackShare (channel-tagged). Aborted native sheets track nothing.
 * Controlled: { open, onClose, resourceType, resourceId, url, title, text }.
 */

const DM_KINDS = {
  social_post: 'social_post',
  photo: 'social_post',
  profile: 'profile',
  community: 'community',
  challenge: 'challenge',
  battle: 'battle',
};

export default function ShareSheet({
  open,
  onClose,
  resourceType,
  resourceId,
  url,
  title = 'BurnBoard',
  text = 'Check this out on BurnBoard',
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [message, setMessage] = useState('');

  if (!open) return null;

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : 'https://burnboard.app');
  const dmKind = DM_KINDS[resourceType] || null;
  const canNative =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    (typeof navigator.canShare !== 'function' ||
      navigator.canShare({ title, text, url: shareUrl }));

  const doCopy = async () => {
    setBusy('copy');
    setMessage('');
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      await trackShare({ resourceType, resourceId, channel: 'copy' });
      window.setTimeout(() => {
        setCopied(false);
        onClose?.();
      }, 1200);
    } catch {
      setMessage('Copy failed — long-press the link instead.');
      await trackShare({ resourceType, resourceId, channel: 'link' });
    } finally {
      setBusy(null);
    }
  };

  const doNative = async () => {
    setBusy('native');
    setMessage('');
    try {
      await navigator.share({ title, text, url: shareUrl });
      await trackShare({ resourceType, resourceId, channel: 'native' });
      onClose?.();
    } catch (err) {
      // AbortError = dismissed sheet — not a share, no tracking.
      if (err?.name !== 'AbortError') {
        setMessage('Sharing is unavailable here — try Copy Link.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full overflow-hidden rounded-t-3xl border border-white/10 bg-[#121214]/90 shadow-2xl backdrop-blur-xl sm:max-w-sm sm:rounded-3xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <h3 className="text-sm font-extrabold tracking-tight text-white">Share</h3>
          <button
            onClick={onClose}
            aria-label="Close share dialog"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-4 py-3">
          {canNative && (
            <button
              onClick={doNative}
              disabled={!!busy}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 text-left transition-all hover:border-white/25 active:scale-[0.99] disabled:opacity-50"
            >
              {busy === 'native'
                ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                : <Share2 className="h-4 w-4 text-[#ff4d00]" />}
              <span>
                <span className="block text-sm font-bold text-white">Share via…</span>
                <span className="block text-[11px] text-zinc-500">System share sheet</span>
              </span>
            </button>
          )}

          <button
            onClick={doCopy}
            disabled={!!busy}
            className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 text-left transition-all hover:border-white/25 active:scale-[0.99] disabled:opacity-50"
          >
            {busy === 'copy'
              ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              : copied
                ? <Check className="h-4 w-4 text-emerald-400" />
                : <Link2 className="h-4 w-4 text-[#ff4d00]" />}
            <span>
              <span className="block text-sm font-bold text-white">
                {copied ? 'Link copied.' : 'Copy Link'}
              </span>
              <span className="block max-w-[240px] truncate font-mono text-[11px] text-zinc-500">{shareUrl}</span>
            </span>
          </button>

          {dmKind && resourceId && (
            <button
              onClick={() => setDmOpen(true)}
              disabled={!!busy}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 text-left transition-all hover:border-white/25 active:scale-[0.99] disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4 text-[#ff4d00]" />
              <span>
                <span className="block text-sm font-bold text-white">Send via Message</span>
                <span className="block text-[11px] text-zinc-500">Share privately in a conversation</span>
              </span>
            </button>
          )}

          {message && (
            <p role="alert" className="px-1 text-xs text-amber-300">{message}</p>
          )}
        </div>
      </div>

      {dmOpen && (
        <SendViaMessageModal
          sharedKind={dmKind}
          sharedId={resourceId}
          onClose={() => setDmOpen(false)}
        />
      )}
    </div>
  );
}
