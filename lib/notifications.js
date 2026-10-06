/**
 * BURN BOARD — Notification Service
 * 
 * Event-driven in-app notification system.
 * Generates meaningful notifications for hot seat, roast, reaction, and battle events.
 * 
 * Deduplication: Uses dedup_key with time-window grouping.
 * Preferences: Checks user notification preferences before generating.
 * Privacy: Does not expose actor identity unless safe.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ── Notification Types ───────────────────────────────────────
export const NOTIFICATION_TYPES = {
  FOLLOW: 'follow',
  NEW_ROAST: 'new_roast',
  REACTION_ACTIVITY: 'reaction_activity',
  BURN_SCORE_MILESTONE: 'burn_score_milestone',
  BATTLE_INVITE: 'battle_invite',
  BATTLE_READY: 'battle_ready',
  BATTLE_RESULT: 'battle_result',
  LEADERBOARD_ENTRY: 'leaderboard_entry',
  WEEKLY_RECAP: 'weekly_recap',
  // Community events (Master Prompt 8 — notification engine ships in MP10)
  COMMUNITY_JOINED: 'community_joined',
  COMMUNITY_ROLE_CHANGED: 'community_role_changed',
  // Challenge events (Master Prompt 9 — hooks only, engine ships in MP10)
  CHALLENGE_INVITE: 'challenge_invite',
  CHALLENGE_RESULT: 'challenge_result',
  // Billing events (Master Prompt 15 — subscription/entitlement lifecycle)
  BILLING: 'billing',
};

// ── Notification Icons & Labels ──────────────────────────────
export const NOTIFICATION_META = {
  [NOTIFICATION_TYPES.FOLLOW]: {
    emoji: '🤝',
    label: 'New Follower',
    color: 'text-amber-400',
  },
  [NOTIFICATION_TYPES.NEW_ROAST]: {
    emoji: '🔥',
    label: 'New Roast',
    color: 'text-[#ff4d00]',
  },
  [NOTIFICATION_TYPES.REACTION_ACTIVITY]: {
    emoji: '😂',
    label: 'Reaction Activity',
    color: 'text-yellow-400',
  },
  [NOTIFICATION_TYPES.BURN_SCORE_MILESTONE]: {
    emoji: '🔥',
    label: 'Burn Score',
    color: 'text-[#ff4d00]',
  },
  [NOTIFICATION_TYPES.BATTLE_INVITE]: {
    emoji: '⚔️',
    label: 'Battle Invite',
    color: 'text-blue-400',
  },
  [NOTIFICATION_TYPES.BATTLE_READY]: {
    emoji: '⚔️',
    label: 'Battle Ready',
    color: 'text-blue-400',
  },
  [NOTIFICATION_TYPES.BATTLE_RESULT]: {
    emoji: '🏆',
    label: 'Battle Result',
    color: 'text-amber-400',
  },
  [NOTIFICATION_TYPES.LEADERBOARD_ENTRY]: {
    emoji: '🏆',
    label: 'Leaderboard',
    color: 'text-amber-400',
  },
  [NOTIFICATION_TYPES.WEEKLY_RECAP]: {
    emoji: '📅',
    label: 'Weekly Recap',
    color: 'text-purple-400',
  },
  [NOTIFICATION_TYPES.COMMUNITY_JOINED]: {
    emoji: '👋',
    label: 'Community',
    color: 'text-[#ff4d00]',
  },
  [NOTIFICATION_TYPES.COMMUNITY_ROLE_CHANGED]: {
    emoji: '🛡️',
    label: 'Community Role',
    color: 'text-amber-400',
  },
  [NOTIFICATION_TYPES.CHALLENGE_INVITE]: {
    emoji: '🎯',
    label: 'Challenge Invite',
    color: 'text-[#ff4d00]',
  },
  [NOTIFICATION_TYPES.CHALLENGE_RESULT]: {
    emoji: '🏆',
    label: 'Challenge Result',
    color: 'text-amber-400',
  },
  [NOTIFICATION_TYPES.BILLING]: {
    emoji: '💳',
    label: 'Billing',
    color: 'text-emerald-400',
  },
};

// ── Dedup Time Windows (minutes) ─────────────────────────────
const DEDUP_WINDOWS = {
  [NOTIFICATION_TYPES.FOLLOW]: 0,           // Each genuine follow is a real event
  [NOTIFICATION_TYPES.NEW_ROAST]: 30,       // Group roasts within 30 min
  [NOTIFICATION_TYPES.REACTION_ACTIVITY]: 60, // Group reactions within 1 hour
  [NOTIFICATION_TYPES.BURN_SCORE_MILESTONE]: 1440, // 24 hours
  [NOTIFICATION_TYPES.BATTLE_INVITE]: 0,    // No dedup
  [NOTIFICATION_TYPES.BATTLE_READY]: 0,     // No dedup
  [NOTIFICATION_TYPES.BATTLE_RESULT]: 0,    // No dedup
  [NOTIFICATION_TYPES.LEADERBOARD_ENTRY]: 1440,
  [NOTIFICATION_TYPES.WEEKLY_RECAP]: 10080, // 7 days
  [NOTIFICATION_TYPES.COMMUNITY_JOINED]: 0,     // Every join is real
  [NOTIFICATION_TYPES.COMMUNITY_ROLE_CHANGED]: 0, // Every role change matters
  [NOTIFICATION_TYPES.CHALLENGE_INVITE]: 0,    // Every invite matters
  [NOTIFICATION_TYPES.CHALLENGE_RESULT]: 0,    // Results are one-time
  [NOTIFICATION_TYPES.BILLING]: 1440,          // Group billing notices within 24h
};

// ── Preference Field Mapping ─────────────────────────────────
const PREF_MAP = {
  [NOTIFICATION_TYPES.FOLLOW]: 'follow_alerts',
  [NOTIFICATION_TYPES.NEW_ROAST]: 'roast_alerts',
  [NOTIFICATION_TYPES.REACTION_ACTIVITY]: 'roast_alerts',
  [NOTIFICATION_TYPES.BURN_SCORE_MILESTONE]: 'roast_alerts',
  [NOTIFICATION_TYPES.BATTLE_INVITE]: 'battle_alerts',
  [NOTIFICATION_TYPES.BATTLE_READY]: 'battle_alerts',
  [NOTIFICATION_TYPES.BATTLE_RESULT]: 'battle_alerts',
  [NOTIFICATION_TYPES.LEADERBOARD_ENTRY]: 'upvote_alerts',
  [NOTIFICATION_TYPES.WEEKLY_RECAP]: 'email_notifications',
  [NOTIFICATION_TYPES.BILLING]: 'email_notifications',
};

// ── Billing Notification Generator (Master Prompt 15) ────────

/**
 * Notify a user about a billing lifecycle event (e.g. subscription started,
 * renewed, cancelled). Fire-and-forget, never throws. Deduped within 24h.
 */
export async function notifyBilling({ userId, title, message, link = '/settings/billing', entityType = 'billing', entityId = null }) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!userId || !title || !message) return;
  await createNotification({
    userId,
    type: NOTIFICATION_TYPES.BILLING,
    title,
    message,
    link,
    entityType,
    entityId,
  });
}

// ── Core: Create Notification ────────────────────────────────

async function createNotification({
  userId,
  type,
  title,
  message,
  link,
  entityType,
  entityId,
  meta,
  actorUserId = null,
}) {
  if (!isSupabaseConfigured || !supabase) return null;
  if (!userId || !type || !title || !message) return null;

  // Safety gate (Master Prompt 11): never deliver notifications from (or
  // about) a user the recipient muted or blocked, or who blocked them.
  if (actorUserId) {
    try {
      const { data: allowedBySafety } = await supabase.rpc('safety_notify_allowed', {
        p_recipient: userId,
        p_actor: actorUserId,
      });
      if (allowedBySafety === false) return null;
    } catch {
      // RPC unavailable (migration pending) — notification proceeds; the
      // safety gate is additive hardening, not a delivery blocker.
    }
  }

  // Check user preferences
  const allowed = await checkPreference(userId, type);
  if (!allowed) return null;

  // Deduplication check
  const dedupKey = generateDedupKey(type, entityType, entityId, userId);
  const windowMinutes = DEDUP_WINDOWS[type] || 0;
  
  if (windowMinutes > 0 && dedupKey) {
    const isDuplicate = await checkDuplicate(userId, dedupKey, windowMinutes);
    if (isDuplicate) {
      // Update existing notification with incremented count
      await bumpNotificationCount(userId, dedupKey);
      return null;
    }
  }

  // Insert notification
  const notification = {
    user_id: userId,
    type,
    title,
    message,
    link: link || null,
    is_read: false,
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert([notification])
    .select()
    .single();

  if (error) {
    console.error('[Notifications] Insert error:', error);
    return null;
  }

  return data;
}

// ── Dedup Helpers ────────────────────────────────────────────

function generateDedupKey(type, entityType, entityId, userId) {
  if (!type) return null;
  return `${type}:${entityType || 'global'}:${entityId || 'none'}:${userId}`;
}

async function checkDuplicate(userId, dedupKey, windowMinutes) {
  if (!isSupabaseConfigured || !supabase) return false;

  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', dedupKey.split(':')[0])
    .gte('created_at', cutoff)
    .limit(1);

  return data && data.length > 0;
}

async function bumpNotificationCount(userId, dedupKey) {
  // For grouped notifications, we update the message to show count
  // This is a simple approach - in production, use a counter field
  const type = dedupKey.split(':')[0];
  
  if (!isSupabaseConfigured || !supabase) return;

  const { data: existing } = await supabase
    .from('notifications')
    .select('id, message')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing && existing.message) {
    // Simple count extraction from message
    const countMatch = existing.message.match(/(\d+)/);
    const currentCount = countMatch ? parseInt(countMatch[1]) : 1;
    const newCount = currentCount + 1;
    
    // Update message with new count (keep the core message, just bump number)
    const baseMessage = existing.message.replace(/^\d+ /, '').replace(/^You have \d+ /, '');
    await supabase
      .from('notifications')
      .update({ 
        message: `${newCount} ${baseMessage.replace(/^\d+ /, '')}`,
        created_at: new Date().toISOString(), // refresh timestamp
      })
      .eq('id', existing.id);
  }
}

// ── Preference Check ─────────────────────────────────────────

async function checkPreference(userId, type) {
  if (!isSupabaseConfigured || !supabase) return true;

  const prefField = PREF_MAP[type];
  if (!prefField) return true; // No preference mapped, allow

  const { data } = await supabase
    .from('user_profiles')
    .select(prefField)
    .eq('id', userId)
    .single();

  if (!data) return true; // No profile, allow (anonymous)

  return data[prefField] !== false;
}

// ── Follow Event Generator (Master Prompt 13) ────────────────

/**
 * Notify a user that someone new followed them.
 * Fire-and-forget: called right after a REAL, server-verified follow insert.
 * The safety gate above suppresses delivery when the actor is muted/blocked
 * or has blocked the recipient; preferences are honored (follow_alerts).
 */
export async function notifyNewFollower({ followerId, followedUserId }) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!followedUserId || !followerId || followerId === followedUserId) return;

  // Only notify for real, discoverable profiles (never anonymous legacy ids).
  const { data: follower } = await supabase
    .from('user_profiles')
    .select('username, display_name')
    .eq('id', followerId)
    .maybeSingle();

  if (!follower?.username) return;

  const displayName = follower.display_name || `@${follower.username}`;

  await createNotification({
    userId: followedUserId,
    type: NOTIFICATION_TYPES.FOLLOW,
    title: '🤝 New follower',
    message: `${displayName} started following you.`,
    link: `/u/${follower.username}`,
    entityType: 'user',
    entityId: followerId,
    actorUserId: followerId,
  });
}

// ── Challenge Event Generators (Master Prompt 9 hooks) ───────

/**
 * Notify a user that they were invited to a challenge.
 */
export async function notifyChallengeInvite({ challengeId, challengeSlug, challengeTitle, inviterId, inviteeId }) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!inviteeId || inviteeId === inviterId) return;

  let inviterName = 'Someone';
  if (inviterId) {
    const { data: inviter } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('id', inviterId)
      .maybeSingle();
    inviterName = inviter?.username ? `@${inviter.username}` : 'Someone';
  }

  await createNotification({
    userId: inviteeId,
    type: NOTIFICATION_TYPES.CHALLENGE_INVITE,
    title: '🎯 You were challenged!',
    message: `${inviterName} invited you to \u201c${challengeTitle || 'a challenge'}\u201d. Accept by posting your entry.`,
    link: `/challenges/${challengeSlug || challengeId}`,
    entityType: 'challenge',
    entityId: challengeId,
    actorUserId: inviterId,
  });
}

/**
 * Notify challenge participants when the challenge ends with real signal.
 */
export async function notifyChallengeResult({ challengeId, challengeSlug, challengeTitle, participantIds, winnerUsername }) {
  if (!isSupabaseConfigured || !supabase) return;

  for (const participantId of participantIds || []) {
    await createNotification({
      userId: participantId,
      type: NOTIFICATION_TYPES.CHALLENGE_RESULT,
      title: '🏆 Challenge ended',
      message: winnerUsername
        ? `\u201c${challengeTitle || 'Challenge'}\u201d is over — @${winnerUsername} took the win.`
        : `\u201c${challengeTitle || 'Challenge'}\u201d is over — results are live.`,
      link: `/challenges/${challengeSlug || challengeId}`,
      entityType: 'challenge',
      entityId: challengeId,
    });
  }
}

// ── Community Event Generators (Master Prompt 8 hooks) ───────

/**
 * Notify community owners about a new member joining.
 * Never notifies the joiner themselves.
 */
export async function notifyCommunityJoined(communityId, joinerId) {
  if (!isSupabaseConfigured || !supabase) return;

  const { data: community } = await supabase
    .from('communities')
    .select('id, name, slug')
    .eq('id', communityId)
    .single();
  if (!community) return;

  const { data: owners } = await supabase
    .from('community_members')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('role', 'owner')
    .eq('membership_status', 'active');

  for (const owner of owners || []) {
    if (owner.user_id === joinerId) continue;
    await createNotification({
      userId: owner.user_id,
      type: NOTIFICATION_TYPES.COMMUNITY_JOINED,
      title: '👋 Someone joined your community',
      message: `A new member joined "${community.name}".`,
      link: `/c/${community.slug}`,
      entityType: 'community',
      entityId: communityId,
      actorUserId: joinerId,
    });
  }
}

/**
 * Notify a member that their role changed in a community.
 */
export async function notifyCommunityRoleChanged(communityId, targetUserId, newRole, community) {
  if (!isSupabaseConfigured || !supabase) return;

  const communityName = community?.name || 'your community';
  const slug = community?.slug || communityId;
  const isModeratorRole = newRole === 'moderator';
  await createNotification({
    userId: targetUserId,
    type: NOTIFICATION_TYPES.COMMUNITY_ROLE_CHANGED,
    title: isModeratorRole ? '🛡️ You are now a moderator' : 'ℹ️ Role updated',
    message: isModeratorRole
      ? `You can now moderate "${communityName}".`
      : `Your role in "${communityName}" was updated to ${newRole}.`,
    link: `/c/${slug}`,
    entityType: 'community',
    entityId: communityId,
  });
}

// ── Event Generators ─────────────────────────────────────────

/**
 * Notify hot seat creator about a new roast.
 */
export async function notifyNewRoast(hotSeatId, roastId) {
  if (!isSupabaseConfigured || !supabase) return;

  // Fetch hot seat creator
  const { data: hotSeat } = await supabase
    .from('hot_seats')
    .select('id, creator_id, title, display_name')
    .eq('id', hotSeatId)
    .single();

  if (!hotSeat || !hotSeat.creator_id) return;

  await createNotification({
    userId: hotSeat.creator_id,
    type: NOTIFICATION_TYPES.NEW_ROAST,
    title: '🔥 Your Hot Seat got roasted!',
    message: `"${hotSeat.title}" just received a new roast.`,
    link: `/hot-seat/${hotSeatId}`,
    entityType: 'hot_seat',
    entityId: hotSeatId,
  });
}

/**
 * Notify about meaningful reaction activity on a roast.
 * Only notifies at milestones: 3, 5, 10, 25, 50 reactions.
 */
export async function notifyReactionActivity(roastId, totalReactions, hotSeatId) {
  if (!isSupabaseConfigured || !supabase) return;

  // Only notify at meaningful milestones
  const MILESTONES = [3, 5, 10, 25, 50, 100];
  if (!MILESTONES.includes(totalReactions)) return;

  // Fetch hot seat creator
  const { data: hotSeat } = await supabase
    .from('hot_seats')
    .select('id, creator_id, title')
    .eq('id', hotSeatId)
    .single();

  if (!hotSeat || !hotSeat.creator_id) return;

  const emoji = totalReactions >= 25 ? '💀' : totalReactions >= 10 ? '🔥' : '😂';
  
  await createNotification({
    userId: hotSeat.creator_id,
    type: NOTIFICATION_TYPES.REACTION_ACTIVITY,
    title: `${emoji} Your roast is getting reactions!`,
    message: `"${hotSeat.title}" reached ${totalReactions} reactions.`,
    link: `/hot-seat/${hotSeatId}`,
    entityType: 'roast',
    entityId: roastId,
  });
}

/**
 * Notify about burn score milestone.
 */
export async function notifyBurnScoreMilestone(hotSeatId, burnScore) {
  if (!isSupabaseConfigured || !supabase) return;

  const MILESTONES = [25, 50, 75, 100];
  if (!MILESTONES.includes(burnScore)) return;

  const { data: hotSeat } = await supabase
    .from('hot_seats')
    .select('id, creator_id, title')
    .eq('id', hotSeatId)
    .single();

  if (!hotSeat || !hotSeat.creator_id) return;

  const label = burnScore >= 100 ? 'Absolutely Cooked' : 
                burnScore >= 75 ? 'Well Done' :
                burnScore >= 50 ? 'Blazing' : 'Singed';

  await createNotification({
    userId: hotSeat.creator_id,
    type: NOTIFICATION_TYPES.BURN_SCORE_MILESTONE,
    title: `🔥 Your Burn Score is heating up!`,
    message: `"${hotSeat.title}" reached ${label} status (${burnScore}/100).`,
    link: `/hot-seat/${hotSeatId}`,
    entityType: 'hot_seat',
    entityId: hotSeatId,
  });
}

/**
 * Notify about battle result.
 */
export async function notifyBattleResult(battleId, profile1Id, profile2Id, winnerId) {
  if (!isSupabaseConfigured || !supabase) return;

  const { data: battle } = await supabase
    .from('battles')
    .select('id, votes1, votes2')
    .eq('id', battleId)
    .single();

  if (!battle) return;

  // Fetch profile user_ids
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, user_id, username')
    .in('id', [profile1Id, profile2Id]);

  if (!profiles || profiles.length < 2) return;

  for (const profile of profiles) {
    if (!profile.user_id) continue;

    const isWinner = profile.id === winnerId;
    const opponent = profiles.find(p => p.id !== profile.id);
    
    await createNotification({
      userId: profile.user_id,
      type: NOTIFICATION_TYPES.BATTLE_RESULT,
      title: isWinner ? '🏆 You won the battle!' : '⚔️ Battle result is in!',
      message: isWinner 
        ? `You defeated @${opponent?.username || 'opponent'} in a roast battle.`
        : `@${opponent?.username || 'opponent'} won the battle.`,
      link: '/battle',
      entityType: 'battle',
      entityId: battleId,
    });
  }
}

/**
 * Notify about leaderboard entry.
 */
export async function notifyLeaderboardEntry(userId, rank, leaderboardType) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!userId || rank > 10) return; // Only notify top 10

  const labels = {
    most_cooked: 'Most Cooked',
    funniest: 'Funniest Roasts',
    savage: 'Savage Roasts',
    fatal: 'Fatal Roasts',
    top_battles: 'Top Battles',
  };

  await createNotification({
    userId,
    type: NOTIFICATION_TYPES.LEADERBOARD_ENTRY,
    title: `🏆 You made the rankings!`,
    message: `Your content reached #${rank} on the ${labels[leaderboardType] || 'leaderboard'}.`,
    link: '/leaderboards',
    entityType: 'leaderboard',
    entityId: leaderboardType,
  });
}

// ── Weekly Recap (opt-in, aggregated, honest — retention engine) ─

/**
 * Send an opt-in weekly recap built ONLY from real aggregate counts.
 * Stay silent when there is nothing worth reporting — filler destroys trust.
 * Deduped 7d via DEDUP_WINDOWS[WEEKLY_RECAP]. Never throws.
 *
 * @param {Object} opts { userId, displayName, aggregates: { replies, reactions, newFollowers, communityPosts, liveChallenges } }
 */
export async function notifyWeeklyRecap({ userId, displayName = 'there', aggregates = {} } = {}) {
  if (!isSupabaseConfigured || !supabase || !userId) return null;
  const { buildWeeklyDigest } = await import('@/lib/growth/retention.js');
  const { data: prefs } = await supabase
    .from('user_profiles')
    .select('email_notifications')
    .eq('id', userId)
    .maybeSingle();
  // Opt-in: NULL (never set) and false both mean silent. Only true delivers.
  if (prefs?.email_notifications !== true) return null;

  const digest = buildWeeklyDigest(aggregates, { displayName, prefsAllowed: true });
  if (!digest) return null; // no real signal — stay silent

  return createNotification({
    userId,
    type: NOTIFICATION_TYPES.WEEKLY_RECAP,
    title: `📅 ${digest.title}`,
    message: digest.message,
    link: digest.link,
    entityType: 'recap',
    entityId: new Date().toISOString().slice(0, 10),
  });
}

// ── Query Helpers ────────────────────────────────────────────

/**
 * Fetch notifications for a user.
 */
export async function fetchNotifications(userId, { limit = 20, offset = 0, unreadOnly = false } = {}) {
  if (!isSupabaseConfigured || !supabase || !userId) return [];

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[Notifications] Fetch error:', error);
    return [];
  }

  return data || [];
}

/**
 * Get unread count for a user.
 */
export async function getUnreadCount(userId) {
  if (!isSupabaseConfigured || !supabase || !userId) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) return 0;
  return count || 0;
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId, userId) {
  if (!isSupabaseConfigured || !supabase) return false;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  return !error;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId) {
  if (!isSupabaseConfigured || !supabase) return false;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return !error;
}

/**
 * Delete old notifications (cleanup).
 */
export async function cleanupOldNotifications(userId, daysOld = 30) {
  if (!isSupabaseConfigured || !supabase) return;

  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('is_read', true)
    .lt('created_at', cutoff);
}


