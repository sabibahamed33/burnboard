import { createClient } from '@/lib/supabase/server';
import { evaluateStreak } from '@/lib/growth/retention';

const STREAK_QUALIFYING_EVENTS = [
  'content_created',
  'comment_created',
  'daily_activity_participated',
];

/**
 * Record daily activity and update streak
 *
 * Ethical design: 1-day grace — a single missed day does NOT reset the
 * streak. Copy never shames. See lib/growth/retention.js.
 */
export async function recordDailyActivity(userId) {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];

  // Check if already active today
  const { data: existing } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing?.last_active_date === today) {
    return existing;
  }

  // Forgiving evaluation: 1 missed day keeps the streak (no dark pattern reset).
  const verdict = evaluateStreak({
    lastActiveDate: existing?.last_active_date || null,
    currentStreak: existing?.current_streak || 0,
    longestStreak: existing?.longest_streak || 0,
    today,
  });
  // Already active today — idempotent, no double count.
  if (verdict.alreadyActive) return existing;
  let newStreak = verdict.nextStreak;
  let longestStreak = Math.max(existing?.longest_streak || 0, newStreak);
  const usedGrace = !!verdict.usedGrace;

  const streakData = {
    user_id: userId,
    current_streak: newStreak,
    longest_streak: longestStreak,
    last_active_date: today,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data } = await supabase
      .from('user_streaks')
      .update(streakData)
      .eq('user_id', userId)
      .select()
      .single();
    return data;
  } else {
    const { data } = await supabase
      .from('user_streaks')
      .insert(streakData)
      .select()
      .single();
    return data;
  }
}

/**
 * Get user's current streak info
 */
export async function getUserStreak(userId) {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) {
    return {
      current_streak: 0,
      longest_streak: 0,
      is_active_today: false,
      last_active_date: null,
    };
  }

  return {
    ...data,
    is_active_today: data.last_active_date === today,
  };
}

/**
 * Check if a user qualifies for streak based on an event
 */
export function isStreakQualifyingEvent(eventType) {
  return STREAK_QUALIFYING_EVENTS.includes(eventType);
}
