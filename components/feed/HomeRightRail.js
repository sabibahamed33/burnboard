'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Flame, Gem, ArrowRight } from 'lucide-react';
import PeopleYouMayLike from '@/components/feed/PeopleYouMayLike';
import TrendingSidebar from '@/components/feed/TrendingSidebar';

function formatCount(n) {
  if (n == null) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * TopCommunities — five largest public communities (real member counts).
 * Links through to each community; joining happens there with correct
 * membership state (no guessed join buttons).
 */
function TopCommunities() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/communities?sort=members&limit=5');
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json();
        if (!cancelled) setItems((data.communities || data.items || []).slice(0, 5));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section aria-label="Top communities" className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-white">
          <Users className="h-4 w-4 text-[#ff4d00]" aria-hidden="true" />
          Top Communities
        </h3>
        <Link href="/c" className="font-mono text-[11px] text-[#ff4d00] transition-colors hover:text-white">
          View all →
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3 p-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-[#222]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-20 rounded bg-[#222]" />
                <div className="h-2 w-32 rounded bg-[#1a1a1a]" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {items.map((c) => (
            <Link
              key={c.id || c.slug}
              href={`/c/${c.slug}`}
              className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#ff4d00]/15 text-sm font-black text-[#ff4d00]" aria-hidden="true">
                {(c.name || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-white">{c.name}</span>
                <span className="block font-mono text-[10px] text-zinc-500">
                  {formatCount(c.member_count ?? c.memberCount)} members
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-[#ff4d00]">Open →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * PlusCard — honest Premium upsell (cosmetic/support framing only, matching
 * /premium: never ranking, reach, votes, or moderation). Hidden for active
 * Premium holders; shown on any entitlement-fetch failure (fail-open: it is
 * only a link card, never a state claim).
 */
function PlusCard() {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/monetization/entitlements', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && (data.activeKeys || []).includes('premium')) setIsPremium(true);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  if (isPremium) return null;

  return (
    <section aria-label="BurnBoard Premium" className="rounded-2xl border border-[#ff4d00]/25 bg-gradient-to-b from-[#1a0d02] to-[#0a0a0a] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#ff4d00]">
        <Flame className="h-3.5 w-3.5" aria-hidden="true" />
        BurnBoard Premium
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
        Cosmetic perks. No ads. Just you. Never a boost to ranking or reach.
      </p>
      <Link
        href="/premium"
        className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#ff4d00] px-4 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-95"
      >
        <Gem className="h-3.5 w-3.5" aria-hidden="true" />
        Upgrade <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}

/**
 * HomeRightRail — desktop rail for /home: people, trending, communities,
 * Premium. Every section is real data or hides itself; empty states never
 * invent content.
 */
export default function HomeRightRail({ signedIn }) {
  return (
    <div className="space-y-6">
      <PeopleYouMayLike signedIn={signedIn} />
      <TrendingSidebar />
      <TopCommunities />
      <PlusCard />
    </div>
  );
}
