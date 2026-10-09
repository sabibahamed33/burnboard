'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Flame, TrendingUp, ArrowUpRight, Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import TodaysSpark from '@/components/reputation/TodaysSpark';

/**
 * TrendingSidebar — Desktop right sidebar with trending content.
 * 
 * Shows:
 *   - Top roasts by engagement
 *   - Quick links to popular content
 */

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function TrendingSidebar() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    const fetchTrending = async () => {
      try {
        // Get top roasts by engagement from last 24h. Hidden/moderated
        // roasts are excluded here exactly as in feeds (RLS backstop).
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('roasts')
          .select(`
            id, roast_text, upvotes, reaction_haha, reaction_brutal, reaction_cry,
            profiles!inner(username, avatar_letter, avatar_color),
            created_at
          `)
          .eq('is_hidden', false)
          .gte('created_at', since)
          .order('upvotes', { ascending: false })
          .limit(5);

        if (!error && data) {
          const scored = data.map(roast => ({
            ...roast,
            engagement: (
              (roast.reaction_haha || 0) * 3 +
              (roast.reaction_brutal || 0) * 2 +
              (roast.reaction_cry || 0) * 4 +
              (roast.upvotes || 0)
            ),
          }));

          scored.sort((a, b) => b.engagement - a.engagement);
          setTrending(scored);
        }
      } catch (err) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, []);

  return (
    <div className="space-y-6 sticky top-6">
      {/* Today's Spark */}
      <TodaysSpark />
      {/* Trending Now */}
      <div className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#222] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#ff4d00]" />
          <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono">
            TRENDING NOW
          </h3>
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="w-full h-3 bg-[#222] rounded" />
                <div className="w-2/3 h-2 bg-[#1a1a1a] rounded" />
              </div>
            ))}
          </div>
        ) : trending.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-[11px] text-zinc-500 font-mono">
              No trending content yet
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {trending.map((roast, index) => (
              <Link
                key={roast.id}
                href={`/r/${roast.id}`}
                className="block px-4 py-3 hover:bg-[#1a1a1a] transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-[10px] font-mono text-zinc-600 mt-1 shrink-0">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2 group-hover:text-white transition-colors">
                      &ldquo;{roast.roast_text}&rdquo;
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-zinc-500">
                      <span className="flex items-center gap-1">
                        <div className={`w-3 h-3 rounded-full flex items-center justify-center text-[6px] font-black ${roast.profiles?.avatar_color || 'bg-[#ff4d00] text-black'}`}>
                          {roast.profiles?.avatar_letter || '?'}
                        </div>
                        @{roast.profiles?.username || 'anon'}
                      </span>
                      <span>·</span>
                      <span className="text-[#ff4d00]">🔥 {formatCount(roast.engagement)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <Link
          href="/discover"
          className="block px-4 py-3 border-t border-[#222] text-center text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors"
        >
          See all trending →
        </Link>
      </div>

      {/* Quick Links */}
      <div className="bg-[#111] border border-[#222] rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono">
          EXPLORE
        </h3>
        <div className="space-y-1">
          {[
            { label: 'Hot Seats', href: '/hot-seat', emoji: '🪑' },
            { label: 'Battles', href: '/battle', emoji: '⚔️' },
            { label: 'Rankings', href: '/leaderboards', emoji: '🏆' },
            { label: 'Weekly Recap', href: '/weekly', emoji: '📅' },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-mono text-zinc-400 hover:text-white hover:bg-[#1a1a1a] transition-all"
            >
              <span>{link.emoji}</span>
              <span>{link.label}</span>
              <ArrowUpRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
