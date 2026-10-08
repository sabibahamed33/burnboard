'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ShareButton from '@/components/growth/ShareButton';

/**
 * Topic content (client): privacy-filtered search backend, same as Explore.
 * Posts link to canonical /post URLs; communities to /c/[slug].
 */
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

export default function TopicClient({ topic }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(topic.name)}&scope=all&limit=12`);
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body.success) setData(body);
      } catch {} finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [topic.name]);

  const posts = data?.roasts || [];
  const communities = data?.communities || [];

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28 font-sans text-white sm:pb-16">
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pt-6 sm:px-6">
        <header className="space-y-2 rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.02] p-6 backdrop-blur-xl">
          <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Topic</p>
          <h1 className="text-2xl font-black tracking-tight text-white">{topic.name}</h1>
          <div className="pt-1">
            <ShareButton
              resourceType="topic"
              resourceId={topic.id}
              url={typeof window !== 'undefined' ? window.location.href : `https://burnboard.app/topic/${topic.slug}`}
              title={`${topic.name} on BurnBoard`}
              text={`Explore ${topic.name} on BurnBoard`}
              variant="ghost"
              label="Share topic"
            />
          </div>
        </header>

        {loading ? (
          <div className="space-y-2" aria-live="polite" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-white/5 bg-[#111] p-4">
                <div className="h-3.5 w-3/4 rounded bg-[#1e1e1e]" />
                <div className="mt-2 h-3 w-1/3 rounded bg-[#1a1a1a]" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {communities.length > 0 && (
              <section className="space-y-2" aria-label="Communities">
                <h2 className="px-0.5 text-[15px] font-extrabold tracking-tight text-white">Communities</h2>
                {communities.slice(0, 3).map((c) => (
                  <Link
                    key={c.id}
                    href={`/c/${c.slug}`}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-[#ff4d00]/40"
                  >
                    <p className="text-sm font-bold text-white">{c.name}</p>
                    {c.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{c.description}</p>}
                  </Link>
                ))}
              </section>
            )}
            <section className="space-y-2" aria-label="Recent posts">
              <h2 className="px-0.5 text-[15px] font-extrabold tracking-tight text-white">Recent posts</h2>
              {posts.length > 0 ? (
                posts.slice(0, 8).map((p) => (
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
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                  <p className="text-sm font-bold text-zinc-300">No public posts yet.</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500">
                    Be the first to post about {topic.name}.
                  </p>
                  <Link
                    href="/create"
                    className="mt-3 inline-flex min-h-[44px] items-center rounded-2xl bg-[#ff4d00] px-5 text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622]"
                  >
                    Create a post
                  </Link>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
