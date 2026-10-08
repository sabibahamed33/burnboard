import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAndAwardBadges, checkAndUnlockAchievements } from '@/lib/reputation/badges';
import { recordDailyActivity, isStreakQualifyingEvent } from '@/lib/reputation/streaks';
import { getLevelInfo } from '@/lib/reputation/config';
import { notifyLevelUp, notifyAchievementUnlocked } from '@/lib/notifications';

/**
 * POST /api/reputation/award
 *
 * Award Burn Rep for an action. Central enforcement point for the
 * universal XP economy (every USER earns through this route):
 *
 * Body:
 *   - event_type: string (required)
 *   - user_id: string (optional if participant_id provided)
 *   - participant_id: string (optional if user_id provided)
 *   - source_type: string (optional)
 *   - source_id: string (optional, dedupes repeat awards for one source)
 *   - metadata: object (optional)
 *
 * Anti-abuse (server-side, never trusted from clients):
 *   - allowlisted event types with fixed point values
 *   - per-user daily caps per event type (farming-resistant)
 *   - source_id idempotency (same source never pays twice)
 *
 * Side effects (best-effort, non-blocking):
 *   - level-up detection → LEVEL_UP notification + leveledUp in response
 *   - badge + achievement checks → unlock notifications for achievements
 *   - streak accrual for qualifying events
 *
 * Event types:
 *   - content_created: +10 rep (cap 10/day)
 *   - content_received_engagement: +2 rep (cap 100/day)
 *   - comment_created: +5 rep (cap 30/day)
 *   - comment_received_engagement: +1 rep (cap 100/day)
 *   - reaction: +1 rep (cap 50/day)
 *   - follow: +2 rep (cap 20/day)
 *   - follow_received: +5 rep (cap 50/day)
 *   - poll_voted: +2 rep (cap 20/day)
 *   - daily_participation: +5 rep (cap 1/day)
 *   - community_created: +5 rep (cap 3/day)
 *   - community_joined: +2 rep (cap 10/day)
 *   - challenge_participated: +3 rep (cap 10/day)
 *   - challenge_won: +25 rep (competitive win, uncapped)
 *   - check_badges: Check and award badges
 */

const REP_VALUES = {
  content_created: 10,
  content_received_engagement: 2,
  comment_created: 5,
  comment_received_engagement: 1,
  reaction: 1,
  follow: 2,
  follow_received: 5,
  poll_voted: 2,
  daily_participation: 5,
  // Communities (Master Prompt 8)
  community_created: 5,
  community_joined: 2,
  // Challenges (Master Prompt 9) — modest participation reward only,
  // except competitively earned wins
  challenge_participated: 3,
  challenge_won: 25,
};

// Daily per-user caps per event type (null = uncapped: rare by construction).
// Generous for legitimate activity; farming hits the ceiling fast.
const DAILY_CAPS = {
  content_created: 10,
  content_received_engagement: 100,
  comment_created: 30,
  comment_received_engagement: 100,
  reaction: 50,
  follow: 20,
  follow_received: 50,
  poll_voted: 20,
  daily_participation: 1,
  community_created: 3,
  community_joined: 10,
  challenge_participated: 10,
  challenge_won: null,
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl) return null;
  const key = serviceRoleKey || supabaseKey;
  if (!key) return null;
  return createClient(supabaseUrl, key);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { event_type, user_id, participant_id, source_type, source_id, metadata } = body;

    // Handle badge check requests
    if (event_type === 'check_badges') {
      const uid = user_id || participant_id;
      if (!uid) {
        return NextResponse.json({ error: 'Missing user identifier' }, { status: 400 });
      }
      const newBadges = await checkAndAwardBadges(uid);
      const newAchievements = await checkAndUnlockAchievements(uid);
      return NextResponse.json({ new_badges: newBadges, new_achievements: newAchievements });
    }

    const resolvedUserId = user_id || participant_id;
    if (!resolvedUserId) {
      return NextResponse.json({ error: 'Missing user_id or participant_id' }, { status: 400 });
    }

    if (!event_type) {
      return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
    }

    const repValue = REP_VALUES[event_type];
    if (repValue === undefined) {
      return NextResponse.json({ error: `Unknown event_type: ${event_type}` }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Check for duplicate event (idempotency) using the unique constraint
    if (source_id) {
      const { data: existing } = await supabase
        .from('reputation_events')
        .select('id')
        .eq('user_id', resolvedUserId)
        .eq('event_type', event_type)
        .eq('reference_id', source_id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ already_awarded: true });
      }
    }

    // Daily cap: same user + event type may only earn N times per UTC day.
    // Farming the same action beyond the cap earns nothing (no error —
    // legitimate bursts just stop paying).
    const cap = DAILY_CAPS[event_type];
    if (cap != null) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('reputation_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', resolvedUserId)
        .eq('event_type', event_type)
        .gte('created_at', dayStart.toISOString());
      if ((count || 0) >= cap) {
        return NextResponse.json({ success: true, capped: true, rep_awarded: 0, event_type });
      }
    }

    // Record reputation event (using the reputation_events table schema)
    const { error: eventError } = await supabase
      .from('reputation_events')
      .insert({
        user_id: resolvedUserId,
        event_type,
        points: repValue,
        reference_id: source_id || null,
        metadata: {
          source_type: source_type || null,
          ...metadata,
        },
      });

    if (eventError) {
      console.error('[Rep Award] Event insert error:', eventError);
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
    }

    // Update user's total reputation
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('reputation')
      .eq('user_id', resolvedUserId)
      .single();

    if (profile) {
      const oldRep = profile.reputation || 0;
      const newRep = oldRep + repValue;
      const oldLevel = getLevelInfo(oldRep).name;
      const newLevel = getLevelInfo(newRep).name;

      await supabase
        .from('user_profiles')
        .update({ reputation: newRep, level: newLevel })
        .eq('user_id', resolvedUserId);

      // Update streak if qualifying event
      if (isStreakQualifyingEvent(event_type)) {
        await recordDailyActivity(resolvedUserId);
      }

      // Level-up: notify once (deduped by the level change itself) and
      // report it so clients can celebrate without blocking anything.
      let leveledUp = false;
      if (newLevel !== oldLevel) {
        leveledUp = true;
        notifyLevelUp({ userId: resolvedUserId, oldLevel, newLevel }).catch(() => {});
      }

      // Badge + achievement checks run on every award (centralized — callers
      // no longer need separate check_badges calls). Achievement unlocks
      // notify; badges are collected silently for the profile shelf.
      let newBadges = [];
      let newAchievements = [];
      try {
        newBadges = await checkAndAwardBadges(resolvedUserId);
        newAchievements = await checkAndUnlockAchievements(resolvedUserId);
        for (const a of newAchievements) {
          notifyAchievementUnlocked({ userId: resolvedUserId, achievement: a }).catch(() => {});
        }
      } catch {}

      return NextResponse.json({
        success: true,
        rep_awarded: repValue,
        event_type,
        new_total: newRep,
        leveledUp,
        oldLevel,
        newLevel,
        new_badges: newBadges,
        new_achievements: newAchievements,
      });
    }

    return NextResponse.json({ success: true, rep_awarded: repValue });
  } catch (err) {
    console.error('[Rep Award] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
