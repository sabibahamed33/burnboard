import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { effectiveStatus } from '@/lib/challenges';
import { hiddenAuthorIds } from '@/lib/safety';
import { checkRateLimit, ipKey, RATE_LIMITS, getClientIp } from '@/lib/serverRateLimit';

/**
 * POST /api/challenges/[slug]/vote
 *   Body: { post_id }
 *
 * One active vote per user per challenge (UNIQUE(challenge_id, user_id)).
 * Voting again for a different entry switches the vote; voting the same
 * entry is idempotent. Totals are always derived by count — never trusted
 * from the client.
 *
 * Eligibility (all server-side):
 *   - signed-in only (no anonymous votes — stronger than arena voting)
 *   - challenge is effectively active (not ended/cancelled/past ends_at)
 *   - entry is a real post in this challenge
 *   - no self-voting on your own entry
 *   - entries by blocked/muted authors (either direction) are rejected
 *
 * DELETE /api/challenges/[slug]/vote
 *   Withdraw the viewer's vote in this challenge.
 */

async function loadChallenge(client, slug) {
  const { data: challenge } = await client
    .from('challenges')
    .select('id, slug, status, ends_at')
    .eq('slug', slug)
    .maybeSingle();
  return challenge || null;
}

export async function POST(req, { params }) {
  try {
    const { slug } = params;
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to vote in challenges' }, { status: 401 });
    }

    const challenge = await loadChallenge(client, slug);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    if (effectiveStatus(challenge) !== 'active') {
      return NextResponse.json({ error: 'Voting is closed for this challenge' }, { status: 400 });
    }

    const body = await req.json();
    const { post_id } = body;
    if (!post_id) {
      return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
    }

    // Rate limit voting per user AND per IP (sliding window, server-side)
    const [userCheck, ipCheck] = [
      checkRateLimit(ipKey(userId, 'challenge_vote'), RATE_LIMITS.CHALLENGE_VOTE),
      checkRateLimit(ipKey(getClientIp(req), 'challenge_vote_ip'), RATE_LIMITS.CHALLENGE_VOTE),
    ];
    if (!userCheck.allowed || !ipCheck.allowed) {
      return NextResponse.json({ error: 'Too many votes — slow down' }, { status: 429 });
    }

    // Entry must be a real post in this challenge
    const { data: entry } = await client
      .from('social_posts')
      .select('id, user_id, challenge_id')
      .eq('id', post_id)
      .eq('challenge_id', challenge.id)
      .maybeSingle();

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found in this challenge' }, { status: 404 });
    }

    // No self-voting
    if (entry.user_id === userId) {
      return NextResponse.json({ error: 'You cannot vote for your own entry' }, { status: 400 });
    }

    // Blocked/muted authors (either direction) cannot receive your vote
    if (entry.user_id) {
      const hidden = await hiddenAuthorIds(client, userId, [entry.user_id]);
      if (hidden.has(entry.user_id)) {
        return NextResponse.json({ error: 'You cannot vote for this entry' }, { status: 403 });
      }
    }

    // Upsert: one active vote per user per challenge (switchable)
    const { error } = await client
      .from('challenge_votes')
      .upsert(
        {
          challenge_id: challenge.id,
          post_id: entry.id,
          user_id: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'challenge_id,user_id' }
      );

    if (error) {
      console.error('[Challenge Vote] Upsert error:', error);
      return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
    }

    // Authoritative tally for this entry (derived, not trusted)
    const { count } = await client
      .from('challenge_votes')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', challenge.id)
      .eq('post_id', entry.id);

    return NextResponse.json({
      success: true,
      post_id: entry.id,
      votes: count || 0,
      viewerVotePostId: entry.id,
    });
  } catch (err) {
    console.error('[Challenge Vote] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { slug } = params;
    const { client, userId } = await getRequestContext(req);

    if (!client) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to manage your vote' }, { status: 401 });
    }

    const challenge = await loadChallenge(client, slug);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const { error } = await client
      .from('challenge_votes')
      .delete()
      .eq('challenge_id', challenge.id)
      .eq('user_id', userId);

    if (error) {
      console.error('[Challenge Vote] Withdraw error:', error);
      return NextResponse.json({ error: 'Failed to withdraw vote' }, { status: 500 });
    }

    return NextResponse.json({ success: true, viewerVotePostId: null });
  } catch (err) {
    console.error('[Challenge Vote] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
