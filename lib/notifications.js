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
import { createClient } from '@supabase/supabase-js';

// ── Service-role reader (server-only) ────────────────────────
// notifications SELECT/UPDATE are RLS-gated to the recipient
// (auth.uid() = user_id), so neither the anon client nor the actor's
// session client can read a recipient's rows for grouping/milestone
// bookkeeping. This narrow server-only client performs those lookups
// and grouped updates; it is never imported by client components and
// never leaves the server. Without a service key, grouping degrades
// gracefully to fresh rows.
let _serviceClient = null;
function getServiceClient() {
  if (typeof window !== 'undefined') return null;
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  try {
    _serviceClient = createClient(url, key);
  } catch {
    return null;
  }
  return _serviceClient;
}

// ── Notification Types ───────────────────────────────────────
export const NOTIFICATION_TYPES = {
  FOLLOW: 'follow',
  NEW_ROAST: 'new_roast',
  COMMENT: 'comment',
  REPLY: 'reply',
  MENTION: 'mention',
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
  COMMUNITY_JOIN_REQUEST: 'community_join_request',
  COMMUNITY_JOIN_APPROVED: 'community_join_approved',
  // Challenge events (Master Prompt 9 — hooks only, engine ships in MP10)
  CHALLENGE_INVITE: 'challenge_invite',
  CHALLENGE_RESULT: 'challenge_result',
  // Gamification events — earned progression, never spam (level changes
  // and achievement unlocks are rare by construction)
  LEVEL_UP: 'level_up',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  // Direct messages — uses the legacy 'dm' type value so notifications keep
  // working on databases created before the newer type names existed
  DM_MESSAGE: 'dm',
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
  [NOTIFICATION_TYPES.COMMENT]: {
    emoji: '💬',
    label: 'Comment',
    color: 'text-sky-400',
  },
  [NOTIFICATION_TYPES.REPLY]: {
    emoji: '↩️',
    label: 'Reply',
    color: 'text-sky-400',
  },
  [NOTIFICATION_TYPES.MENTION]: {
    emoji: '📣',
    label: 'Mention',
    color: 'text-amber-400',
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
  [NOTIFICATION_TYPES.COMMUNITY_JOIN_REQUEST]: {
    emoji: '🙏',
    label: 'Join Request',
    color: 'text-[#ff4d00]',
  },
  [NOTIFICATION_TYPES.COMMUNITY_JOIN_APPROVED]: {
    emoji: '🎉',
    label: 'Community',
    color: 'text-emerald-400',
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
  [NOTIFICATION_TYPES.LEVEL_UP]: {
    emoji: '⚡',
    label: 'Level Up',
    color: 'text-[#ff4d00]',
  },
  [NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED]: {
    emoji: '🏆',
    label: 'Achievement',
    color: 'text-amber-400',
  },
  [NOTIFICATION_TYPES.DM_MESSAGE]: {
    emoji: '💬',
    label: 'Message',
    color: 'text-sky-400',
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
  [NOTIFICATION_TYPES.COMMUNITY_JOIN_REQUEST]: 0, // Every request matters
  [NOTIFICATION_TYPES.COMMUNITY_JOIN_APPROVED]: 0, // One-time approval
  [NOTIFICATION_TYPES.CHALLENGE_INVITE]: 0,    // Every invite matters
  [NOTIFICATION_TYPES.CHALLENGE_RESULT]: 0,    // Results are one-time
  [NOTIFICATION_TYPES.LEVEL_UP]: 0,            // Level changes are one-time
  [NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED]: 0, // Unlocks are one-time
  [NOTIFICATION_TYPES.DM_MESSAGE]: 60,         // Group message pings within 1h
  [NOTIFICATION_TYPES.BILLING]: 1440,          // Group billing notices within 24h
};

// ── Preference Field Mapping ─────────────────────────────────
const PREF_MAP = {
  [NOTIFICATION_TYPES.FOLLOW]: 'follow_alerts',
  [NOTIFICATION_TYPES.NEW_ROAST]: 'roast_alerts',
  [NOTIFICATION_TYPES.COMMENT]: 'roast_alerts',
  [NOTIFICATION_TYPES.REPLY]: 'roast_alerts',
  [NOTIFICATION_TYPES.MENTION]: 'roast_alerts',
  [NOTIFICATION_TYPES.REACTION_ACTIVITY]: 'roast_alerts',
  [NOTIFICATION_TYPES.BURN_SCORE_MILESTONE]: 'roast_alerts',
  [NOTIFICATION_TYPES.BATTLE_INVITE]: 'battle_alerts',
  [NOTIFICATION_TYPES.BATTLE_READY]: 'battle_alerts',
  [NOTIFICATION_TYPES.BATTLE_RESULT]: 'battle_alerts',
  [NOTIFICATION_TYPES.LEADERBOARD_ENTRY]: 'upvote_alerts',
  [NOTIFICATION_TYPES.WEEKLY_RECAP]: 'email_notifications',
  [NOTIFICATION_TYPES.BILLING]: 'email_notifications',
  [NOTIFICATION_TYPES.DM_MESSAGE]: 'dm_alerts',
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

// ── Comment / Reply / Mention Generators ─────────────────────

/** Short content preview for notification messages (no private data). */
function previewText(text, max = 120) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Extract unique @usernames (lowercased) from comment text. */
function extractMentions(text) {
  const found = new Set();
  const re = /(?:^|[\s.,;:!?()[\]{}"'])@([a-zA-Z0-9_]{3,20})/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null && found.size < 8) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

/** Thread-grouping window: rapid repeats from the same actor collapse. */
const THREAD_GROUP_MINUTES = 30;

/**
 * Create a comment/reply notification, or group it into the recent
 * unread one from the same actor on the same thread ("X left 3 comments
 * on your post.") instead of spamming one row per comment.
 * Never throws; safety gate re-checked before grouping.
 */
async function createOrGroupThreadNotification({
  userId,
  type,
  link,
  actorName,
  actorUserId,
  singleMessage,
  groupedMessage,
  title,
  entityType,
  entityId,
  client = null,
}) {
  // Grouping lookups/updates run through the service-role reader when
  // available (RLS denies them to anon/actor clients). Without a service
  // key this degrades gracefully to a fresh row per event.
  const db = getServiceClient() || client || supabase;
  if (!isSupabaseConfigured || !db) return null;
  if (!userId || userId === actorUserId) return null;

  // Safety re-check (block/mute state may have changed since the last row).
  if (actorUserId) {
    try {
      const { data: allowed } = await db.rpc('safety_notify_allowed', {
        p_recipient: userId,
        p_actor: actorUserId,
      });
      if (allowed === false) return null;
    } catch {
      // RPC unavailable — proceed; createNotification re-checks anyway.
    }
  }

  const cutoff = new Date(Date.now() - THREAD_GROUP_MINUTES * 60 * 1000).toISOString();

  try {
    const { data: recent } = await db
      .from('notifications')
      .select('id, message')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('link', link)
      .eq('is_read', false)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(5);

    const mine = (recent || []).find((r) =>
      typeof r.message === 'string' && r.message.startsWith(actorName)
    );

    if (mine) {
      const countMatch = mine.message.match(/left (\d+) /);
      const next = countMatch ? parseInt(countMatch[1], 10) + 1 : 2;
      await db
        .from('notifications')
        .update({
          message: groupedMessage(next),
          created_at: new Date().toISOString(),
        })
        .eq('id', mine.id);
      return null;
    }
  } catch {
    // Grouping lookup failed — fall through to a fresh notification.
  }

  return createNotification({
    userId,
    type,
    title,
    message: singleMessage,
    link,
    entityType,
    entityId,
    actorUserId,
  });
}

/**
 * Notify on comment activity. Fire-and-forget from POST /api/comments
 * after a REAL, persisted comment insert. Sends at most:
 *   - one reply notification to the parent comment author, OR
 *   - one comment notification to the content author,
 * plus one mention notification per newly @-mentioned user.
 * Self-activity never notifies. Anonymous comments never notify
 * (no verifiable actor identity).
 */
export async function notifyCommentActivity({
  commentId,
  targetType,
  targetId,
  authorId,
  parentCommentId = null,
  text = '',
}) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!authorId || !targetId || !commentId) return;

  try {
    const { data: actor } = await supabase
      .from('user_profiles')
      .select('username, display_name')
      .eq('id', authorId)
      .maybeSingle();
    if (!actor?.username) return;

    const actorName = actor.display_name || `@${actor.username}`;
    const preview = previewText(text);
    const quoted = preview ? ` "${preview}"` : '';
    const link = targetType === 'roast' ? `/r/${targetId}` : `/post/${targetId}`;
    const notified = new Set([authorId]);

    if (parentCommentId) {
      const { data: parent } = await supabase
        .from('comments')
        .select('user_id')
        .eq('id', parentCommentId)
        .maybeSingle();

      if (parent?.user_id && parent.user_id !== authorId) {
        await createOrGroupThreadNotification({
          userId: parent.user_id,
          type: NOTIFICATION_TYPES.REPLY,
          title: '↩️ New reply',
          link,
          actorName,
          actorUserId: authorId,
          singleMessage: `${actorName} replied to your comment:${quoted}`,
          groupedMessage: (n) => `${actorName} left ${n} replies on your comment.`,
          entityType: 'comment',
          entityId: commentId,
        });
        notified.add(parent.user_id);
      }
    } else {
      let contentAuthorId = null;
      if (targetType === 'social_post') {
        const { data } = await supabase
          .from('social_posts')
          .select('user_id')
          .eq('id', targetId)
          .maybeSingle();
        contentAuthorId = data?.user_id || null;
      } else if (targetType === 'roast') {
        const { data } = await supabase
          .from('roasts')
          .select('user_id')
          .eq('id', targetId)
          .maybeSingle();
        contentAuthorId = data?.user_id || null;
      }

      if (contentAuthorId && contentAuthorId !== authorId) {
        await createOrGroupThreadNotification({
          userId: contentAuthorId,
          type: NOTIFICATION_TYPES.COMMENT,
          title: '💬 New comment',
          link,
          actorName,
          actorUserId: authorId,
          singleMessage: `${actorName} commented on your post:${quoted}`,
          groupedMessage: (n) => `${actorName} left ${n} comments on your post.`,
          entityType: targetType,
          entityId: commentId,
        });
        notified.add(contentAuthorId);
      }
    }

    // @mentions — each mentioned user gets exactly one notification per
    // comment (never the author, never someone already notified above).
    const names = extractMentions(text).filter((u) => u !== actor.username.toLowerCase());
    if (names.length > 0) {
      const { data: mentioned } = await supabase
        .from('user_profiles')
        .select('id, username')
        .in('username', names);
      for (const m of (mentioned || []).slice(0, 5)) {
        if (!m?.id || notified.has(m.id)) continue;
        notified.add(m.id);
        await createNotification({
          userId: m.id,
          type: NOTIFICATION_TYPES.MENTION,
          title: '📣 You were mentioned',
          message: `${actorName} mentioned you:${quoted}`,
          link,
          entityType: targetType,
          entityId: commentId,
          actorUserId: authorId,
        });
      }
    }
  } catch (err) {
    console.error('[Notifications] Comment activity error:', err?.message || err);
  }
}

/**
 * Notify a content author about reaction milestones on social posts and
 * comments (3, 5, 10, 25, 50, 100). Each milestone notifies at most once
 * per entity — re-hitting a milestone after toggles is suppressed by
 * checking the already-announced count in the latest row.
 */
export async function notifySocialReactionActivity({
  targetType,
  targetId,
  totalReactions,
  authorId,
  actorUserId = null,
  link,
  client = null,
}) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!authorId || authorId === actorUserId) return;

  const MILESTONES = [3, 5, 10, 25, 50, 100];
  if (!MILESTONES.includes(totalReactions)) return;

  try {
    // Already announced this milestone? Never repeat it.
    const db = getServiceClient() || client || supabase;
    const { data: latest } = await db
      .from('notifications')
      .select('message')
      .eq('user_id', authorId)
      .eq('type', NOTIFICATION_TYPES.REACTION_ACTIVITY)
      .eq('link', link)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.message && latest.message.includes(`reached ${totalReactions} `)) return;

    const what = targetType === 'comment' ? 'comment' : 'post';
    await createNotification({
      userId: authorId,
      type: NOTIFICATION_TYPES.REACTION_ACTIVITY,
      title: '🔥 Reactions heating up!',
      message: `Your ${what} reached ${totalReactions} reactions.`,
      link,
      entityType: targetType,
      entityId: targetId,
      actorUserId,
    });
  } catch (err) {
    console.error('[Notifications] Reaction activity error:', err?.message || err);
  }
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

// ── Gamification Event Generators ──────────────────────────
// Level-ups and achievement unlocks are rare by construction (threshold
// crossings, one-time unlocks), so each one notifies — no grouping needed.

/**
 * Notify a user they reached a new level.
 */
export async function notifyLevelUp({ userId, oldLevel, newLevel }) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!userId || !newLevel || oldLevel === newLevel) return;

  await createNotification({
    userId,
    type: NOTIFICATION_TYPES.LEVEL_UP,
    title: `⚡ Level up — ${newLevel}`,
    message: `You went from ${oldLevel || 'unranked'} to ${newLevel}. Keep burning.`,
    link: `/insights`,
    entityType: 'level',
    entityId: newLevel,
  });
}

/**
 * Notify a user they unlocked an achievement.
 */
export async function notifyAchievementUnlocked({ userId, achievement }) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!userId || !achievement?.id) return;

  await createNotification({
    userId,
    type: NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED,
    title: `🏆 Achievement unlocked — ${achievement.name || achievement.id}`,
    message: achievement.description || 'You earned a new achievement.',
    link: `/insights`,
    entityType: 'achievement',
    entityId: achievement.id,
  });
}

// ── Direct Message Generators ────────────────────────────
// Grouped per thread (1h window): a busy conversation bumps one ping,
// it never spams one notification per message. Safety-gated via actor.

/**
 * Notify the recipient of a new DM (new message or new request).
 * Skips when the safety gate blocks actor → recipient delivery.
 */
export async function notifyDmMessage({ threadId, recipientId, senderId, senderUsername, isRequest = false, preview = '' }) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!recipientId || !senderId || recipientId === senderId) return;

  let name = senderUsername;
  if (!name) {
    try {
      const { data: sender } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', senderId)
        .maybeSingle();
      name = sender?.username || null;
    } catch {}
  }

  await createNotification({
    userId: recipientId,
    type: NOTIFICATION_TYPES.DM_MESSAGE,
    title: isRequest ? '📩 New message request' : '💬 New message',
    message: isRequest
      ? `@${name || 'Someone'} wants to message you.`
      : `@${name || 'Someone'}: ${String(preview || '').slice(0, 90)}`,
    link: `/messages?thread=${threadId}`,
    entityType: 'dm_thread',
    entityId: threadId,
    actorUserId: senderId,
  });
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

/**
 * Notify community owners about a new private-community join request.
 * Never notifies the requester themselves.
 */
export async function notifyCommunityJoinRequest(communityId, requesterId) {
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
    if (owner.user_id === requesterId) continue;
    await createNotification({
      userId: owner.user_id,
      type: NOTIFICATION_TYPES.COMMUNITY_JOIN_REQUEST,
      title: '🙏 New join request',
      message: `Someone requested to join "${community.name}".`,
      link: `/c/${community.slug}`,
      entityType: 'community',
      entityId: communityId,
      actorUserId: requesterId,
    });
  }
}

/**
 * Notify a user that their join request was approved.
 */
export async function notifyCommunityJoinApproved(communityId, targetUserId, community) {
  if (!isSupabaseConfigured || !supabase) return;

  const communityName = community?.name || 'the community';
  const slug = community?.slug || communityId;
  await createNotification({
    userId: targetUserId,
    type: NOTIFICATION_TYPES.COMMUNITY_JOIN_APPROVED,
    title: '🎉 Request approved',
    message: `Your request to join "${communityName}" was approved. Welcome in!`,
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
 *
 * Pass the request-scoped session client (reads are RLS-gated to
 * auth.uid() = user_id, so the anon client always returns nothing).
 */
export async function fetchNotifications(userId, { limit = 20, offset = 0, unreadOnly = false } = {}, client = null) {
  const db = client || supabase;
  if (!isSupabaseConfigured || !db || !userId) return [];

  let query = db
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
export async function getUnreadCount(userId, client = null) {
  const db = client || supabase;
  if (!isSupabaseConfigured || !db || !userId) return 0;

  const { count, error } = await db
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
export async function markAsRead(notificationId, userId, client = null) {
  const db = client || supabase;
  if (!isSupabaseConfigured || !db) return false;

  const { error } = await db
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  return !error;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId, client = null) {
  const db = client || supabase;
  if (!isSupabaseConfigured || !db) return false;

  const { error } = await db
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return !error;
}

/**
 * Delete old notifications (cleanup).
 */
export async function cleanupOldNotifications(userId, daysOld = 30, client = null) {
  const db = client || supabase;
  if (!isSupabaseConfigured || !db) return;

  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  await db
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('is_read', true)
    .lt('created_at', cutoff);
}


