'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ShareButton from '@/components/growth/ShareButton';

function timeAgo(dateString) {
  if (!dateString) return '';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Hashtag content (client): the privacy-filtered hashtag scope of the
 * search backend (tags + matching posts + related tags).
 */
export default function HashtagClient({ tag }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(`#${tag}`)}&scope=hashtags&limit=12`);
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body.success) setData(body.hashtags || { tags: [], posts: [] });
      } catch {} finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tag]);

  const posts = data?.posts || [];
  const related = (data?.tags || []).map((t) => t.tag).filter((t) => t && t !== tag).slice(0, 8);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pt-6 sm:px-6">
        <header className="space-y-2 rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] p-6 backdrop-blur-xl">
          <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Hashtag</p>
          <h1 className="break-all text-2xl font-black tracking-tight text-[#ff4d00]">#{tag}</h1>
          <div className="pt-1">
            <ShareButton
              resourceType="hashtag"
              resourceId={tag}
              url={typeof window !== 'undefined' ? window.location.href : `https://burnboard.app/hashtag/${tag}`}
              title={`#${tag} on BurnBoard`}
              text={`Explore #${tag} on BurnBoard`}
              variant="ghost"
              label="Share hashtag"
            />
          </div>
        </header>

        {related.length > 0 && (
          <section className="space-y-2" aria-label="Related hashtags">
            <h2 className="px-0.5 text-[15px] font-extrabold tracking-tight text-white">Related</h2>
            <div className="flex flex-wrap gap-2">
              {related.map((t) => (
                <Link
                  key={t}
                  href={`/hashtag/${encodeURIComponent(t)}`}
                  className="inline-flex min-h-[40px] items-center rounded-full border border-white/10 bg-white/[0.04] px-3 font-mono text-xs text-[#ff4d00] transition-all hover:border-[#ff4d00]/50"
                >
                  #{t}
                </Link>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-2" aria-live="polite" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-white/5 bg-[#111] p-4">
                <div className="h-3.5 w-3/4 rounded bg-[#1e1e1e]" />
                <div className="mt-2 h-3 w-1/3 rounded bg-[#1a1a1a]" />
              </div>
            ))}
          </div>
        ) : posts.length > 0 ? (
          <section className="space-y-2" aria-label="Recent posts">
            <h2 className="px-0.5 text-[15px] font-extrabold tracking-tight text-white">Recent posts</h2>
            {posts.slice(0, 10).map((p) => (
              <Link
                key={`${p.kind}-${p.id}`}
                href={p.kind === 'roast' ? `/r/${p.id}` : `/post/${p.id}`}
                className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-[#ff4d00]/40"
              >
                <p className="line-clamp-3 text-sm leading-relaxed text-zinc-100">{p.text}</p>
                <p className="mt-2 font-mono text-[11px] text-zinc-500">
                  {p.author?.username ? `@${p.author.username} · ` : ''}{timeAgo(p.createdAt)}
                </p>
              </Link>
            ))}
          </section>
        ) : (
          <div className="space-y-3 rounded-3xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm font-bold text-zinc-200">No public posts yet.</p>
            <p className="mx-auto max-w-xs text-xs text-zinc-500">
              Be the first to use #{tag} in a public post.
            </p>
            <Link
              href="/create"
              className="inline-flex min-h-[44px] items-center rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622]"
            >
              Create a post
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
