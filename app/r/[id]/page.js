import React from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import RoastDetailClient from './RoastDetailClient';

/**
 * /r/[id] — Individual Roast Detail Page
 * 
 * Displays a single roast with full context, reactions, and engagement.
 * This is the content detail experience for the social feed.
 */

export async function generateMetadata({ params }) {
  const { id } = params;

  if (!isSupabaseConfigured || !supabase) {
    return {
      title: 'Roast - BURNBOARD',
      description: 'View this roast on BURNBOARD.',
    };
  }

  try {
    const { data: roast } = await supabase
      .from('roasts')
      .select('*, profiles!inner(username, platform, bio)')
      .eq('id', id)
      .single();

    if (!roast) {
      return {
        title: 'Roast Not Found - BURNBOARD',
        robots: { index: false },
      };
    }

    const description = `"${roast.roast_text.slice(0, 150)}..." — via BURNBOARD`;
    const profile = roast.profiles;

    return {
      title: `Roast by ${roast.anon_id || 'Anonymous'} on @${profile?.username || 'target'} - BURNBOARD`,
      description,
      openGraph: {
        title: `🔥 ${roast.anon_id || 'Anonymous'} roasted @${profile?.username || 'target'}`,
        description,
        type: 'article',
        url: `https://burnboard.app/r/${id}`,
      },
      twitter: {
        card: 'summary',
        title: `🔥 Roast on BURNBOARD`,
        description,
      },
    };
  } catch {
    return {
      title: 'Roast - BURNBOARD',
      description: 'View this roast on BURNBOARD.',
    };
  }
}

export default async function RoastDetailPage({ params }) {
  const { id } = params;

  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-mono">
        <div className="text-center space-y-4">
          <div className="text-4xl">🔥</div>
          <h1 className="text-xl font-bold">Roast Unavailable</h1>
          <p className="text-xs text-zinc-400">This roast can&apos;t be loaded right now. Please try again later.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl">
            ← Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  // Fetch the roast with profile data
  let roast = null;
  try {
    const { data } = await supabase
      .from('roasts')
      .select(`
        *,
        profiles!inner(id, username, platform, avatar_letter, avatar_color, tagline, bio)
      `)
      .eq('id', id)
      .single();
    roast = data;
  } catch (err) {
    console.error('[Roast Detail] Fetch error:', err);
  }

  if (!roast) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-mono">
        <div className="text-center space-y-4">
          <div className="text-4xl">🏃‍♂️💨</div>
          <h1 className="text-xl font-bold text-white">ROAST NOT FOUND</h1>
          <p className="text-xs text-zinc-400 max-w-sm">
            This roast may have been removed or the link is incorrect.
          </p>
          <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl">
            ← Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  // Fetch related roasts from same profile
  let relatedRoasts = [];
  try {
    const { data } = await supabase
      .from('roasts')
      .select('id, roast_text, upvotes, reaction_haha, reaction_brutal, reaction_cry, anon_id, created_at')
      .eq('profile_id', roast.profile_id)
      .neq('id', id)
      .order('upvotes', { ascending: false })
      .limit(5);
    relatedRoasts = data || [];
  } catch {}

  return <RoastDetailClient roast={roast} relatedRoasts={relatedRoasts} />;
}
