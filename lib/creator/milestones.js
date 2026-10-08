/**
 * BURNBOARD — Creator Milestones (Master Prompt 13)
 *
 * Real milestone service. Milestones are NEVER guessed and never written
 * directly by clients: the database function `ensure_creator_milestones`
 * (SECURITY DEFINER, no direct table policies) recomputes every threshold
 * from live platform data and inserts only genuinely earned rows, returning
 * only the newly earned ones. This module calls it and turns newly-earned
 * milestones into one-time, non-spammy notifications.
 */

import { getMilestoneDef, NEXT_MILESTONE_HINTS as NEXT_HINTS } from '@/lib/creator/config';

/**
 * Ask the database to reconcile the creator's milestones against real data.
 * Resolves to the list of newly earned milestones (empty when nothing new).
 * Fire-and-forget friendly: never throws.
 */
export async function ensureMilestones(client, userId) {
  if (!client || !userId) return [];
  try {
    const { data, error } = await client.rpc('ensure_creator_milestones', {
      p_user: userId,
    });
    if (error || !data) return [];
    return data.map((row) => ({ key: row.milestone_key, value: row.value }));
  } catch {
    return [];
  }
}

/**
 * One-shot notification for newly earned milestones (once per milestone —
 * the DB unique key guarantees this can never repeat).
 */
export async function notifyMilestones(client, userId, newlyEarned) {
  if (!client || !userId || !newlyEarned?.length) return;
  try {
    for (const { key } of newlyEarned) {
      const def = getMilestoneDef(key);
      if (!def) continue;
      await client.from('notifications').insert({
        user_id: userId,
        type: 'milestone',
        title: `${def.icon} Milestone unlocked — ${def.label}`,
        message: def.notify || def.description,
        link: '/insights',
        is_read: false,
      });
    }
  } catch {
    // Notifications are non-critical; the milestone itself is already stored.
  }
}

/**
 * Convenience wrapper used by instrumented routes: reconcile + notify,
 * fire-and-forget, never throws. `withNotify` is true only when the call is
 * happening right after the triggering event (follow / reaction / comment /
 * post) so milestones notify at the moment they are earned.
 */
export async function pingMilestones(client, userId, { withNotify = true } = {}) {
  if (!client || !userId) return [];
  const newly = await ensureMilestones(client, userId);
  if (withNotify && newly.length) {
    await notifyMilestones(client, userId, newly);
  }
  return newly;
}

/**
 * Fetch the creator's full milestone history (achieved_at newest first),
 * enriched with definition metadata. Never throws.
 */
export async function fetchMilestones(client, userId) {
  if (!client || !userId) return [];
  try {
    const { data, error } = await client
      .from('creator_milestones')
      .select('milestone_key, value, achieved_at')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false });

    if (error || !data) return [];
    return data.map((row) => ({
      key: row.milestone_key,
      value: row.value,
      achievedAt: row.achieved_at,
      ...(getMilestoneDef(row.milestone_key) || {}),
    }));
  } catch {
    return [];
  }
}

/**
 * Honest "next steps": first unachieved hints for a given real count, so the
 * dashboard shows forward motion without manufactured pressure.
 */
export function nextMilestoneHints({ posts = 0, followers = 0, reactions = 0, comments = 0 } = {}) {
  const counts = { posts, followers, reactions, comments };
  const remaining = [];
  for (const hint of NEXT_HINTS) {
    if (counts[hint.metric] === undefined) continue;
    if (counts[hint.metric] >= hint.target) continue;
    remaining.push({ ...hint, progress: Math.min(1, counts[hint.metric] / hint.target) });
    if (remaining.length >= 3) break;
  }
  return remaining;
}
