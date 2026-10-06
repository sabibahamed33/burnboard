'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Flame, Search, ArrowLeft, ArrowBigUp, MessageSquare } from 'lucide-react';
import useSWR from 'swr';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useDebouncedValue } from '@/lib/motion';
import Avatar from '@/components/ui/Avatar';
import { CommunityCard } from '@/components/communities';

/**
 * /search — Search page for finding targets, roasts, and content.
 * 
 * Provides real-time search across profiles and roasts.
 */

function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const fetchAllProfiles = async () => {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return data || [];
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);

  const { data: profiles = [], isLoading } = useSWR(
    isSupabaseConfigured ? 'search-profiles' : null,
    fetchAllProfiles,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  );

  const fetchCommunities = async (q) => {
    const res = await fetch(`/api/communities?q=${encodeURIComponent(q)}&sort=newest&limit=6`);
    if (!res.ok) return { communities: [] };
    return res.json();
  };

  const { data: communityData } = useSWR(
    debouncedQuery.trim() ? ['search-communities', debouncedQuery] : null,
    () => fetchCommunities(debouncedQuery),
    { revalidateOnFocus: false }
  );

  const results = useMemo(() => {
    if (!query.trim()) return { profiles: [], roasts: [] };

    const q = query.toLowerCase();
    const matchedProfiles = profiles.filter(p =>
      p.username?.toLowerCase().includes(q) ||
      p.bio?.toLowerCase().includes(q) ||
      p.platform?.toLowerCase().includes(q)
    );

    return { profiles: matchedProfiles, roasts: [] };
  }, [query, profiles]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-black text-white uppercase tracking-wider font-mono">Search</h1>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search targets, roasts, users..."
            autoFocus
            className="w-full bg-[#111] border border-[#222] rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-colors"
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#222] rounded-xl p-4 animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#222]" />
                <div className="space-y-2 flex-1">
                  <div className="w-32 h-4 bg-[#222] rounded" />
                  <div className="w-20 h-3 bg-[#1a1a1a] rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!isLoading && hasQuery && (
          <div className="space-y-4">
            {(communityData?.communities?.length || 0) > 0 && (
              <section className="space-y-3">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Communities ({communityData.communities.length})
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {communityData.communities.map(community => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
              </section>
            )}

            {results.profiles.length > 0 && (
              <section className="space-y-3">
                <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  Targets ({results.profiles.length})
                </p>
                {results.profiles.map(profile => (
                  <Link key={profile.id} href={`/#feed-card-${profile.id}`}>
                    <div className="bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-xl p-4 transition-all cursor-pointer group flex items-center gap-3">
                      <Avatar username={profile.username} size="md" color={profile.avatar_color} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate group-hover:text-[#ff4d00] transition-colors">
                          @{profile.username}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{profile.bio}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-mono text-zinc-500">{profile.roast_count || 0} roasts</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </section>
            )}

            {results.profiles.length === 0 && (
              <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-2">
                <div className="text-3xl">🔍</div>
                <p className="text-sm font-bold text-zinc-400">No results for &ldquo;{query}&rdquo;</p>
                <p className="text-xs text-zinc-500">Try a different search term</p>
              </div>
            )}
          </div>
        )}

        {/* Empty state when no query */}
        {!hasQuery && !isLoading && (
          <div className="text-center py-12 space-y-3">
            <div className="text-4xl">🔍</div>
            <p className="text-sm font-bold text-zinc-400">Search BurnBoard</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Find targets, roasts, and users across the platform
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
