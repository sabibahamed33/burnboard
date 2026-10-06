'use client';

/**
 * LiveStats — Real-time platform statistics from Supabase
 * Shows live profile count + roast count with realtime updates.
 * 100% real data. No demo data. Empty state if no Supabase.
 */

import React, { useState, useEffect } from 'react';
import { Flame, Users } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';

export default function LiveStats() {
  const [profileCount, setProfileCount] = useState(0);
  const [roastCount, setRoastCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const fetchCounts = async () => {
      try {
        const [profilesRes, roastsRes] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('roasts').select('id', { count: 'exact', head: true }),
        ]);

        // A missing table / RLS denial surfaces as an error (or 404 in the
        // network tab for head-count queries on fresh projects). That's fine —
        // stats are decorative, so stay silent and keep the last good value.
        if (!profilesRes.error) setProfileCount(profilesRes.count || 0);
        if (!roastsRes.error) setRoastCount(roastsRes.count || 0);
        if (!profilesRes.error && !roastsRes.error) setConnected(true);
      } catch {
        // Silent: stats must never break the page.
      }
    };

    fetchCounts();

    // Realtime subscription for live count updates (best-effort, never throws).
    return subscribeRealtime(
      supabase,
      'live-stats',
      (ch) =>
        ch
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'profiles' },
            () => setProfileCount(prev => prev + 1)
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'roasts' },
            () => setRoastCount(prev => prev + 1)
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'profiles' },
            () => setProfileCount(prev => Math.max(0, prev - 1))
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'roasts' },
            () => setRoastCount(prev => Math.max(0, prev - 1))
          ),
      (status) => {
        setConnected(status === 'SUBSCRIBED');
      }
    );
  }, []);

  if (!isSupabaseConfigured || !supabase) return null;

  return (
    <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
        <span className={connected ? 'text-emerald-400' : ''}>Live</span>
      </div>
      <span className="text-zinc-600">•</span>
      <div className="flex items-center gap-1">
        <Users className="w-3 h-3 text-zinc-500" />
        <span className="text-zinc-300 font-bold">{profileCount}</span>
        <span>profiles</span>
      </div>
      <span className="text-zinc-600">•</span>
      <div className="flex items-center gap-1">
        <Flame className="w-3 h-3 text-[#ff4d00]" />
        <span className="text-zinc-300 font-bold">{roastCount}</span>
        <span>roasts</span>
      </div>
      <span className="text-zinc-600">•</span>
      <span className="text-zinc-400">Realtime</span>
    </div>
  );
}
