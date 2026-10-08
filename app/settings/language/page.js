'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Languages, Loader2, Check } from 'lucide-react';
import { getLanguage, setLanguage, pushLanguageToAccount, syncLanguageFromAccount, SUPPORTED_LANGUAGES, t } from '@/lib/lang';

/**
 * Settings → Language (USER preference, persisted to account when signed in).
 * Native names, Liquid Glass, no reload jank beyond applying the locale.
 */
export default function LanguageSettingsPage() {
  const [current, setCurrent] = useState('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const synced = await syncLanguageFromAccount();
      setCurrent(synced || getLanguage());
    } catch {
      setCurrent(getLanguage());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const choose = async (code) => {
    if (code === current) return;
    setSaving(code);
    setError('');
    try {
      setLanguage(code);
      pushLanguageToAccount(code);
      setCurrent(code);
      setSaved(t('language_saved', code));
      setTimeout(() => setSaved(''), 2500);
    } catch {
      setError(t('err_generic', code));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-6">
      <Link href="/settings" className="flex min-h-[44px] items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t('back', current)}
      </Link>

      <header className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] backdrop-blur-xl p-6">
        <h1 className="flex items-center gap-2 text-xl font-black text-white">
          <Languages className="h-5 w-5 text-sky-400" /> {t('settings_language', current)}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">{t('settings_language_desc', current)}</p>
        {saved && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3.5 w-3.5" />{saved}</p>}
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
      ) : (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-3 space-y-1" role="radiogroup" aria-label={t('settings_language', current)}>
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              role="radio"
              aria-checked={current === l.code}
              onClick={() => choose(l.code)}
              disabled={saving !== null}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                current === l.code
                  ? 'border-sky-500/50 bg-sky-500/10'
                  : 'border-transparent hover:border-white/15 hover:bg-white/5'
              }`}
            >
              <span className="text-2xl" aria-hidden="true">{l.flag}</span>
              <span>
                <span className={`block text-sm font-bold ${current === l.code ? 'text-sky-200' : 'text-white'}`}>{l.label}</span>
                <span className="block text-[11px] text-zinc-500" dir="ltr">{l.code}</span>
              </span>
              {saving === l.code ? (
                <Loader2 className="ml-auto h-4 w-4 animate-spin text-zinc-400" />
              ) : current === l.code ? (
                <Check className="ml-auto h-4 w-4 text-sky-400" />
              ) : null}
            </button>
          ))}
        </section>
      )}

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        BurnBoard is one global community — your posts, comments, and roasts always stay exactly as you wrote them.
      </p>
    </div>
  );
}
