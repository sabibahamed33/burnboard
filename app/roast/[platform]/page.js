import React from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ProfileCardSkeleton } from '@/components/Skeleton';
import Link from 'next/link';
import { Flame, ArrowLeft, Search, TrendingUp, Clock, Skull } from 'lucide-react';
import PlatformFeed from './PlatformFeed';

// Platform SEO titles and metadata definitions
const PLATFORM_META = {
  linkedin: {
    name: 'LinkedIn',
    title: 'Best LinkedIn Roasts - BURNBOARD',
    description: 'Top brutal LinkedIn roasts by real humans. Corporate sycophancy, AI bro buzzwords, and thought leadership demolished.',
    keywords: 'LinkedIn roasts, LinkedIn lunatics, cringe corporate posts roasted, tech bro roasts',
    heroSubtitle: 'Corporate buzzwords, thought-leader delusion, and humblebrags put directly in the incinerator.',
    emoji: '💼',
  },
  github: {
    name: 'GitHub',
    title: 'Best GitHub Roasts - BURNBOARD',
    description: 'Top brutal GitHub roasts by real humans. 10x developer flexes, unfinished side projects, and commit history demolished.',
    keywords: 'GitHub roasts, programmer comedy, dev humor, 10x engineer memes, open source burns',
    heroSubtitle: 'Unfinished side projects, green square farmers, and 10x engineer egos roasted with zero mercy.',
    emoji: '🐙',
  },
  x: {
    name: 'X (Twitter)',
    title: 'Best X / Twitter Roasts - BURNBOARD',
    description: 'Top brutal X / Twitter roasts by real humans. Engagement baiters, thread boys, and hot-take merchants burned.',
    keywords: 'Twitter roasts, X platform roasts, engagement farming roasts, viral tweet roasts',
    heroSubtitle: 'Engagement farming, thread boys, and reply-guy philosophers held accountable by anonymous peers.',
    emoji: '🐦',
  },
  instagram: {
    name: 'Instagram',
    title: 'Best Instagram Roasts - BURNBOARD',
    description: 'Top brutal Instagram roasts by real humans. Aesthetic influencers, fake gurus, and gym mirror flexers destroyed.',
    keywords: 'Instagram roasts, influencer burns, aesthetic fake life memes, IG comedy',
    heroSubtitle: 'Over-filtered lifestyles, fake wealth courses, and gym mirror soliloquies shredded to pieces.',
    emoji: '📸',
  },
  tiktok: {
    name: 'TikTok',
    title: 'Best TikTok Roasts - BURNBOARD',
    description: 'Top brutal TikTok roasts by real humans. Dance trends, fake gurus, and algorithm slaves demolished.',
    keywords: 'TikTok roasts, TikTok comedy, social media burns, viral video roasts',
    heroSubtitle: 'Main character syndrome, algorithm slaves, and 15-second fame hunters shredded.',
    emoji: '🎵',
  },
  reddit: {
    name: 'Reddit',
    title: 'Best Reddit Roasts - BURNBOARD',
    description: 'Top brutal Reddit roasts by real humans. Karma farmers, armchair experts, and neckbeard philosophers burned.',
    keywords: 'Reddit roasts, Reddit comedy, karma farmer burns, subreddits roasts',
    heroSubtitle: 'Karma farmers, armchair experts, and "well actually" guys held accountable.',
    emoji: '🤖',
  },
};

export async function generateMetadata({ params }) {
  const platformKey = (params.platform || '').toLowerCase();
  const info = PLATFORM_META[platformKey] || {
    name: params.platform,
    title: `Best ${params.platform} Roasts - BURNBOARD`,
    description: `Top brutal ${params.platform} roasts written by real anonymous humans.`,
    keywords: `${params.platform} roasts, social media roasts, burnboard`,
  };

  let count = 0;
  if (isSupabaseConfigured && supabase) {
    try {
      const { count: c } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('platform', info.name);
      count = c || 0;
    } catch {}
  }

  const title = count > 0
    ? `Best ${info.name} Roasts (${count} profiles) - BURNBOARD`
    : info.title;
  const desc = count > 0
    ? `Top ${count} brutal ${info.name} roasts by real humans. No AI. ${count} profiles getting roasted live.`
    : info.description;

  return {
    title,
    description: desc,
    keywords: info.keywords,
    openGraph: {
      title,
      description: desc,
      type: 'website',
      url: `https://burnboard.app/roast/${platformKey}`,
      images: [
        {
          url: `/api/og?template=platform&platform=${encodeURIComponent(info.name)}&count=${count}`,
          width: 1080,
          height: 1080,
          alt: `${info.name} Roasts on BURNBOARD`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
    },
  };
}

export default async function PlatformRoastPage({ params }) {
  const platformKey = (params.platform || 'linkedin').toLowerCase();
  const info = PLATFORM_META[platformKey] || {
    name: params.platform,
    title: `Best ${params.platform} Roasts`,
    description: `Top brutal ${params.platform} roasts written by real humans.`,
    heroSubtitle: `All anonymous burns for ${params.platform} users and profiles.`,
    emoji: '🔥',
  };

  // Fetch REAL profiles filtered by platform
  let profiles = [];
  let profileCount = 0;
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, count } = await supabase
        .from('profiles')
        .select('*, roasts(*)', { count: 'exact' })
        .eq('platform', info.name)
        .order('created_at', { ascending: false });
      profiles = data || [];
      profileCount = count || 0;
    } catch (err) {
      console.error('[Platform Page] Fetch error:', err);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back nav */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Feed</span>
        </Link>

        {/* SEO Optimized Header */}
        <header className="space-y-3 text-center border-b border-[#222] pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#ff4d00]/10 border border-[#ff4d00]/30 rounded-full text-[#ff4d00] font-mono text-xs font-bold uppercase tracking-wider">
            {info.emoji} Platform SEO Index: {info.name}
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {info.title}
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto font-sans">
            {info.heroSubtitle}
          </p>
          {profileCount > 0 && (
            <p className="text-xs text-zinc-500 font-mono">
              {profileCount} {info.name} {profileCount === 1 ? 'profile' : 'profiles'} currently in the hot seat 🔥
            </p>
          )}
        </header>

        {/* SEO Content Section with Structured Keywords */}
        <section className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
            <span>Why {info.name} Users Get Roasted on BURNBOARD</span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            {info.description} Unlike generic AI-generated jokes, BURNBOARD relies 100% on real humans delivering high-IQ, brutal, anonymous burns with zero filter.
          </p>
          <p className="text-xs text-zinc-500 font-mono">
            Every roast is written by a real human. No AI. No bots. Just pure, unfiltered comedy.
          </p>
        </section>

        {/* Real Filtered Feed */}
        <PlatformFeed
          initialProfiles={profiles}
          platformKey={platformKey}
          platformName={info.name}
        />
      </div>
    </div>
  );
}
