'use client';

import React, { useState, useEffect } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { getLanguage, setLanguage, pushLanguageToAccount, syncLanguageFromAccount, SUPPORTED_LANGUAGES } from '@/lib/lang';

/**
 * LanguageSwitcher — Accessible language selector.
 * Uses Globe icon with dropdown. Persists to localStorage.
 */
export default function LanguageSwitcher() {
  const [currentLang, setCurrentLang] = useState('en');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setCurrentLang(getLanguage());
    // Pull the signed-in account preference (per-account, no leaks).
    syncLanguageFromAccount().then((synced) => {
      if (synced) setCurrentLang(synced);
    }).catch(() => {});
    const handler = (e) => {
      setCurrentLang(e.detail);
    };
    window.addEventListener('burnboard_lang_changed', handler);
    return () => window.removeEventListener('burnboard_lang_changed', handler);
  }, []);

  const handleSelect = (code) => {
    setLanguage(code);
    pushLanguageToAccount(code);
    setCurrentLang(code);
    setIsOpen(false);
    // Reload to apply translations across all components
    window.location.reload();
  };

  const current = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] border border-[#262626] rounded-xl text-xs font-mono text-zinc-400 hover:text-white transition-colors"
        title="Switch Language"
        aria-label="Switch Language"
        aria-expanded={isOpen}
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{current.flag}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 z-50 bg-[#111] border border-[#333] rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
            {SUPPORTED_LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-mono transition-colors ${
                  currentLang === lang.code
                    ? 'bg-[#ff4d00]/15 text-[#ff4d00] font-bold'
                    : 'text-zinc-300 hover:bg-[#1a1a1a] hover:text-white'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.label}</span>
                {currentLang === lang.code && (
                  <span className="ml-auto text-[#ff4d00]">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
