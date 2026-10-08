'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * TopicsStrip — horizontally scrollable topic chips backed by the real
 * topics taxonomy (GET /api/search?scope=topics). Hidden when empty —
 * sections without real data never render.
 */
export default function TopicsStrip({ limit = 12 }) {
  const [topics, setTopics] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/search?scope=topics&limit=${limit}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.topics)) {
          setTopics(data.topics);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (!loaded || topics.length === 0) return null;

  return (
    <section aria-label="Browse topics" className="space-y-2">
      <p className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider px-1">
        Browse topics
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
        {topics.map((topic) => (
          <Link
            key={topic.id}
            href={`/search?q=${encodeURIComponent(topic.name)}`}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#111] border border-[#222] text-xs font-mono text-zinc-200 hover:border-[#ff4d00]/50 hover:text-white transition-all min-h-[40px]"
          >
            🌎 {topic.name}
            {topic.communityCount > 0 && (
              <span className="text-zinc-500">{topic.communityCount}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
