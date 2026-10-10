/**
 * BURNBOARD — Reputation award service (server-only).
 *
 * Single implementation of XP awards. The HTTP route
 * (app/api/reputation/award) enforces session authorization and delegates
 * here; internal server callers (comments, content, follow, communities,
 * challenges, reactions) import this directly instead of unauthenticated
 * HTTP fetch — a client must never be able to mint XP for an arbitrary
 * user_id. NEVER import this module from client code (service-role key).
 */

import { createClient } from '@supabase/supabase-js';
import { checkAndAwardBadges, checkAndUnlockAchievements } from '@/lib/reputation/badges';
import { recordDailyActivity, isStreakQualifyingEvent } from '@/lib/reputation/streaks';
import { getLevelInfo } from '@/lib/reputation/config';
import { notifyLevelUp, notifyAchievementUnlocked } from '@/lib/notifications';

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
  community_created: 5,
  community_joined: 2,
  challenge_participated: 3,
  challenge_won: 25,
};

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

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(metadata).slice(0, 10)) {
    if (typeof v === 'string') out[String(k).slice(0, 40)] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean') out[String(k).slice(0, 40)] = v;
  }
  return out;
}

/**
 * Award XP. Caller MUST have authorized userId already (session match or
 * server-resolved action context). Returns { ok, rep_awarded, ... }.
 */
export async function awardRep({ userId, eventType, sourceType = null, sourceId = null, metadata = {} }) {
  if (!userId || !eventType) return { ok: false, error: 'Missing userId or eventType' };
  const repValue = REP_VALUES[eventType];
  if (repValue === undefined) return { ok: false, error: `Unknown event_type: ${eventType}` };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Service not configured' };

  if (sourceId) {
    const { data: existing } = await supabase
      .from('reputation_events')
      .select('id')
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .eq('reference_id', sourceId)
      .maybeSingle();
    if (existing) return { ok: true, already_awarded: true };
  }

  const cap = DAILY_CAPS[eventType];
  if (cap != null) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('reputation_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .gte('created_at', dayStart.toISOString());
    if ((count || 0) >= cap) {
      return { ok: true, capped: true, rep_awarded: 0, event_type: eventType };
    }
  }

  const { error: eventError } = await supabase.from('reputation_events').insert({
    user_id: userId,
    event_type: eventType,
    points: repValue,
    reference_id: sourceId || null,
    metadata: { source_type: sourceType || null, ...sanitizeMetadata(metadata) },
  });
  if (eventError) return { ok: false, error: 'Failed to record event' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('reputation')
    .eq('user_id', userId)
    .single();

  if (!profile) return { ok: true, rep_awarded: repValue };

  const oldRep = profile.reputation || 0;
  const newRep = oldRep + repValue;
  const oldLevel = getLevelInfo(oldRep).name;
  const newLevel = getLevelInfo(newRep).name;

  await supabase.from('user_profiles').update({ reputation: newRep, level: newLevel }).eq('user_id', userId);

  if (isStreakQualifyingEvent(eventType)) {
    await recordDailyActivity(userId);
  }

  let leveledUp = false;
  if (newLevel !== oldLevel) {
    leveledUp = true;
    notifyLevelUp({ userId, oldLevel, newLevel }).catch(() => {});
  }

  let newBadges = [];
  let newAchievements = [];
  try {
    newBadges = await checkAndAwardBadges(userId);
    newAchievements = await checkAndUnlockAchievements(userId);
    for (const a of newAchievements) {
      notifyAchievementUnlocked({ userId, achievement: a }).catch(() => {});
    }
  } catch {}

  return { ok: true, rep_awarded: repValue, event_type: eventType, new_total: newRep, leveledUp, oldLevel, newLevel, new_badges: newBadges, new_achievements: newAchievements };
}

export async function checkBadgesFor(userId) {
  const newBadges = await checkAndAwardBadges(userId);
  const newAchievements = await checkAndUnlockAchievements(userId);
  return { new_badges: newBadges, new_achievements: newAchievements };
}
