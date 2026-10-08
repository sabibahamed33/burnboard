import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { getChallengeDetail, getChallengeOutcome, isChallengeType, isValidEndsAt } from '@/lib/challenges';

/**
 * GET /api/challenges/[slug]
 *   Full challenge context: host, community, real counts, viewer state,
 *   pending invitations (when the viewer is the host), and — when the
 *   challenge has ended — a real outcome derived from actual votes
 *   (reactions break ties).
 *
 * PATCH /api/challenges/[slug]
 *   Host only. Body: { title?, description?, ends_at? } or
 *   { action: 'end' | 'cancel' }. Ending decides the winner from real
 *   votes, persists it, rewards the winner, and notifies participants.
 *
 * DELETE /api/challenges/[slug]
 *   Host only. Removes the challenge; entry posts survive (SET NULL).
 */

export async function GET(req, { params }) {
  try {
    const { slug } = params;
    const { searchParams } = new URL(req.url);
    const withInvites = searchParams.get('invites') === 'true';

    const auth = await getRequestContext(req);
    const challenge = await getChallengeDetail({
      slug,
      client: auth.client,
      viewerUserId: auth.userId,
    });

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    let outcome = null;
    if (challenge.status === 'ended') {
      outcome = await getChallengeOutcome(challenge.id);
    }

    let invitations = [];
    if (withInvites && challenge.viewer?.isCreator && auth.client) {
      invitations = await listCreatorInvitations(auth.client, challenge.id);
    }

    return NextResponse.json({
      challenge,
      outcome,
      invitations,
      url: `/challenges/${challenge.slug}`,
    });
  } catch (err) {
    console.error('[Challenges] Detail error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function listCreatorInvitations(client, challengeId) {
  const { data: invites } = await client
    .from('challenge_invitations')
    .select('id, invitee_id, inviter_id, status, created_at')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = invites || [];
  const userIds = [...new Set(rows.map(r => r.invitee_id).filter(Boolean))];
  const profiles = {};
  if (userIds.length > 0) {
    const { data: profileRows } = await client
      .from('user_profiles')
      .select('id, username, display_name')
      .in('id', userIds);
    for (const p of profileRows || []) profiles[p.id] = p;
  }

  return rows.map(r => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    invitee: profiles[r.invitee_id]
      ? { username: profiles[r.invitee_id].username, display_name: profiles[r.invitee_id].display_name }
      : null,
  }));
}

export async function PATCH(req, { params }) {
  try {
    const { slug } = params;
    const auth = await getRequestContext(req);
    if (!auth.client || !auth.userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const client = auth.client;

    const { data: existing } = await client
      .from('challenges')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    if (existing.creator_id !== auth.userId) {
      return NextResponse.json({ error: 'Only the host can manage this challenge' }, { status: 403 });
    }

    const body = await req.json();
    const updates = {};

    // ── Lifecycle actions (server-controlled transitions) ─────
    if (body.action === 'end') {
      if (existing.status !== 'active') {
        return NextResponse.json({ error: 'Challenge is not active' }, { status: 400 });
      }
      updates.status = 'ended';
      updates.ends_at = new Date().toISOString();
      // Decide the winner from real votes (reactions break ties), persist
      // it on the challenge, reward the winner, and notify participants.
      // Winner/rep/notify are best-effort; the status flip is authoritative.
      try {
        const { getChallengeOutcome } = await import('@/lib/challenges');
        const outcome = await getChallengeOutcome(existing.id);
        const winner = outcome?.has_signal ? outcome.top[0] : null;

        if (winner?.post_id) {
          updates.winner_post_id = winner.post_id;
          updates.decided_at = new Date().toISOString();
        }

        const [{ data: participantRows }, { data: entryRows }] = await Promise.all([
          client.from('challenge_participants').select('user_id').eq('challenge_id', existing.id).eq('status', 'active'),
          client.from('social_posts').select('id').eq('challenge_id', existing.id).limit(1),
        ]);
        if ((entryRows || []).length > 0) {
          const { notifyChallengeResult } = await import('@/lib/notifications');
          await notifyChallengeResult({
            challengeId: existing.id,
            challengeSlug: existing.slug,
            challengeTitle: existing.title,
            participantIds: (participantRows || []).map(p => p.user_id).filter(Boolean),
            winnerUsername: winner?.author?.username || null,
          });
        }

        // Winner earns Burn Rep (competitively earned, one award per challenge)
        if (winner?.post_id) {
          const { data: winningPost } = await client
            .from('social_posts')
            .select('user_id')
            .eq('id', winner.post_id)
            .maybeSingle();
          if (winningPost?.user_id) {
            await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: winningPost.user_id,
                event_type: 'challenge_won',
                source_type: 'challenge',
                source_id: existing.id,
              }),
            }).catch(() => {});
          }
        }
      } catch {
        // winner/rep/notifications are non-critical
      }
    } else if (body.action === 'cancel') {
      if (existing.status !== 'active') {
        return NextResponse.json({ error: 'Challenge is not active' }, { status: 400 });
      }
      updates.status = 'cancelled';
    } else {
      // ── Editable fields ──────────────────────────────────────
      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (title.length < 3 || title.length > 120) {
          return NextResponse.json({ error: 'Title must be between 3 and 120 characters' }, { status: 400 });
        }
        updates.title = title;
      }
      if (body.description !== undefined) {
        const description = String(body.description).trim();
        if (description.length > 500) {
          return NextResponse.json({ error: 'Description must be 500 characters or less' }, { status: 400 });
        }
        updates.description = description;
      }
      if (body.ends_at !== undefined) {
        if (!isValidEndsAt(body.ends_at)) {
          return NextResponse.json(
            { error: 'ends_at must be between 1 hour and 14 days from now' },
            { status: 400 }
          );
        }
        updates.ends_at = new Date(body.ends_at).toISOString();
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
      }
    }

    const { data: updated, error } = await client
      .from('challenges')
      .update(updates)
      .eq('id', existing.id)
      .select('id, slug, title, status')
      .single();

    if (error) {
      console.error('[Challenges] Update error:', error);
      return NextResponse.json({ error: 'Failed to update challenge' }, { status: 500 });
    }

    return NextResponse.json({ success: true, challenge: updated });
  } catch (err) {
    console.error('[Challenges] Update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { slug } = params;
    const auth = await getRequestContext(req);
    if (!auth.client || !auth.userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const client = auth.client;

    const { data: existing } = await client
      .from('challenges')
      .select('id, creator_id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    if (existing.creator_id !== auth.userId) {
      return NextResponse.json({ error: 'Only the host can delete this challenge' }, { status: 403 });
    }

    // Entry posts survive deletion — their challenge context is cleared (SET NULL).
    const { error } = await client.from('challenges').delete().eq('id', existing.id);
    if (error) {
      console.error('[Challenges] Delete error:', error);
      return NextResponse.json({ error: 'Failed to delete challenge' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Challenges] Delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
