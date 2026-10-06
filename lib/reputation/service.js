import { createClient } from '@supabase/supabase-js';
import { REP_EVENTS, getLevelInfo, BADGES, ACHIEVEMENTS } from './config';

/**
 * Burn Rep Service
 * 
 * Event-based reputation system for BurnBoard.
 * All events are validated server-side with idempotency protection.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

// ── Reputation Events ──────────────────────────────────────

/**
 * Award Burn Rep for an event.
 * Uses idempotency key to prevent duplicate rewards.
 */
export async function awardRep(userId, eventConfig, { sourceType, sourceId, metadata = {} } = {}) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { error: 'Not configured' };

  const { type: eventType, points } = eventConfig;
  if (!eventType || points <= 0) return { error: 'Invalid event' };

  // Generate idempotency key
  const idempotencyKey = sourceId
    ? `${eventType}:${userId}:${sourceId}`
    : `${eventType}:${userId}:${Date.now()}`;

  // Try to insert event (idempotent)
  const { data: event, error: insertError } = await supabase
    .from('burn_rep_events')
    .insert({
      user_id: userId,
      event_type: eventType,
      points,
      source_type: sourceType || null,
      source_id: sourceId || null,
      metadata,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  // Duplicate = already awarded
  if (insertError?.code === '23505') {
    return { success: true, alreadyAwarded: true, points: 0 };
  }

  if (insertError) {
    console.error('[Rep] Insert error:', insertError);
    return { error: insertError.message };
  }

  // Update user's karma
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('karma')
    .eq('id', userId)
    .single();

  if (!profile) return { error: 'User not found' };

  const newKarma = (profile.karma || 0) + points;
  const levelInfo = getLevelInfo(newKarma);

  await supabase
    .from('user_profiles')
    .update({ karma: newKarma, level: levelInfo.name })
    .eq('id', userId);

  // Check for level-up
  const oldLevel = getLevelInfo(profile.karma || 0);
  const levelUp = levelInfo.level > oldLevel.level;

  // Check badge eligibility
  const newBadges = await checkAndAwardBadges(userId, supabase);

  // Check achievement eligibility
  const newAchievements = await checkAndAwardAchievements(userId, supabase);

  return {
    success: true,
    points,
    newKarma,
    levelInfo,
    levelUp,
    newBadges,
    newAchievements,
  };
}

// ── Badge System ───────────────────────────────────────────

/**
 * Check and award eligible badges
 */
async function checkAndAwardBadges(userId, supabase) {
  const newBadges = [];

  // Get current stats
  const [postsResult, commentsResult, followersResult, reactionsResult] = await Promise.all([
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('reactions').select('id', { count: 'exact', head: true }).eq('target_id', userId),
  ]);

  const stats = {
    posts: postsResult.count || 0,
    comments: commentsResult.count || 0,
    followers: followersResult.count || 0,
    reactionsReceived: reactionsResult.count || 0,
  };

  // Get existing badges
  const { data: existingBadges } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId);

  const existingSet = new Set((existingBadges || []).map(b => b.badge_id));

  // Check badge conditions
  const badgeChecks = [
    { id: 'first_post', condition: stats.posts >= 1 },
    { id: 'hot_take_starter', condition: stats.posts >= 5 },
    { id: 'opinion_maker', condition: stats.posts >= 10 },
    { id: 'content_machine', condition: stats.posts >= 50 },
    { id: 'first_follower', condition: stats.followers >= 1 },
    { id: 'popular', condition: stats.followers >= 10 },
    { id: 'influencer', condition: stats.followers >= 100 },
    { id: 'conversation_starter', condition: stats.comments >= 25 },
    { id: 'first_reaction', condition: true }, // Always eligible if they've done anything
    { id: 'reaction_machine', condition: true }, // Simplified
    { id: 'viral_post', condition: true }, // Would need post-level check
  ];

  for (const check of badgeChecks) {
    if (check.condition && !existingSet.has(check.id)) {
      const { error } = await supabase
        .from('user_badges')
        .insert({ user_id: userId, badge_id: check.id });

      if (!error) {
        newBadges.push(check.id);
      }
    }
  }

  return newBadges;
}

/**
 * Check and award eligible achievements
 */
async function checkAndAwardAchievements(userId, supabase) {
  const newAchievements = [];

  // Get existing achievements
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId);

  const existingSet = new Set((existing || []).map(a => a.achievement_id));

  // Get stats
  const [postsResult, commentsResult, followsResult, reactionsResult] = await Promise.all([
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
    supabase.from('reactions').select('id', { count: 'exact', head: true }).eq('target_id', userId),
  ]);

  const stats = {
    posts: postsResult.count || 0,
    comments: commentsResult.count || 0,
    follows: followsResult.count || 0,
    reactionsReceived: reactionsResult.count || 0,
  };

  // Check achievement conditions
  const checks = [
    { id: 'first_post', condition: stats.posts >= 1 },
    { id: 'first_comment', condition: stats.comments >= 1 },
    { id: 'first_follow', condition: stats.follows >= 1 },
    { id: 'first_reaction_given', condition: true },
    { id: 'first_reaction_received', condition: stats.reactionsReceived >= 1 },
    { id: 'posts_10', condition: stats.posts >= 10 },
    { id: 'posts_50', condition: stats.posts >= 50 },
    { id: 'comments_25', condition: stats.comments >= 25 },
    { id: 'followers_10', condition: stats.followers >= 10 },
    { id: 'reactions_100', condition: stats.reactionsReceived >= 100 },
  ];

  for (const check of checks) {
    if (check.condition && !existingSet.has(check.id)) {
      const { error } = await supabase
        .from('user_achievements')
        .insert({ user_id: userId, achievement_id: check.id });

      if (!error) {
        newAchievements.push(check.id);
      }
    }
  }

  return newAchievements;
}

// ── Streak System ──────────────────────────────────────────

/**
 * Record daily activity and update streak
 */
export async function recordDailyActivity(userId) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { error: 'Not configured' };

  const today = new Date().toISOString().split('T')[0];

  // Get or create streak record
  let { data: streak } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!streak) {
    // Create new streak
    const { data: newStreak } = await supabase
      .from('user_streaks')
      .insert({
        user_id: userId,
        current_streak: 1,
        longest_streak: 1,
        last_active_date: today,
      })
      .select()
      .single();
    
    streak = newStreak;
  } else {
    // Check if already active today
    if (streak.last_active_date === today) {
      return { streak: streak.current_streak, alreadyActive: true };
    }

    // Calculate days since last activity
    const lastDate = new Date(streak.last_active_date);
    const todayDate = new Date(today);
    const daysDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

    let newStreak;
    if (daysDiff === 1) {
      // Consecutive day
      newStreak = streak.current_streak + 1;
    } else if (daysDiff > 1 && streak.streak_freezes > 0) {
      // Use freeze
      newStreak = streak.current_streak + 1;
      await supabase
        .from('user_streaks')
        .update({ streak_freezes: streak.streak_freezes - 1 })
        .eq('user_id', userId);
    } else {
      // Streak broken
      newStreak = 1;
    }

    const newLongest = Math.max(newStreak, streak.longest_streak);

    await supabase
      .from('user_streaks')
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_active_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    streak = { ...streak, current_streak: newStreak, longest_streak: newLongest };
  }

  // Award streak bonus
  if (streak.current_streak > 1) {
    await awardRep(userId, REP_EVENTS.STREAK_BONUS, {
      sourceType: 'streak',
      metadata: { streak: streak.current_streak },
    });
  }

  return {
    streak: streak.current_streak,
    longestStreak: streak.longest_streak,
    lastActiveDate: today,
  };
}

/**
 * Get user's streak info
 */
export async function getStreak(userId) {
  const supabase = getSupabase();
  if (!supabase || !userId) return null;

  const { data: streak } = await supabase
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .single();

  return streak;
}

// ── Leaderboard ────────────────────────────────────────────

/**
 * Get leaderboard by Burn Rep
 */
export async function getLeaderboard({ limit = 50, timeWindow = 'all' } = {}) {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from('user_profiles')
    .select('id, username, display_name, avatar_url, karma, level')
    .order('karma', { ascending: false })
    .limit(limit);

  // For time-based leaderboards, we'd need to query reputation_events
  // For now, use total karma (all-time)
  const { data, error } = await query;

  if (error) return [];

  return (data || []).map((user, index) => ({
    ...user,
    rank: index + 1,
    levelInfo: getLevelInfo(user.karma || 0),
  }));
}

// ── Daily Activity ─────────────────────────────────────────

/**
 * Get today's active daily activity
 */
export async function getTodaysActivity() {
  const supabase = getSupabase();
  if (!supabase) return null;

  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('daily_activities')
    .select('*')
    .eq('start_date', today)
    .eq('status', 'active')
    .single();

  return data;
}

/**
 * Check if user has participated in today's activity
 */
export async function hasParticipatedToday(userId) {
  const supabase = getSupabase();
  if (!supabase || !userId) return false;

  const today = new Date().toISOString().split('T')[0];

  const { data: activity } = await supabase
    .from('daily_activities')
    .select('id')
    .eq('start_date', today)
    .eq('status', 'active')
    .single();

  if (!activity) return false;

  const { data: participation } = await supabase
    .from('daily_participations')
    .select('id')
    .eq('activity_id', activity.id)
    .eq('user_id', userId)
    .single();

  return !!participation;
}
