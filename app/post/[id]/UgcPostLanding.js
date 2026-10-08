'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Flame, Share2 } from 'lucide-react';
import { FeedCard } from '@/components/feed';
import ShareSheet from '@/components/growth/ShareSheet';

/**
 * Public landing for a shared modern UGC post (social_posts).
 * Content-first: the visitor sees the actual content + author identity,
 * with a non-deceptive "join" option afterwards — never a forced login wall.
 */
export default function UgcPostLanding({ post }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const author = post.user_profiles?.[0] || post.user_profiles;
  const item = {
    id: post.id,
    type: post.content_type,
    text: post.content_text,
    mediaUrl: post.media_url,
    context: post.metadata?.context || null,
    author: {
      id: author?.id,
      username: author?.username,
      displayName: author?.display_name,
      avatarLetter: author?.username?.[0]?.toUpperCase() || '?',
      avatarColor: null,
      tagline: author?.bio,
    },
    reactions: {},
    totalReactions: 0,
    upvotes: post.upvote_count || 0,
    commentCount: post.comment_count || 0,
    userId: post.user_id,
    visibility: post.visibility || 'public',
    metadata: post.metadata || {},
    taggedUsers: post.taggedUsers || [],
    createdAt: post.created_at,
    poll: post.polls?.[0] || null,
  };
  const sharingOff = item.metadata?.permissions?.sharing === 'off';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Feed</span>
          </Link>
          {!sharingOff && (
            <>
              <button
                onClick={() => setSheetOpen(true)}
                aria-label="Share this post"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs font-bold text-zinc-300 transition-all hover:border-[#ff4d00]/40 hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
              <ShareSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                resourceType="social_post"
                resourceId={post.id}
                url={typeof window !== 'undefined' ? window.location.href : `https://burnboard.app/post/${post.id}`}
                title="🔥 BurnBoard"
                text={`"${post.content_text || ''}" — via BurnBoard`}
              />
            </>
          )}
        </div>

        <FeedCard item={item} />

        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 text-center space-y-3">
          <p className="text-sm font-black text-white uppercase tracking-wider">
            Enjoying the roast?
          </p>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            BurnBoard is real people sharing unfiltered hot takes, roasts, and
            battles — no AI, no filter.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link
              href={`/auth?next=${encodeURIComponent(`/post/${post.id}`)}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-black text-xs rounded-xl hover:bg-[#ff6622] transition-all"
            >
              <Flame className="w-4 h-4 fill-black" />
              Join BurnBoard
            </Link>
            <Link
              href="/home"
              className="px-5 py-2.5 bg-[#1a1a1a] border border-[#333] text-zinc-300 hover:text-white text-xs font-mono font-bold rounded-xl transition-all"
            >
              Browse the feed
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}