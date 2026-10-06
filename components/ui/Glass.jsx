'use client';

import React from 'react';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const SURFACE_CLASS = {
  primary: 'glass bb-card',
  secondary: 'glass-soft bb-card',
  elevated: 'glass-elevated bb-card',
  floating: 'glass-strong bb-card',
  modal: 'glass-modal',
  nav: 'glass-nav',
};

export function GlassSurface({ variant = 'primary', className, children, ...rest }) {
  return (
    <div className={cx(SURFACE_CLASS[variant] || SURFACE_CLASS.primary, className)} {...rest}>
      {children}
    </div>
  );
}

export function GlassCard({ variant = 'primary', hover = false, className, children, ...rest }) {
  return (
    <div
      className={cx(
        SURFACE_CLASS[variant] || SURFACE_CLASS.primary,
        hover && 'bb-card-hover glass-interactive',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function GlassButton({ variant = 'glass', className, children, ...rest }) {
  const base =
    variant === 'primary'
      ? 'btn-burn'
      : variant === 'glass'
        ? 'btn-glass'
        : 'pressable rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-[#ff4d00]/40 hover:text-white';
  return (
    <button className={cx(base, 'inline-flex items-center justify-center gap-2 px-4', className)} {...rest}>
      {children}
    </button>
  );
}

export function GlassInput({ className, ...rest }) {
  return <input className={cx('input-glass w-full px-4 text-sm', className)} {...rest} />;
}

export function GlassTextarea({ className, ...rest }) {
  return <textarea className={cx('input-glass w-full px-4 py-3 text-sm', className)} {...rest} />;
}

export function GlassBadge({ tone = 'neutral', className, children, ...rest }) {
  const toneClass =
    tone === 'burn'
      ? 'border-[#ff4d00]/50 bg-[#ff4d00]/15 text-[#ff8a3d]'
      : tone === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
        : tone === 'danger'
          ? 'border-red-500/40 bg-red-500/10 text-red-300'
          : 'glass-chip text-zinc-300';
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold', toneClass, className)} {...rest}>
      {children}
    </span>
  );
}

export function GlassAvatar({ name = '?', className, ...rest }) {
  return (
    <div
      aria-hidden
      className={cx(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#ff4d00] to-amber-400 text-sm font-black text-black shadow-[0_0_14px_rgba(255,77,0,0.35)]',
        className,
      )}
      {...rest}
    >
      {String(name).charAt(0).toUpperCase() || '?'}
    </div>
  );
}

export function GlassTabs({ tabs, active, onChange, className }) {
  return (
    <div role="tablist" aria-label="Content tabs" className={cx('glass-soft flex gap-1 overflow-x-auto rounded-2xl p-1 no-scrollbar', className)}>
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className={cx(
              'min-h-[44px] flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all',
              selected ? 'glass-tab-active' : 'text-zinc-400 hover:text-white',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function GlassSkeleton({ className }) {
  return <div aria-hidden className={cx('glass-skeleton min-h-[14px] w-full', className)} />;
}

export function GlassModal({ open, onClose, label, className, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label || 'Dialog'}>
      <button aria-label="Close dialog" onClick={onClose} className="overlay-dim anim-fade absolute inset-0" />
      <div className={cx('glass-modal anim-modal-in relative w-full max-w-lg overflow-hidden rounded-t-3xl p-5 pb-safe sm:rounded-3xl sm:p-6', className)}>
        <div className="sheet-handle mb-4 sm:hidden" aria-hidden />
        {children}
      </div>
    </div>
  );
}

export function GlassBottomSheet({ open, onClose, label, className, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label || 'Sheet'}>
      <button aria-label="Close sheet" onClick={onClose} className="overlay-dim anim-fade absolute inset-0" />
      <div className={cx('glass-modal anim-sheet-in relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl p-5 pb-safe', className)}>
        <div className="sheet-handle mb-4" aria-hidden />
        {children}
      </div>
    </div>
  );
}

/** Responsive share sheet: bottom sheet on mobile, centered modal on desktop. */
export function GlassShareSheet({ open, onClose, label = 'Share', className, children }) {
  return (
    <GlassModal open={open} onClose={onClose} label={label} className={cx('sm:max-w-md', className)}>
      {children}
    </GlassModal>
  );
}

/**
 * Async-action button with built-in loading state.
 * Prevents duplicate submissions: disabled while loading, spinner replaces icon.
 */
export function LoadingButton({ loading = false, disabled = false, variant = 'primary', className, children, ...rest }) {
  const busy = loading || disabled;
  return (
    <button
      aria-busy={loading}
      disabled={busy}
      className={cx(
        variant === 'primary' ? 'btn-burn' : 'btn-glass',
        'tactile inline-flex min-h-[44px] items-center justify-center gap-2 px-4 state-disabled',
        className,
      )}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function GlassToast({ title, body, tone = 'neutral' }) {
  return (
    <div className={cx('glass-strong toast-in flex items-start gap-3 rounded-2xl p-4', tone === 'error' && 'glass-active')}>
      <div className="min-w-0">
        <p className="text-sm font-bold text-white">{title}</p>
        {body ? <p className="type-secondary mt-0.5">{body}</p> : null}
      </div>
    </div>
  );
}

export function GlassMenu({ className, children, ...rest }) {
  return (
    <div className={cx('glass-strong overflow-hidden rounded-2xl p-1.5 animate-scale-in', className)} {...rest}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <GlassCard variant="secondary" className="flex flex-col items-center px-6 py-10 text-center">
      {icon ? <div className="glass-soft mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-[#ff4d00]">{icon}</div> : null}
      <h3 className="type-h3 text-white">{title}</h3>
      {body ? <p className="type-secondary mt-1.5 max-w-sm">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </GlassCard>
  );
}

export function ErrorState({ title = 'Something burned out', body = 'Please try again.', onRetry }) {
  return (
    <GlassCard variant="secondary" className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400" aria-hidden>
        !
      </div>
      <h3 className="type-h3 text-white">{title}</h3>
      <p className="type-secondary mt-1.5 max-w-sm">{body}</p>
      {onRetry ? (
        <button onClick={onRetry} className="btn-burn mt-5 inline-flex items-center px-5 py-2.5 text-xs">
          Try again
        </button>
      ) : null}
    </GlassCard>
  );
}
