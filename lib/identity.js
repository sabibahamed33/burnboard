'use client';

/**
 * BURNBOARD — Client identity resolver.
 *
 * The app has two identity systems:
 *   1. Authenticated users  → Supabase auth user id (UUID, matches
 *      user_profiles.id and follows.follower_id/following_id).
 *   2. Anonymous visitors   → `burnboard_participant_id` in localStorage
 *      (`anon_<ts>_<rand>`, only valid for participant_id-based tables
 *      like reactions/polls — NEVER for follows/notifications).
 *
 * Follow/notification/profile-ownership checks MUST use the auth id when
 * signed in. Previously FollowButton sent the anon id unconditionally, so
 * every follow insert failed its UUID/FK constraint and rolled back, and
 * isFollowing/isOwnProfile were always false for logged-in users.
 */

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const STORAGE_KEY = 'burnboard_participant_id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for real auth user ids (UUID). Anon `anon_*` ids return false. */
export function isUserId(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Get or create the persistent anonymous participant id. */
export function getParticipantId() {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'server';
  }
}

/**
 * Resolve the effective viewer id: auth user id when signed in,
 * otherwise the anonymous participant id.
 *
 * @returns {Promise<{ viewerId: string, signedIn: boolean, userId: string|null }>}
 */
export async function getViewerId() {
  try {
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id || null;
      if (userId) {
        return { viewerId: userId, signedIn: true, userId };
      }
    }
  } catch {
    // Auth lookup failed — fall through to anonymous identity.
  }
  return { viewerId: getParticipantId(), signedIn: false, userId: null };
}

/**
 * React hook version of getViewerId. Resolves once on mount and tracks
 * auth changes so follow buttons / profile ownership stay correct across
 * sign-in and account switching.
 */
export function useViewerId() {
  const [state, setState] = useState({ viewerId: null, signedIn: false, userId: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      const result = await getViewerId();
      if (!cancelled) setState({ ...result, loading: false });
    };

    resolve();

    if (!isSupabaseConfigured || !supabase) return () => { cancelled = true; };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const userId = session?.user?.id || null;
      if (userId) {
        setState({ viewerId: userId, signedIn: true, userId, loading: false });
      } else {
        setState({ viewerId: getParticipantId(), signedIn: false, userId: null, loading: false });
      }
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  return state;
}
