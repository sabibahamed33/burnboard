import React from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PostClient from './PostClient';
import UgcPostLanding from './UgcPostLanding';

export async function generateMetadata({ params }) {
  const { id } = params;

  if (!isSupabaseConfigured || !supabase) {
    return {
      title: 'Profile - BURNBOARD',
      description: 'View this roast profile on BURNBOARD.',
    };
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    // Modern UGC posts live in social_posts; `/post/:id` must resolve them
    // too (they are the primary share targets). RLS hides removed/private rows.
    if (!profile) {
      const { data: post } = await supabase
        .from('social_posts')
        .select('id, content_type, content_text, user_id, created_at, user_profiles!inner(username, display_name)')
        .eq('id', id)
        .maybeSingle();

      if (!post) {
        return {
          title: 'Not Found - BURNBOARD',
          description: 'This content has been deleted or does not exist.',
          robots: { index: false },
        };
      }

      const authorName = post.user_profiles?.[0]?.username || 'someone';
      const excerpt = (post.content_text || 'A post on BurnBoard').slice(0, 120);
      const title = `@${authorName} on BurnBoard: "${excerpt.replace(/[\r\n]+/g, ' ')}…"`;
      const description = `"${excerpt.replace(/[\r\n]+/g, ' ')}…" — a ${post.content_type || 'post'} by @${authorName} on BurnBoard.`;

      return {
        title,
        description,
        alternates: { canonical: `https://burnboard.app/post/${id}` },
        openGraph: {
          type: 'article',
          url: `https://burnboard.app/post/${id}`,
          title,
          description,
          siteName: 'BURNBOARD',
          images: [{
            url: `/api/og?template=roast&text=${encodeURIComponent(excerpt)}&username=${encodeURIComponent(authorName)}`,
            width: 1080,
            height: 1080,
            alt: `@${authorName} post on BURNBOARD`,
          }],
        },
        twitter: {
          card: 'summary_large_image',
          title: `@${authorName} on BURNBOARD`,
          description,
        },
      };
    }

    // Get first roast for description
    const { data: roasts } = await supabase
      .from('roasts')
      .select('roast_text')
      .eq('profile_id', id)
      .order('upvotes', { ascending: false })
      .limit(1);

    const firstRoast = roasts?.[0]?.roast_text || '';
    const description = firstRoast
      ? `${profile.username} is getting roasted: "${firstRoast.slice(0, 120)}..." — ${profile.roast_count || 0} roasts on BURNBOARD`
      : `${profile.username} (${profile.platform}) is on BURNBOARD with ${profile.roast_count || 0} roasts. No AI. Just humans roasting humans.`;

    return {
      title: `${profile.username} is getting roasted (${profile.roast_count || 0} roasts) - BURNBOARD`,
      description,
      openGraph: {
        title: `@${profile.username} — ${profile.roast_count || 0} Roasts on BURNBOARD`,
        description,
        type: 'profile',
        url: `https://burnboard.app/post/${id}`,
        images: [
          {
            url: `/api/og?template=roast&text=${encodeURIComponent(firstRoast || 'No roasts yet')}&username=${encodeURIComponent(profile.username)}&platform=${encodeURIComponent(profile.platform)}`,
            width: 1080,
            height: 1080,
            alt: `${profile.username} roast on BURNBOARD`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `@${profile.username} — ${profile.roast_count || 0} Roasts`,
        description,
      },
    };
  } catch (err) {
    return {
      title: 'Profile - BURNBOARD',
      description: 'View this roast profile on BURNBOARD.',
    };
  }
}

export default async function PostPage({ params }) {
  const { id } = params;

  if (!isSupabaseConfigured || !supabase) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-mono">
        <div className="text-center space-y-4">
          <div className="text-4xl">🔥</div>
          <h1 className="text-xl font-bold">Post Unavailable</h1>
          <p className="text-xs text-zinc-400">This post can&apos;t be loaded right now. Please try again later.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl">
            ← Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  // Fetch real profile data
  let profile = null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    profile = data;
  } catch (err) {
    console.error('[Post Page] Fetch error:', err);
  }

  if (!profile) {
    // Resolve a modern UGC post (public + moderation-visible via RLS).
    let postRow = null;
    try {
      const { data } = await supabase
        .from('social_posts')
        .select('*, user_profiles!inner(id, username, display_name, avatar_url, bio), polls(*)')
        .eq('id', id)
        .maybeSingle();
      postRow = data;
    } catch (err) {
      console.error('[Post Page] UGC fetch error:', err);
    }

    if (postRow) {
      return <UgcPostLanding post={postRow} />;
    }

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-mono">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
            🏃‍♂️💨
          </div>
          <div className="space-y-1">
            <div className="text-xs text-[#ff4d00] font-bold uppercase tracking-widest">404 Error</div>
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              This content escaped the roast
            </h1>
          </div>
          <p className="text-xs text-zinc-400 max-w-sm">
            The post you are looking for has been deleted, purged, or was never created.
          </p>
          <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-mono font-black text-xs rounded-xl shadow transition-all">
            ← Return to Active Feed
          </Link>
        </div>
      </div>
    );
  }

  // Fetch real roasts
  let roasts = [];
  try {
    const { data } = await supabase
      .from('roasts')
      .select('*')
      .eq('profile_id', id)
      .order('created_at', { ascending: false });
    roasts = data || [];
  } catch (err) {
    console.error('[Post Page] Roast fetch error:', err);
  }

  // Add structured data for Google Rich Results
  const profileSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `@${profile.username} on BURNBOARD`,
    description: profile.bio || `${profile.username} roast profile on BURNBOARD`,
    url: `https://burnboard.app/post/${id}`,
    mainEntity: {
      '@type': 'Person',
      name: profile.username,
      description: profile.bio,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profileSchema) }}
      />
      <PostClient profile={profile} initialRoasts={roasts} />
    </>
  );
}
