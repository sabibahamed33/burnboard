'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, UserMinus, Loader2, UserCheck, Clock } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { track } from '@/lib/analytics';

/**
 * JoinButton — Join / Request / Leave a community with optimistic UI.
 *
 * Membership is auth-based and server-validated; this button only submits
 * the action, it never grants anything itself.
 *
 * Props:
 *   - communityId: string
 *   - visibility: 'public' | 'private' | 'hidden' (private shows Request)
 *   - initialIsMember: boolean
 *   - initialPending: boolean (outgoing join request awaiting approval)
 *   - initialMemberCount: number
 *   - isOwner: boolean (owners cannot leave — owner safety)
 *   - size: 'sm' | 'md' | 'lg'
 *   - onStateChange: (isMember, memberCount, pending) => void
 */
export default function JoinButton({
  communityId,
  visibility = 'public',
  initialIsMember = false,
  initialPending = false,
  initialMemberCount = 0,
  isOwner = false,
  size = 'md',
  onStateChange,
  className = '',
}) {
  const router = useRouter();
  const [isMember, setIsMember] = useState(initialIsMember);
  const [pending, setPending] = useState(initialPending);
  const [memberCount, setMemberCount] = useState(initialMemberCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsMember(initialIsMember);
  }, [initialIsMember]);

  useEffect(() => {
    setPending(initialPending);
  }, [initialPending]);

  useEffect(() => {
    setMemberCount(initialMemberCount);
  }, [initialMemberCount]);

  const handleToggle = useCallback(async () => {
    if (loading) return;

    // Membership requires a real account
    if (!isSupabaseConfigured || !supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Remember the destination: after login the visitor returns here.
      const here =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`.slice(0, 500)
          : '';
      router.push(here && here.startsWith('/') ? `/auth?next=${encodeURIComponent(here)}` : '/auth');
      return;
    }

    // Next action depends on current state:
    // member → leave · pending → cancel · outsider → join (or request)
    const action = isMember ? 'leave' : pending ? 'cancel' : 'join';
    const previousMember = isMember;
    const previousPending = pending;
    const previousCount = memberCount;

    // Optimistic update
    if (action === 'leave') {
      setIsMember(false);
      setMemberCount(prev => Math.max(0, prev - 1));
    } else if (action === 'cancel') {
      setPending(false);
    } else if (visibility === 'private') {
      setPending(true);
    } else {
      setIsMember(true);
      setMemberCount(prev => prev + 1);
    }
    setLoading(true);

    try {
      const res = await fetch(`/api/communities/${communityId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const finalMember = data.action === 'joined' ? true
          : data.action === 'left' ? false
          : !!data.isMember;
        const finalPending = data.action === 'requested' || data.action === 'already_requested'
          ? true
          : data.pending === true;
        setIsMember(finalMember);
        setPending(finalPending);
        if (typeof data.memberCount === 'number') {
          setMemberCount(data.memberCount);
        }
        onStateChange?.(
          finalMember,
          typeof data.memberCount === 'number' ? data.memberCount : memberCount,
          finalPending
        );
        track(
          finalMember ? 'community_joined' : finalPending ? 'community_requested' : 'community_left',
          { communityId }
        );
      } else {
        // Rollback
        setIsMember(previousMember);
        setPending(previousPending);
        setMemberCount(previousCount);
      }
    } catch {
      setIsMember(previousMember);
      setPending(previousPending);
      setMemberCount(previousCount);
    } finally {
      setLoading(false);
    }
  }, [communityId, visibility, isMember, pending, memberCount, loading, onStateChange, router]);

  // Owners cannot leave (owner safety) — show a locked owner state instead
  if (isOwner) {
    return (
      <span
        className={`inline-flex items-center justify-center gap-1.5 font-bold rounded-xl font-mono bg-[#1a1a1a] border border-[#333] text-zinc-400 ${className}`}
        title="As the owner you manage this community"
      >
        <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
        Owner
      </span>
    );
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-[10px]',
    md: 'px-4 py-2 text-xs',
    lg: 'px-5 py-2.5 text-sm',
  };

  const label = isMember ? 'Joined'
    : pending ? 'Requested'
    : visibility === 'private' ? 'Request to Join'
    : 'Join';

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-1.5 font-bold rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-50 ${
        sizes[size]
      } ${
        isMember
          ? 'bg-[#1a1a1a] border border-[#333] text-zinc-300 hover:border-red-500/50 hover:text-red-400'
          : pending
            ? 'bg-[#1a1a1a] border border-amber-500/40 text-amber-400 hover:border-red-500/50 hover:text-red-400'
            : 'bg-[#ff4d00] hover:bg-[#ff6622] text-black shadow-[0_0_12px_rgba(255,77,0,0.3)]'
      } font-mono ${className}`}
      aria-label={isMember ? 'Leave community' : pending ? 'Withdraw join request' : visibility === 'private' ? 'Request to join community' : 'Join community'}
      aria-pressed={isMember}
      title={pending ? 'Tap to withdraw your request' : undefined}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : isMember ? (
        <>
          <UserMinus className="w-3.5 h-3.5" aria-hidden="true" />
          {label}
        </>
      ) : pending ? (
        <>
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          {label}
        </>
      ) : (
        <>
          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
          {label}
        </>
      )}
    </button>
  );
}
