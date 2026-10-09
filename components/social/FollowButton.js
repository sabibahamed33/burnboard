'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { useViewerId } from '@/lib/identity';
import { track } from '@/lib/analytics';

/**
 * FollowButton — Follow/Unfollow button with optimistic UI.
 *
 * Identity: uses the authenticated user id when signed in (the only id
 * valid for follows.*). Anonymous visitors get a sign-in affordance —
 * firing a follow with an `anon_*` participant id can never succeed
 * (UUID/FK constraint) so we never attempt it.
 *
 * Props:
 *   - targetUserId: string (required)
 *   - initialIsFollowing: boolean
 *   - initialFollowerCount: number
 *   - size: 'sm' | 'md' | 'lg'
 *   - variant: 'primary' | 'secondary'
 *   - onFollowChange: callback when follow state changes
 *   - label: optional custom text for the follow action (e.g. "Follow back").
 */
export default function FollowButton({
  targetUserId,
  initialIsFollowing = false,
  initialFollowerCount = 0,
  size = 'md',
  variant = 'primary',
  onFollowChange,
  className = '',
  label = 'Follow',
}) {
  const { viewerId, signedIn, loading: identityLoading } = useViewerId();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // In-flight guard: rapid double-taps must not fire duplicate requests.
  // (State-based `loading` is stale inside the same tick.)
  const inFlightRef = useRef(false);

  // Sync with prop changes (server state is authoritative on refresh).
  useEffect(() => {
    setIsFollowing(initialIsFollowing);
  }, [initialIsFollowing]);

  useEffect(() => {
    setFollowerCount(initialFollowerCount);
  }, [initialFollowerCount]);

  const handleToggle = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!viewerId || viewerId === targetUserId) return;

    const action = isFollowing ? 'unfollow' : 'follow';
    const previousState = isFollowing;
    const previousCount = followerCount;

    // Optimistic update — feels instant.
    inFlightRef.current = true;
    setIsFollowing(!isFollowing);
    setFollowerCount((prev) => (isFollowing ? Math.max(0, prev - 1) : prev + 1));
    setLoading(true);
    setFailed(false);

    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: targetUserId,
          action,
          viewer_id: viewerId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        // Server is authoritative: adopt its state (handles already_following).
        setIsFollowing(!!data.isFollowing);
        if (typeof data.followerCount === 'number') {
          setFollowerCount(data.followerCount);
        }
        onFollowChange?.(!!data.isFollowing, data.followerCount);

        track(data.isFollowing ? 'follow_succeeded' : 'unfollow_succeeded', {
          targetUserId,
          followerCount: data.followerCount,
        });
      } else {
        // Roll back — never leave UI stuck on "Following" after rejection.
        setIsFollowing(previousState);
        setFollowerCount(previousCount);
        setFailed(true);
      }
    } catch {
      // Network failure — roll back, next tap retries.
      setIsFollowing(previousState);
      setFollowerCount(previousCount);
      setFailed(true);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [targetUserId, isFollowing, followerCount, viewerId, onFollowChange]);

  // Don't show button for own profile (once identity resolves).
  if (!identityLoading && viewerId && viewerId === targetUserId) return null;

  const sizes = {
    sm: 'px-3 py-1.5 text-[10px] min-h-[36px]',
    md: 'px-4 py-2 text-xs min-h-[40px]',
    lg: 'px-5 py-2.5 text-sm min-h-[44px]',
  };

  // Anonymous visitors cannot follow (no valid user id) — send them to auth
  // instead of firing a request that is guaranteed to fail. The current
  // public page is remembered so login returns them to this content.
  const signInHref =
    typeof window !== 'undefined' &&
    window.location?.pathname?.startsWith('/') &&
    `${window.location.pathname}${window.location.search || ''}`.length <= 500
      ? `/auth?next=${encodeURIComponent(`${window.location.pathname}${window.location.search || ''}`)}`
      : '/auth';
  if (!identityLoading && !signedIn) {
    return (
      <Link
        href={signInHref}
        className={`inline-flex items-center justify-center gap-1.5 font-bold rounded-xl transition-all duration-150 active:scale-95 ${
          sizes[size]
        } ${
          variant === 'primary'
            ? 'bg-[#ff4d00] hover:bg-[#ff6622] text-black shadow-[0_0_12px_rgba(255,77,0,0.3)]'
            : 'bg-[#1a1a1a] border border-[#333] text-white hover:border-[#ff4d00]/50'
        } font-mono ${className}`}
        aria-label="Sign in to follow users"
        title="Sign in to follow users"
      >
        <UserPlus className="w-3.5 h-3.5" />
        {label}
      </Link>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading || identityLoading}
      title={failed ? 'Request failed — tap to retry' : undefined}
      className={`inline-flex items-center justify-center gap-1.5 font-bold rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-50 ${
        sizes[size]
      } ${
        isFollowing
          ? 'bg-[#1a1a1a] border border-[#333] text-zinc-300 hover:border-red-500/50 hover:text-red-400'
          : variant === 'primary'
            ? 'bg-[#ff4d00] hover:bg-[#ff6622] text-black shadow-[0_0_12px_rgba(255,77,0,0.3)]'
            : 'bg-[#1a1a1a] border border-[#333] text-white hover:border-[#ff4d00]/50'
      } font-mono ${className}`}
      aria-label={isFollowing ? 'Unfollow' : label}
      aria-pressed={isFollowing}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isFollowing ? (
        <>
          <UserMinus className="w-3.5 h-3.5" />
          Following
        </>
      ) : (
        <>
          <UserPlus className="w-3.5 h-3.5" />
          {failed ? 'Retry' : label}
        </>
      )}
    </button>
  );
}
