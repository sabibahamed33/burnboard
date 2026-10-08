import { createClient } from '@/lib/supabase/server';

// Badge definitions
export const BADGES = {
  early_adopter: {
    id: 'early_adopter',
    name: 'Early Adopter',
    description: 'Joined BurnBoard during the early days',
    icon: '🌟',
    category: 'milestone',
    requirement: 'Joined before a certain date',
  },
  first_post: {
    id: 'first_post',
    name: 'First Spark',
    description: 'Created your first piece of content',
    icon: '✨',
    category: 'creator',
    requirement: 'content_created:1',
  },
  post_10: {
    id: 'post_10',
    name: 'Rising Flame',
    description: 'Created 10 pieces of content',
    icon: '🔥',
    category: 'creator',
    requirement: 'content_created:10',
  },
  post_50: {
    id: 'post_50',
    name: 'Content Machine',
    description: 'Created 50 pieces of content',
    icon: '⚡',
    category: 'creator',
    requirement: 'content_created:50',
  },
  first_comment: {
    id: 'first_comment',
    name: 'First Word',
    description: 'Left your first comment',
    icon: '💬',
    category: 'social',
    requirement: 'comment_created:1',
  },
  comment_50: {
    id: 'comment_50',
    name: 'Voice of the People',
    description: 'Left 50 comments',
    icon: '🗣️',
    category: 'social',
    requirement: 'comment_created:50',
  },
  first_follow: {
    id: 'first_follow',
    name: 'Connected',
    description: 'Followed your first person',
    icon: '🤝',
    category: 'social',
    requirement: 'follow:1',
  },
  follow_10: {
    id: 'follow_10',
    name: 'Networker',
    description: 'Followed 10 people',
    icon: '🌐',
    category: 'social',
    requirement: 'follow:10',
  },
  first_reaction: {
    id: 'first_reaction',
    name: 'First Reaction',
    description: 'Reacted to content for the first time',
    icon: '👆',
    category: 'social',
    requirement: 'reaction:1',
  },
  reaction_100: {
    id: 'reaction_100',
    name: 'Reactive',
    description: 'Reacted to 100 pieces of content',
    icon: '🎯',
    category: 'social',
    requirement: 'reaction:100',
  },
  viral_post: {
    id: 'viral_post',
    name: 'Gone Viral',
    description: 'A post received 50+ reactions',
    icon: '🚀',
    category: 'milestone',
    requirement: 'viral_post:50',
  },
  streak_7: {
    id: 'streak_7',
    name: 'On Fire',
    description: 'Maintained a 7-day activity streak',
    icon: '🔥',
    category: 'streak',
    requirement: 'streak:7',
  },
  streak_30: {
    id: 'streak_30',
    name: 'Unstoppable',
    description: 'Maintained a 30-day activity streak',
    icon: '💎',
    category: 'streak',
    requirement: 'streak:30',
  },
  hot_take_master: {
    id: 'hot_take_master',
    name: 'Hot Take Master',
    description: 'Created 10 hot takes',
    icon: '🌶️',
    category: 'creator',
    requirement: 'hot_take:10',
  },
  poll_master: {
    id: 'poll_master',
    name: 'Poll Master',
    description: 'Created 10 polls',
    icon: '🗳️',
    category: 'creator',
    requirement: 'poll:10',
  },
  burn_legend: {
    id: 'burn_legend',
    name: 'Burn Legend',
    description: 'Reached 1,000 Burn Rep',
    icon: '👑',
    category: 'milestone',
    requirement: 'reputation:1000',
  },
};

// Achievement definitions
export const ACHIEVEMENTS = {
  first_post: { id: 'first_post', name: 'First Post', description: 'Create your first post' },
  first_comment: { id: 'first_comment', name: 'First Comment', description: 'Leave your first comment' },
  first_follow: { id: 'first_follow', name: 'First Follow', description: 'Follow someone' },
  first_reaction: { id: 'first_reaction', name: 'First Reaction', description: 'React to content' },
  streak_7: { id: 'streak_7', name: 'Week Warrior', description: '7-day streak' },
  streak_30: { id: 'streak_30', name: 'Monthly Master', description: '30-day streak' },
  viral_post: { id: 'viral_post', name: 'Viral Content', description: 'Get 50+ reactions on a post' },
  rep_100: { id: 'rep_100', name: 'Rising Star', description: 'Reach 100 Burn Rep' },
  rep_500: { id: 'rep_500', name: 'Established', description: 'Reach 500 Burn Rep' },
  rep_1000: { id: 'rep_1000', name: 'Legend', description: 'Reach 1,000 Burn Rep' },
};

/**
 * Check and award badges for a user
 */
export async function checkAndAwardBadges(userId) {
  const supabase = await createClient();
  
  // Get user stats
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('reputation, follower_count, created_at')
    .eq('user_id', userId)
    .single();

  if (!profile) return [];

  // Get existing badges
  const { data: existingBadges } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId);

  const earnedBadgeIds = new Set((existingBadges || []).map(b => b.badge_id));
  const newBadges = [];

  // Get event counts
  const { data: events } = await supabase
    .from('reputation_events')
    .select('event_type')
    .eq('user_id', userId);

  const eventCounts = {};
  (events || []).forEach(e => {
    eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
  });

  // Check badge eligibility
  for (const [badgeId, badge] of Object.entries(BADGES)) {
    if (earnedBadgeIds.has(badgeId)) continue;

    let earned = false;

    if (badgeId === 'early_adopter') {
      earned = new Date(profile.created_at) < new Date('2026-12-31');
    } else if (badgeId === 'viral_post') {
      earned = eventCounts['content_received_engagement'] >= 50;
    } else if (badgeId === 'streak_7') {
      const { data: streak } = await supabase
        .from('user_streaks')
        .select('current_streak')
        .eq('user_id', userId)
        .single();
      earned = streak?.current_streak >= 7;
    } else if (badgeId === 'streak_30') {
      const { data: streak } = await supabase
        .from('user_streaks')
        .select('current_streak')
        .eq('user_id', userId)
        .single();
      earned = streak?.current_streak >= 30;
    } else if (badgeId === 'burn_legend') {
      earned = profile.reputation >= 1000;
    } else {
      const [eventType, countStr] = badge.requirement.split(':');
      const requiredCount = parseInt(countStr);
      earned = (eventCounts[eventType] || 0) >= requiredCount;
    }

    if (earned) {
      const { error } = await supabase
        .from('user_badges')
        .insert({
          user_id: userId,
          badge_id: badgeId,
        });

      if (!error) {
        newBadges.push(badge);
      }
    }
  }

  return newBadges;
}

/**
 * Get user's earned badges
 */
export async function getUserBadges(userId) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('user_badges')
    .select('badge_id, unlocked_at')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  return (data || []).map(ub => ({
    ...BADGES[ub.badge_id],
    unlocked_at: ub.unlocked_at,
  })).filter(b => b.id);
}

/**
 * Check and unlock achievements for a user
 */
export async function checkAndUnlockAchievements(userId) {
  const supabase = await createClient();

  const { data: existingAchievements } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId);

  const earnedIds = new Set((existingAchievements || []).map(a => a.achievement_id));
  const newAchievements = [];

  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    if (earnedIds.has(id)) continue;

    let earned = false;

    if (id === 'first_post') {
      const { count } = await supabase
        .from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      earned = count > 0;
    } else if (id === 'first_comment') {
      const { count } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      earned = count > 0;
    } else if (id === 'first_follow') {
      const { count } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId);
      earned = count > 0;
    } else if (id === 'first_reaction') {
      const { count } = await supabase
        .from('reactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      earned = count > 0;
    } else if (id.startsWith('rep_')) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('reputation')
        .eq('user_id', userId)
        .single();
      earned = profile?.reputation >= parseInt(id.split('_')[1]);
    } else if (id.startsWith('streak_')) {
      const { data: streak } = await supabase
        .from('user_streaks')
        .select('current_streak')
        .eq('user_id', userId)
        .single();
      earned = streak?.current_streak >= parseInt(id.split('_')[1]);
    } else if (id === 'viral_post') {
      // A post with 50+ received engagements (same signal as the badge).
      const { count } = await supabase
        .from('reputation_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'content_received_engagement');
      earned = (count || 0) >= 50;
    }

    if (earned) {
      const { error } = await supabase
        .from('user_achievements')
        .insert({
          user_id: userId,
          achievement_id: id,
        });

      if (!error) {
        newAchievements.push(achievement);
      }
    }
  }

  return newAchievements;
}

/**
 * Get user's earned achievements
 */
export async function getUserAchievements(userId) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('user_achievements')
    .select('achievement_id, unlocked_at')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  return (data || []).map(ua => ({
    ...ACHIEVEMENTS[ua.achievement_id],
    unlocked_at: ua.unlocked_at,
  })).filter(a => a.id);
}
