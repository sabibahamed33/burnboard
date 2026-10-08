'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Flame, Search, Plus, Users, Loader2, Compass, Sparkles, ArrowLeft
} from 'lucide-react';
import { CommunityCard } from '@/components/communities';
import { track } from '@/lib/analytics';
import { getMutedCommunityIds } from '@/lib/communityMute';

/**
 * /c — Communities Hub
 *
 * Real communities only: newest, most members, search, and the user's own.
 * Discovery signals are real data (membership, recency) — no fake trending.
 */

const fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
};

export default function CommunitiesHubPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // Resolve auth user for "my communities"
  useEffect(() => {
    const getUser = async () => {
      const { supabase } = await import('@/lib/supabase');
      const { isSupabaseConfigured } = await import('@/lib/supabase');
      if (isSupabaseConfigured && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user || null);
      }
    };
    getUser();
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const searchUrl = debouncedQuery
    ? `/api/communities?q=${encodeURIComponent(debouncedQuery)}&sort=newest&limit=24`
    : null;

  const { data: searchData, isLoading: searchLoading } = useSWR(
    searchUrl,
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: newestData } = useSWR(
    debouncedQuery ? null : '/api/communities?sort=newest&limit=8',
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: popularData } = useSWR(
    debouncedQuery ? null : '/api/communities?sort=members&limit=8',
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: mineData } = useSWR(
    currentUser && !debouncedQuery ? '/api/communities?mine=true' : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Track search usage + hub discovery
  useEffect(() => {
    if (debouncedQuery) track('community_search_opened', { q: debouncedQuery });
  }, [debouncedQuery]);

  useEffect(() => {
    track('community_discovered', {});
  }, []);

  const myCommunities = mineData?.communities || [];
  const searched = searchData?.communities || [];
  const newest = newestData?.communities || [];
  const popular = popularData?.communities || [];

  // Muted communities stay out of discovery rails (your own memberships
  // are never hidden — muting only quiets discovery, not belonging).
  const [mutedIds, setMutedIds] = useState(new Set());
  useEffect(() => {
    setMutedIds(getMutedCommunityIds());
  }, [debouncedQuery]);
  const visibleNewest = newest.filter(c => !mutedIds.has(String(c.id)));
  const visiblePopular = popular.filter(c => !mutedIds.has(String(c.id)));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="space-y-4 py-4 border-b border-[#222]">
          <div className="flex items-center justify-between">
            <Link href="/home" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Feed</span>
            </Link>
            <Link
              href="/c/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold text-[11px] rounded-xl transition-all shadow-[0_0_15px_rgba(255,77,0,0.3)]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              NEW COMMUNITY
            </Link>
          </div>

          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 text-[#ff4d00]">
              <Users className="w-6 h-6" aria-hidden="true" />
              <h1 className="text-xl font-black uppercase tracking-wider font-mono">COMMUNITIES</h1>
            </div>
            <p className="text-xs text-zinc-400 font-mono">
              Find your people. Real spaces for real interests.
            </p>
          </div>
        </header>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search communities by name or topic..."
            className="w-full bg-[#111] border border-[#222] rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-colors"
            aria-label="Search communities"
          />
        </div>

        {/* Loading */}
        {searchLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-4 animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#222]" />
                  <div className="space-y-2 flex-1">
                    <div className="w-1/2 h-4 bg-[#222] rounded" />
                    <div className="w-2/3 h-3 bg-[#1a1a1a] rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search results */}
        {debouncedQuery && !searchLoading && (
          <section className="space-y-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">
              Results for &ldquo;{debouncedQuery}&rdquo;
            </h2>
            {searched.length === 0 ? (
              <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-3">
                <div className="text-3xl">🔍</div>
                <p className="text-sm font-bold text-zinc-400">No communities found</p>
                <p className="text-xs text-zinc-500">Try a different search, or start your own</p>
                <Link
                  href="/c/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Create Community
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {searched.map(c => <CommunityCard key={c.id} community={c} />)}
              </div>
            )}
          </section>
        )}

        {/* My communities */}
        {!debouncedQuery && myCommunities.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#ff4d00]" aria-hidden="true" />
              Your Communities
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myCommunities.map(c => (
                <CommunityCard
                  key={c.id}
                  community={{ ...c, viewer_membership: { isMember: true, role: c.role } }}
                />
              ))}
            </div>
          </section>
        )}

        {/* New communities */}
        {!debouncedQuery && (
          <section className="space-y-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">
              New Communities
            </h2>
            {newest.length === 0 && !searchLoading ? (
              <div className="bg-gradient-to-br from-[#1a0a00] via-[#111] to-[#0a0a0a] border-2 border-[#ff4d00]/30 rounded-3xl p-10 text-center space-y-4">
                <div className="text-5xl">🏙️</div>
                <h2 className="text-xl font-black text-white uppercase tracking-wider">
                  NO COMMUNITIES YET
                </h2>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Be the first to create a space. Pick a topic, set the vibe, and find your people.
                </p>
                <Link
                  href="/c/new"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_30px_rgba(255,77,0,0.4)] uppercase tracking-wider"
                >
                  <Flame className="w-4 h-4 fill-black" aria-hidden="true" />
                  CREATE THE FIRST COMMUNITY
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleNewest.map(c => <CommunityCard key={c.id} community={c} />)}
              </div>
            )}
          </section>
        )}

        {/* Most members */}
        {!debouncedQuery && visiblePopular.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono">
              Most Members
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visiblePopular.map(c => <CommunityCard key={c.id} community={c} />)}
            </div>
          </section>
        )}

        {/* Bottom CTA */}
        {!debouncedQuery && (
          <div className="text-center pt-6 pb-8 border-t border-[#222] space-y-4">
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
              Nothing like what you love exists yet?
            </p>
            <Link
              href="/c/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all shadow-[0_0_25px_rgba(255,77,0,0.3)] uppercase tracking-wider"
            >
              <Compass className="w-4 h-4" aria-hidden="true" />
              START YOUR OWN COMMUNITY
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}