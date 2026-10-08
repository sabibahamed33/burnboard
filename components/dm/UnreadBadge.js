'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * UnreadBadge — DM unread count for navigation.
 *
 * Self-contained: resolves the session, polls /api/dm/unread every 30s
 * and on navigation. Never throws, never blocks nav rendering.
 */
export default function UnreadBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCount(0);
        return;
      }
      const res = await fetch('/api/dm/unread');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCount(data.totalUnread || 0);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
    return () => clearInterval(poll);
  }, [refresh, pathname]);

  if (count <= 0) return null;

  return (
    <span
      className="ml-auto shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-[#ff4d00] text-black text-[10px] font-black font-mono flex items-center justify-center"
      aria-label={`${count} unread messages`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
