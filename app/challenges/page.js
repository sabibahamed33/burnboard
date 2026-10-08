'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Flame, Plus, Users, BellRing, X } from 'lucide-react';
import { ChallengeCard } from '@/components/challenges';
import { track } from '@/lib/analytics';

/**
 * /challenges — Challenge discovery hub.
 * Only real challenges are shown; empty sections are never fabricated.
 */

function SectionHeader({ icon, title, href, actionLabel }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden="true">{icon}</span>
        <h2 className="text-[15px] font-extrabold tracking-tight text-white">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="flex min-h-[36px] items-center gap-0.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-[#ff4d00]">
          {actionLabel || 'See all'} <span aria-hidden="true">›</span>
        </Link>
      )}
    </div>
  );
}

function SectionEmpty({ text, sub }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
      <p className="text-xs text-zinc-500">{text}</p>
      {sub && <p className="mt-1 font-mono text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}

async function fetchChallenges(scope) {
  const res = await fetch(`/api/challenges?scope=${scope}&limit=12`);
  if (!res.ok) throw new Error(`Failed to load ${scope}`);
  return res.json();
}

export default function ChallengesHubPage() {
  const [sections, setSections] = useState({
    active: null,
    newest: null,
    trending: null,
    mine: null,
    invites: null,
  });
  const [tab, setTab] = useState('active');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [active, newest, trending, mine, invites] = await Promise.all([
        fetchChallenges('active').catch(() => ({ challenges: [] })),
        fetchChallenges('newest').catch(() => ({ challenges: [] })),
        fetchChallenges('trending').catch(() => ({ challenges: [] })),
        fetchChallenges('mine').catch(() => ({ challenges: [] })),
        fetchChallenges('invites').catch(() => ({ challenges: [] })),
      ]);
      setSections({ active, newest, trending, mine, invites });
    } catch (err) {
      setError('Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Fire-and-forget discovery analytics
  useEffect(() => {
    if (!loading) track('challenges_hub_viewed', {});
  }, [loading]);

  const handleDeclineInvite = async (slug) => {
    try {
      const res = await fetch(`/api/challenges/${slug}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline' }),
      });
      if (res.ok) {
        const invites = await fetchChallenges('invites');
        setSections(prev => ({ ...prev, invites }));
      }
    } catch {}
  };

  const mineList = sections.mine?.challenges || [];
  const inviteList = sections.invites?.challenges || [];
  const showMine = mineList.length > 0 || (sections.mine && sections.mine.total > 0);
  const showInvites = inviteList.length > 0;

  // Ending Soon: real active challenges with deadlines, soonest first.
  // Challenges without ends_at stay in Active, never in this list.
  const endingSoon = (sections.active?.challenges || [])
    .filter((c) => c.ends_at && new Date(c.ends_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))
    .slice(0, 6);

  const TABS = [
    { key: 'active', label: 'Active' },
    { key: 'ending', label: 'Ending Soon' },
    { key: 'new', label: 'New' },
    ...(showMine ? [{ key: 'mine', label: 'Mine' }] : []),
  ];
  const showTab = (key) => tab === key;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Brand header */}
        <header className="flex min-h-[44px] items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5" aria-label="BurnBoard home">
            <Flame className="h-5 w-5 fill-[#ff4d00] text-[#ff4d00]" />
            <span className="text-[15px] font-black tracking-wide text-white">BURNBOARD</span>
          </Link>
          <Link
            href="/challenges/new"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#ff4d00] px-4 text-[11px] font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
            aria-label="Create a new challenge"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </Link>
        </header>

        {/* Hero */}
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-[28px] font-black leading-none tracking-tight text-white">
            <span aria-hidden="true">🔥</span> Challenges
          </h1>
          <p className="text-[13px] text-zinc-400">
            Jump in. Make something. Get noticed.
          </p>
        </div>

        {/* Tabs — each backed by a real scope */}
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1 no-scrollbar" role="tablist" aria-label="Challenges">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`min-h-[44px] flex-1 whitespace-nowrap rounded-xl px-4 text-xs font-bold transition-all active:scale-95 ${
                  active
                    ? 'bg-[#ff4d00] text-black shadow-[0_0_16px_rgba(255,77,0,0.35)]'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {error && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-4 text-center text-sm text-red-400 font-mono">
            {error} — <button onClick={loadAll} className="underline hover:text-white">Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-5 animate-pulse space-y-3">
                <div className="w-1/3 h-4 bg-[#222] rounded" />
                <div className="w-3/4 h-4 bg-[#1a1a1a] rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-8">
            {/* Invitations for you — pinned on every tab */}
            {showInvites && (
              <section className="space-y-3" aria-label="Challenge invitations for you">
                <SectionHeader icon="🔔" title="Invitations for you" />
                <div className="space-y-3">
                  {inviteList.map(challenge => (
                    <div key={challenge.id} className="flex items-center gap-3 rounded-[20px] border border-[#ff4d00]/25 bg-gradient-to-r from-[#1a1205] to-[#111] p-4">
                      <div className="flex-1 min-w-0">
                        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          <BellRing className="w-3 h-3 text-[#ff4d00]" />
                          @{challenge.creator?.username || 'Someone'} invited you
                        </p>
                        <Link href={`/challenges/${challenge.slug}`} className="mt-0.5 block truncate text-sm font-bold text-white hover:text-[#ff4d00] transition-colors">
                          {challenge.title}
                        </Link>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => handleDeclineInvite(challenge.slug)}
                          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 px-3 font-mono text-[11px] text-zinc-400 transition-all hover:border-red-500/50 hover:text-white"
                          aria-label={`Decline invitation to ${challenge.title}`}
                        >
                          <X className="w-3 h-3" /> Decline
                        </button>
                        <Link
                          href={`/challenges/${challenge.slug}`}
                          className="flex min-h-[44px] items-center rounded-xl bg-[#ff4d00] px-4 font-mono text-[11px] font-bold text-black transition-all hover:bg-[#ff6622] active:scale-95"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Active */}
            {showTab('active') && (
              <section className="space-y-3" aria-label="Active challenges">
                <SectionHeader icon="⚡" title="Active" href="/challenges?view=active" />
                {sections.active?.challenges?.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {sections.active.challenges.map(challenge => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <SectionEmpty text="No active challenges right now." sub="Be the first to start one." />
                )}
              </section>
            )}

            {/* Ending soon — real deadlines only, soonest first */}
            {showTab('ending') && (
              <section className="space-y-3" aria-label="Ending soon challenges">
                <SectionHeader icon="⏳" title="Ending soon" />
                {endingSoon.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {endingSoon.map(challenge => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <SectionEmpty text="Nothing ending soon." sub="Active challenges without deadlines stay under Active." />
                )}
              </section>
            )}

            {/* Trending */}
            {showTab('active') && (
              <section className="space-y-3" aria-label="Trending challenges">
                <SectionHeader icon="📈" title="Trending now" />
                {sections.trending?.challenges?.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {sections.trending.challenges.slice(0, 4).map(challenge => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <SectionEmpty text="Nothing trending yet." sub="Real momentum starts with the first entry." />
                )}
              </section>
            )}

            {/* New */}
            {showTab('new') && (
              <section className="space-y-3" aria-label="New challenges">
                <SectionHeader icon="🆕" title="New" />
                {sections.newest?.challenges?.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {sections.newest.challenges.map(challenge => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <SectionEmpty text="No challenges yet." sub="Create the first one and invite someone." />
                )}
              </section>
            )}

            {/* Mine */}
            {showTab('mine') && showMine && (
              <section className="space-y-3" aria-label="Your challenges">
                <SectionHeader icon="⚡" title="Your challenges" href="/challenges?view=mine" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {mineList.map(challenge => (
                    <ChallengeCard key={challenge.id} challenge={challenge} />
                  ))}
                </div>
              </section>
            )}

            {/* Create CTA */}
            <div className="space-y-4 border-t border-white/10 pt-6 text-center">
              <p className="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                Participation creates involvement. Start something.
              </p>
              <Link
                href="/challenges/new"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-[#ff4d00] px-6 text-sm font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Create a challenge
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
