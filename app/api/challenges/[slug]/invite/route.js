import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { checkRateLimit, ipKey, RATE_LIMITS, getClientIp } from '@/lib/serverRateLimit';
import { notifyChallengeInvite } from '@/lib/notifications';
import { relationshipBetween, canUserPerform } from '@/lib/safety';

/**
 * POST /api/challenges/[slug]/invite
 *   { username }        — creator/participant invites an authenticated user
 *   { action: 'decline' } — the invitee declines their pending invitation
 *
 * GET /api/challenges/[slug]/invite
 *   Creator only — lists pending invitations.
 *
 * Accepting happens by participating: the moment the invitee posts an entry,
 * their invitation flips to accepted server-side.
 */

export async function GET(req, { params }) {
  try {
    const { slug } = params;
    const auth = await getRequestContext(req);
    if (!auth.client || !auth.userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { data: challenge } = await auth.client
      .from('challenges')
      .select('id, creator_id')
      .eq('slug', slug)
      .maybeSingle();
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    if (challenge.creator_id !== auth.userId) {
      return NextResponse.json({ error: 'Only the host can view invitations' }, { status: 403 });
    }

    const { data: invites } = await auth.client
      .from('challenge_invitations')
      .select('id, invitee_id, status, created_at')
      .eq('challenge_id', challenge.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const rows = invites || [];
    const userIds = [...new Set(rows.map(r => r.invitee_id).filter(Boolean))];
    const profiles = {};
    if (userIds.length > 0) {
      const { data: profileRows } = await auth.client
        .from('user_profiles')
        .select('id, username, display_name')
        .in('id', userIds);
      for (const p of profileRows || []) profiles[p.id] = p;
    }

    return NextResponse.json({
      invitations: rows.map(r => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        invitee: profiles[r.invitee_id]
          ? { username: profiles[r.invitee_id].username, display_name: profiles[r.invitee_id].display_name }
          : null,
      })),
    });
  } catch (err) {
    console.error('[Challenges] Invites list error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const { slug } = params;
    const body = await req.json();
    const auth = await getRequestContext(req);
    if (!auth.client || !auth.userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const client = auth.client;

    const { data: challenge } = await client
      .from('challenges')
      .select('id, slug, title, creator_id, status, challenge_type')
      .eq('slug', slug)
      .maybeSingle();
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    if (challenge.status !== 'active') {
      return NextResponse.json({ error: 'This challenge is no longer accepting participants' }, { status: 400 });
    }

    // ── Decline (invitee only) ────────────────────────────────
    if (body.action === 'decline') {
      const { data: invitation } = await client
        .from('challenge_invitations')
        .select('id, invitee_id, status')
        .eq('challenge_id', challenge.id)
        .eq('invitee_id', auth.userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!invitation) {
        return NextResponse.json({ error: 'No pending invitation to decline' }, { status: 404 });
      }

      const { error: declineError } = await client
        .from('challenge_invitations')
        .update({ status: 'declined' })
        .eq('id', invitation.id)
        .eq('invitee_id', auth.userId);

      if (declineError) {
        return NextResponse.json({ error: 'Failed to decline invitation' }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: 'declined' });
    }

    // ── Send invite (creator or active participant) ───────────
    const { username } = body;
    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const { data: participation } = await client
      .from('challenge_participants')
      .select('id')
      .eq('challenge_id', challenge.id)
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .maybeSingle();

    if (challenge.creator_id !== auth.userId && !participation) {
      return NextResponse.json(
        { error: 'Participate in the challenge before inviting others' },
        { status: 403 }
      );
    }

    // Find invitee by username (exact, case-insensitive)
    const { data: inviteeProfile } = await client
      .from('user_profiles')
      .select('id, username')
      .ilike('username', username.trim().replace(/^@/, ''))
      .maybeSingle();

    if (!inviteeProfile) {
      return NextResponse.json({ error: 'No BurnBoard user with that username' }, { status: 404 });
    }
    if (inviteeProfile.id === auth.userId) {
      return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 });
    }

    // ── Safety enforcement (Master Prompt 11) ──────────────────
    // Invitations must respect blocks (mutual) and account restrictions.
    // A block is a real server-side barrier — not a hidden button.
    const allowedInvite = await canUserPerform(client, 'invite');
    if (!allowedInvite) {
      return NextResponse.json(
        { error: 'Your account is currently restricted from sending invitations' },
        { status: 403 }
      );
    }
    const rel = await relationshipBetween(client, auth.userId, inviteeProfile.id);
    if (rel.viewer_blocks_other || rel.other_blocks_viewer) {
      return NextResponse.json(
        { error: 'You cannot invite this user' },
        { status: 403 }
      );
    }

    const { data: alreadyParticipant } = await client
      .from('challenge_participants')
      .select('id')
      .eq('challenge_id', challenge.id)
      .eq('user_id', inviteeProfile.id)
      .eq('status', 'active')
      .maybeSingle();
    if (alreadyParticipant) {
      return NextResponse.json({ error: '@' + inviteeProfile.username + ' already participates in this challenge' }, { status: 409 });
    }

    // Rate limit per user (anti invitation spam)
    const userCheck = checkRateLimit(ipKey(auth.userId, 'challenge_invite'), RATE_LIMITS.CHALLENGE_INVITE);
    if (!userCheck.allowed) {
      return NextResponse.json({ error: 'Too many invitations sent — slow down' }, { status: 429 });
    }

    // Prevent duplicate pending invitations (DB also enforces via unique index)
    const { data: existingInvite } = await client
      .from('challenge_invitations')
      .select('id, status')
      .eq('challenge_id', challenge.id)
      .eq('invitee_id', inviteeProfile.id)
      .maybeSingle();
    if (existingInvite && existingInvite.status === 'pending') {
      return NextResponse.json(
        { error: '@' + inviteeProfile.username + ' was already invited' },
        { status: 409 }
      );
    }

    const { data: invitation, error } = await client
      .from('challenge_invitations')
      .insert({
        challenge_id: challenge.id,
        inviter_id: auth.userId,
        invitee_id: inviteeProfile.id,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[Challenges] Invite error:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That user was already invited' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
    }

    // Notify the invitee (hook — full engine ships later)
    try {
      await notifyChallengeInvite({
        challengeId: challenge.id,
        challengeSlug: challenge.slug,
        challengeTitle: challenge.title,
        inviterId: auth.userId,
        inviteeId: inviteeProfile.id,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        status: 'pending',
        invitee: inviteeProfile.username,
      },
      message: `Invitation sent to @${inviteeProfile.username}`,
    });
  } catch (err) {
    console.error('[Challenges] Invite error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
