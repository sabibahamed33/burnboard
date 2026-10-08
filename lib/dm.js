/**
 * BURNBOARD Direct Messages — shared service helpers.
 *
 * 1:1 conversations only (sorted user pair = one thread). Every helper is
 * authorization-aware but the API routes remain the enforcement point —
 * the UI never grants anything itself.
 *
 * Privacy model:
 *   - dm_threads.status 'requested' = message request awaiting recipient.
 *   - user_profiles.dm_privacy gates NEW threads: everyone | follows | none.
 *     'follows' means only users the recipient follows may start (or
 *     request) a conversation. Existing active threads keep working if the
 *     setting later changes — only thread creation is gated.
 *   - Blocks (either direction) refuse thread creation AND sending.
 */

export const DM_PRIVACY = {
  EVERYONE: 'everyone',
  FOLLOWS: 'follows',
  NONE: 'none',
};

export const DM_PRIVACY_OPTIONS = [
  {
    key: 'everyone',
    label: 'Everyone',
    desc: 'Anyone on BurnBoard can message you.',
  },
  {
    key: 'follows',
    label: 'People you follow',
    desc: 'Only users you follow can start a conversation. Others send a request.',
  },
  {
    key: 'none',
    label: 'No one new',
    desc: 'No new conversations. Existing chats keep working.',
  },
];

/** Canonical order for a 1:1 pair (matches the unique constraint). */
export function sortPair(a, b) {
  return String(a) < String(b) ? [a, b] : [b, a];
}

/** The other participant's user id. */
export function otherParticipant(thread, viewerId) {
  if (!thread || !viewerId) return null;
  return thread.user1_id === viewerId ? thread.user2_id : thread.user1_id;
}

/**
 * Decide the fate of a NEW thread given the recipient's privacy setting.
 * Returns 'active' | 'requested' | 'denied'.
 */
export function decideThreadStatus({ recipientPrivacy, recipientFollowsRequester }) {
  const privacy = recipientPrivacy || DM_PRIVACY.EVERYONE;
  if (privacy === DM_PRIVACY.NONE) return 'denied';
  if (privacy === DM_PRIVACY.FOLLOWS && !recipientFollowsRequester) return 'requested';
  return 'active';
}

/**
 * Validate a share reference before it is attached to a message.
 * Returns { ok: true, ref } or { ok: false, error }.
 * Only references the viewer is allowed to see are shareable — private
 * content can never leak into a conversation the recipient can't access.
 */
export async function validateShareRef(client, kind, id, viewerId) {
  if (!kind || !id) return { ok: false, error: 'Missing share reference' };

  if (kind === 'social_post') {
    const { data: post } = await client
      .from('social_posts')
      .select('id, user_id, visibility, moderation_state, community_id')
      .eq('id', id)
      .maybeSingle();
    if (!post || post.moderation_state === 'hidden') {
      return { ok: false, error: 'That post is no longer available' };
    }
    const vis = post.visibility || 'public';
    if (vis === 'public') return { ok: true, ref: { kind, id } };
    if (!viewerId) return { ok: false, error: 'That post is not shareable' };
    if (post.user_id === viewerId) return { ok: true, ref: { kind, id } };
    if (vis === 'followers') {
      const { data: follow } = await client
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('following_id', post.user_id)
        .maybeSingle();
      if (!follow) return { ok: false, error: 'That post is not shareable' };
      return { ok: true, ref: { kind, id } };
    }
    return { ok: false, error: 'That post is not shareable' };
  }

  if (kind === 'profile') {
    const { data: profile } = await client
      .from('user_profiles')
      .select('id, username')
      .eq('id', id)
      .maybeSingle();
    if (!profile) return { ok: false, error: 'That profile is no longer available' };
    return { ok: true, ref: { kind, id } };
  }

  if (kind === 'community') {
    const { data: community } = await client
      .from('communities')
      .select('id, visibility, status')
      .eq('id', id)
      .maybeSingle();
    if (!community || community.status !== 'active') {
      return { ok: false, error: 'That community is no longer available' };
    }
    if (community.visibility === 'public') return { ok: true, ref: { kind, id } };
    if (!viewerId) return { ok: false, error: 'That community is not shareable' };
    const { data: membership } = await client
      .from('community_members')
      .select('id')
      .eq('community_id', id)
      .eq('user_id', viewerId)
      .eq('membership_status', 'active')
      .maybeSingle();
    if (!membership) return { ok: false, error: 'That community is not shareable' };
    return { ok: true, ref: { kind, id } };
  }

  if (kind === 'challenge') {
    const { data: challenge } = await client
      .from('challenges')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (!challenge || challenge.status === 'cancelled') {
      return { ok: false, error: 'That challenge is no longer available' };
    }
    return { ok: true, ref: { kind, id } };
  }

  if (kind === 'battle') {
    const { data: battle } = await client
      .from('battles')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!battle) return { ok: false, error: 'That battle is no longer available' };
    return { ok: true, ref: { kind, id } };
  }

  return { ok: false, error: 'Unsupported share type' };
}

/** Shape a thread row for the conversation list. */
export function shapeThread(thread, otherProfile, unreadCount = 0) {
  return {
    id: thread.id,
    status: thread.status || 'active',
    requestedByMe: !!thread.requested_by && thread.requested_by === thread.viewerId,
    otherUser: otherProfile
      ? {
          id: otherProfile.id,
          username: otherProfile.username,
          displayName: otherProfile.display_name,
          avatarUrl: otherProfile.avatar_url,
        }
      : null,
    lastMessage: thread.last_message || '',
    lastMessageAt: thread.last_message_at || thread.updated_at,
    unreadCount,
  };
}
