import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import {
  getCommunityById, getViewerMembership, listCommunityMembers, canModerate,
  canManage, getMemberCounts, listPendingRequests,
} from '@/lib/communities';
import {
  notifyCommunityJoined, notifyCommunityJoinRequest, notifyCommunityJoinApproved,
} from '@/lib/notifications';
import { recordSignal } from '@/lib/reco/signals';

/**
 * POST /api/communities/[id]/members
 *   Body: { action, user_id? }
 *
 *   Member actions (authenticated user acts on themselves):
 *   - join:    public → instant active member; private → pending request;
 *              hidden → 404 (invite-only, undiscoverable).
 *              Duplicate-safe; suspended users are rejected.
 *   - cancel:  withdraw your own pending request.
 *   - leave:   leave (active) or withdraw (pending); owners cannot orphan
 *              their community.
 *
 *   Management actions:
 *   - approve: owner-only; pending → active (+ notifies the approved user).
 *   - deny:    owner-only; pending row deleted (+ audit trail).
 *   - remove:  moderators+ may remove active members (never owners).
 *   - suspend / unsuspend: moderators+ via the database-enforced
 *              community_suspend_member RPC (never owners).
 *
 * GET /api/communities/[id]/members?limit=&offset=
 *   Real, paginated member list with role info. Owners also receive the
 *   pending request queue (private communities).
 */

export async function GET(req, { params }) {
  try {
    const { id } = params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 50);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const community = await getCommunityById(id);
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const { userId } = await getRequestContext(req);

    // Suspended-member review list (moderators+ only — never public).
    if (searchParams.get('status') === 'suspended') {
      const membership = await getViewerMembership(id, userId);
      if (!canModerate(membership?.role)) {
        return NextResponse.json({ error: 'You do not have permission to review suspensions' }, { status: 403 });
      }
      const result = await listCommunityMembers(id, { limit, offset, viewerId: userId, status: 'suspended' });
      return NextResponse.json(result);
    }

    const result = await listCommunityMembers(id, { limit, offset, viewerId: userId });

    // Owners review pending requests alongside the member list.
    let pending = null;
    if (userId) {
      const membership = await getViewerMembership(id, userId);
      if (canManage(membership?.role)) {
        pending = await listPendingRequests(id);
      }
    }

    return NextResponse.json(pending ? { ...result, pending } : result);
  } catch (err) {
    console.error('[Communities] Members GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to join a community' }, { status: 401 });
    }

    const community = await getCommunityById(id);
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const body = await req.json();
    const { action } = body;

    if (!['join', 'cancel', 'leave', 'approve', 'deny', 'remove', 'suspend', 'unsuspend'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Existing row drives duplicate/ban semantics (unique membership).
    const existing = await getViewerMembership(id, userId);

    // ── JOIN / REQUEST ────────────────────────────────────────
    if (action === 'join') {
      if (existing?.membership_status === 'active') {
        return NextResponse.json({ success: true, action: 'already_member', isMember: true });
      }
      if (existing?.membership_status === 'pending') {
        return NextResponse.json({ success: true, action: 'already_requested', isMember: false, pending: true });
      }
      if (existing?.membership_status === 'suspended') {
        return NextResponse.json({ error: 'You cannot join this community' }, { status: 403 });
      }

      // Hidden communities are invite-only and undiscoverable.
      if (community.visibility === 'hidden') {
        return NextResponse.json({ error: 'Community not found' }, { status: 404 });
      }

      // Private communities use request → approval instead of instant join.
      if (community.visibility === 'private') {
        const { error } = await client
          .from('community_members')
          .insert({
            community_id: id,
            user_id: userId,
            role: 'member',
            membership_status: 'pending',
          });

        if (error) {
          if (error.code === '23505') {
            return NextResponse.json({ success: true, action: 'already_requested', isMember: false, pending: true });
          }
          console.error('[Communities] Request error:', error);
          return NextResponse.json({ error: 'Failed to request to join' }, { status: 500 });
        }

        await notifyCommunityJoinRequest(id, userId);

        return NextResponse.json({
          success: true,
          action: 'requested',
          isMember: false,
          pending: true,
        });
      }

      // Public: instant membership (existing behavior preserved).
      const { error } = await client
        .from('community_members')
        .insert({
          community_id: id,
          user_id: userId,
          role: 'member',
          membership_status: 'active',
        });

      if (error) {
        // Duplicate membership is prevented (unique constraint)
        if (error.code === '23505') {
          return NextResponse.json({ success: true, action: 'already_member', isMember: true });
        }
        console.error('[Communities] Join error:', error);
        return NextResponse.json({ error: 'Failed to join community' }, { status: 500 });
      }

      // Notification hook for community owners
      await notifyCommunityJoined(id, userId);

      // Non-critical rep + analytics hooks
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            event_type: 'community_joined',
            source_type: 'community',
            source_id: id,
          }),
        });
      } catch (e) {}
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/growth/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'community_joined',
            subjectId: userId,
            metadata: { communityId: id },
          }),
        });
      } catch (e) {}

      // Real behavior signal: joining is an explicit, strong community signal.
      recordSignal({
        client,
        userId,
        eventType: 'community_joined',
        targetType: 'community',
        targetId: id,
        context: { community_label: community.name || community.slug || null },
        idempotencyKey: `join-${id}`,
      }).catch(() => {});

      const counts = await getMemberCounts([id]);
      return NextResponse.json({
        success: true,
        action: 'joined',
        isMember: true,
        memberCount: counts[id] || 1,
      });
    }

    // ── CANCEL (withdraw own pending request) ─────────────────
    if (action === 'cancel') {
      if (!existing || existing.membership_status !== 'pending') {
        return NextResponse.json({ success: true, action: 'not_requested', isMember: false });
      }
      const { error } = await client
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('[Communities] Cancel request error:', error);
        return NextResponse.json({ error: 'Failed to withdraw request' }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: 'cancelled', isMember: false });
    }

    // ── LEAVE ─────────────────────────────────────────────────
    if (action === 'leave') {
      if (!existing || !['active', 'pending'].includes(existing.membership_status)) {
        return NextResponse.json({ success: true, action: 'not_member', isMember: false });
      }

      // Owner safety: an owner cannot orphan their community by leaving.
      if (existing.role === 'owner' && existing.membership_status === 'active') {
        return NextResponse.json(
          { error: 'Owners cannot leave. Delete the community or transfer ownership instead.' },
          { status: 400 }
        );
      }

      const { error } = await client
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('[Communities] Leave error:', error);
        return NextResponse.json({ error: 'Failed to leave community' }, { status: 500 });
      }

      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/growth/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'community_left',
            subjectId: userId,
            metadata: { communityId: id },
          }),
        });
      } catch (e) {}

      // Real behavior signal: leaving reduces community relevance.
      recordSignal({
        client,
        userId,
        eventType: 'community_left',
        targetType: 'community',
        targetId: id,
        context: { community_label: community.name || community.slug || null },
        idempotencyKey: `leave-${id}`,
      }).catch(() => {});

      const counts = await getMemberCounts([id]);
      return NextResponse.json({
        success: true,
        action: 'left',
        isMember: false,
        memberCount: counts[id] || 0,
      });
    }

    // ── Management actions below ──────────────────────────────
    const { user_id: targetUserId } = body;
    if (!targetUserId && (action === 'approve' || action === 'deny' || action === 'remove' || action === 'suspend' || action === 'unsuspend')) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    const actorMembership = await getViewerMembership(id, userId);

    // ── APPROVE / DENY (owner-only; RLS UPDATE is owner-scoped) ─
    if (action === 'approve' || action === 'deny') {
      if (!canManage(actorMembership?.role)) {
        return NextResponse.json({ error: 'Only community owners can review requests' }, { status: 403 });
      }

      const targetMembership = await getViewerMembership(id, targetUserId);
      if (!targetMembership || targetMembership.membership_status !== 'pending') {
        return NextResponse.json({ error: 'No pending request from this user' }, { status: 404 });
      }

      if (action === 'approve') {
        const { error } = await client
          .from('community_members')
          .update({ membership_status: 'active' })
          .eq('community_id', id)
          .eq('user_id', targetUserId);

        if (error) {
          console.error('[Communities] Approve error:', error);
          return NextResponse.json({ error: 'Failed to approve request' }, { status: 500 });
        }

        await client.from('moderation_actions').insert({
          action_type: 'community_approve_member',
          target_type: 'community_member',
          target_id: targetUserId,
          previous_state: 'pending',
          new_state: 'active',
          moderator_id: userId,
          moderator_note: `Approved into community ${community.slug}`,
        }).catch(() => {});

        await notifyCommunityJoinApproved(id, targetUserId, community);

        const counts = await getMemberCounts([id]);
        return NextResponse.json({ success: true, action: 'approved', memberCount: counts[id] || 0 });
      }

      // deny: delete the pending row (RLS allows owners to remove)
      const { error } = await client
        .from('community_members')
        .delete()
        .eq('community_id', id)
        .eq('user_id', targetUserId);

      if (error) {
        console.error('[Communities] Deny error:', error);
        return NextResponse.json({ error: 'Failed to decline request' }, { status: 500 });
      }

      await client.from('moderation_actions').insert({
        action_type: 'community_deny_member',
        target_type: 'community_member',
        target_id: targetUserId,
        previous_state: 'pending',
        new_state: 'denied',
        moderator_id: userId,
        moderator_note: `Declined request for community ${community.slug}`,
      }).catch(() => {});

      const counts = await getMemberCounts([id]);
      return NextResponse.json({ success: true, action: 'denied', memberCount: counts[id] || 0 });
    }

    // ── SUSPEND / UNSUSPEND (moderators+ via database-enforced RPC) ─
    if (action === 'suspend' || action === 'unsuspend') {
      if (!canModerate(actorMembership?.role)) {
        return NextResponse.json({ error: 'You do not have permission to suspend members' }, { status: 403 });
      }

      const { data, error } = await client.rpc('community_suspend_member', {
        community: id,
        target: targetUserId,
        suspend: action === 'suspend',
      });

      if (error || data !== true) {
        return NextResponse.json(
          { error: action === 'suspend' ? 'Failed to suspend member' : 'Failed to unsuspend member' },
          { status: 400 }
        );
      }

      await client.from('moderation_actions').insert({
        action_type: action === 'suspend' ? 'community_suspend_member' : 'community_unsuspend_member',
        target_type: 'community_member',
        target_id: targetUserId,
        previous_state: action === 'suspend' ? 'active' : 'suspended',
        new_state: action === 'suspend' ? 'suspended' : 'active',
        moderator_id: userId,
        moderator_note: `${action === 'suspend' ? 'Suspended from' : 'Unsuspended in'} community ${community.slug}`,
      }).catch(() => {});

      const counts = await getMemberCounts([id]);
      return NextResponse.json({
        success: true,
        action: action === 'suspend' ? 'suspended' : 'unsuspended',
        memberCount: counts[id] || 0,
      });
    }

    // ── REMOVE (moderator action, community-scoped only) ────
    const targetMembership = await getViewerMembership(id, targetUserId);
    if (!canModerate(actorMembership?.role)) {
      return NextResponse.json({ error: 'You do not have permission to remove members' }, { status: 403 });
    }

    if (!targetMembership) {
      return NextResponse.json({ error: 'User is not a member' }, { status: 404 });
    }

    // Never remove owners (owner safety)
    if (targetMembership.role === 'owner') {
      return NextResponse.json({ error: 'Community owners cannot be removed' }, { status: 400 });
    }

    // Delete the membership row (RLS allows moderators to remove others;
    // the audit log below preserves the trail)
    const { error } = await client
      .from('community_members')
      .delete()
      .eq('community_id', id)
      .eq('user_id', targetUserId);

    if (error) {
      console.error('[Communities] Remove member error:', error);
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }

    // Audit log (platform moderation compatibility)
    await client.from('moderation_actions').insert({
      action_type: 'community_remove_member',
      target_type: 'community_member',
      target_id: targetUserId,
      previous_state: targetMembership.role,
      new_state: 'removed',
      moderator_id: userId,
      moderator_note: `Removed from community ${community.slug}`,
    }).catch(() => {});

    const counts = await getMemberCounts([id]);
    return NextResponse.json({
      success: true,
      action: 'removed',
      isMember: false,
      memberCount: counts[id] || 0,
    });
  } catch (err) {
    console.error('[Communities] Members POST Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
