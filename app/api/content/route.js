import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { runDeterministicPolicy, canUserPerform } from '@/lib/safety';
import { recordSignal } from '@/lib/reco/signals';
import { pingMilestones } from '@/lib/creator/milestones';

/**
 * POST /api/content
 *
 * Universal content creation endpoint.
 * Supports: opinion, question, poll, photo, hot_take
 * Roast creation uses its own /api/hot-seat endpoint.
 *
 * Body:
 *   - content_type: string (required)
 *   - text: string (required for most types)
 *   - context: string (optional)
 *   - media_url: string (optional, for photo posts)
 *   - options: array (required for polls)
 *   - visibility: 'public' | 'followers' (default: 'public')
 *   - community_id: string (optional) — post into a community.
 *     Server-side membership + visibility are validated.
 *   - challenge_id: string (optional) — participate in a challenge.
 *     Server-side state + type + eligibility are validated; a real
 *     challenge_participants row is created and pending invitations to
 *     this user flip to accepted. Entries are canonical posts — one
 *     record, no content duplication.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

const VALID_TYPES = ['opinion', 'question', 'poll', 'photo', 'hot_take'];

export async function POST(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const body = await req.json();
    const {
      content_type, text, context, media_url, options, visibility,
      community_id, challenge_id,
    } = body;

    // Validate content type
    if (!content_type || !VALID_TYPES.includes(content_type)) {
      return NextResponse.json(
        { error: `Invalid content_type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate text
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
    }
    if (text.length > 500) {
      return NextResponse.json(
        { error: 'Text must be 500 characters or less' },
        { status: 400 }
      );
    }

    // Validate poll options
    if (content_type === 'poll') {
      if (!options || !Array.isArray(options) || options.length < 2) {
        return NextResponse.json({ error: 'Poll requires at least 2 options' }, { status: 400 });
      }
      if (options.length > 6) {
        return NextResponse.json({ error: 'Poll can have at most 6 options' }, { status: 400 });
      }
      for (const opt of options) {
        if (!opt || !opt.trim()) {
          return NextResponse.json({ error: 'All poll options must have text' }, { status: 400 });
        }
      }
    }

    // ── Safety pipeline (Master Prompt 11) — before any write ───
    // Deterministic high-precision rules run synchronously and REJECT clear
    // policy violations (slurs/hate already filtered platform-wide, direct
    // self-harm encouragement, clearly illegal content). Flag-level signals
    // never block — they are recorded async for review. AI is advisory and
    // safe-fails; it never gates the write path.
    const policy = runDeterministicPolicy((text || '').trim());
    if (policy.blocked) {
      const finding = policy.findings.find((f) => f.action === 'block');
      return NextResponse.json(
        { error: finding?.reason || 'This content violates BurnBoard safety policy' },
        { status: 400 }
      );
    }

    // ── Context resolution: community and/or challenge ─────────
    // Community posts and challenge entries require a real authenticated
    // user (never hidden UI). Whenever a session cookie exists we also write
    // through the SSR client so RLS sees the user's JWT (matching how
    // communities/challenges already work); anonymous legacy behavior is
    // preserved when there is no session.
    let contextClient = supabase;
    let contextUserId = null;
    let resolvedCommunityId = community_id || null;
    let challenge = null;

    const isContextPost = !!(community_id || challenge_id);
    const { client: sessionClient, userId: sessionUserId } = await getRequestContext(req);
    if (sessionClient && sessionUserId) {
      contextClient = sessionClient;
      contextUserId = sessionUserId;
    }

    // Account restriction check (server-side; applies to signed-in authors)
    if (sessionClient && contextUserId) {
      const allowed = await canUserPerform(sessionClient, 'post');
      if (!allowed) {
        return NextResponse.json(
          { error: 'Your account is currently restricted from posting' },
          { status: 403 }
        );
      }
    }
    if (isContextPost && (!contextClient || !contextUserId)) {
      return NextResponse.json(
        { error: 'Sign in to post in a community or challenge' },
        { status: 401 }
      );
    }

    // ── Challenge participation validation ─────────────────────
    if (challenge_id) {
      const { data: challengeRow } = await contextClient
        .from('challenges')
        .select('*')
        .eq('id', challenge_id)
        .single();

      if (!challengeRow) {
        return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
      }
      if (challengeRow.visibility !== 'public') {
        return NextResponse.json(
          { error: 'This challenge is not open to participation' },
          { status: 403 }
        );
      }
      // Honest effective state (ends_at in the past = ended)
      const isEnded = challengeRow.status !== 'active'
        || (challengeRow.ends_at && new Date(challengeRow.ends_at).getTime() <= Date.now());
      if (isEnded) {
        return NextResponse.json(
          { error: 'This challenge has ended — participation is closed' },
          { status: 400 }
        );
      }
      // The entry type must match the challenge type (server-enforced)
      if (challengeRow.challenge_type !== content_type) {
        return NextResponse.json(
          {
            error: `This challenge accepts ${challengeRow.challenge_type} entries only`,
            required_type: challengeRow.challenge_type,
          },
          { status: 400 }
        );
      }
      if (resolvedCommunityId && challengeRow.community_id && resolvedCommunityId !== challengeRow.community_id) {
        return NextResponse.json(
          { error: 'Community does not match the challenge' },
          { status: 400 }
        );
      }
      // Community-hosted challenge → entries land in that community context
      if (challengeRow.community_id) {
        resolvedCommunityId = challengeRow.community_id;
      }
      challenge = {
        id: challengeRow.id,
        community_id: challengeRow.community_id,
      };

      // Duplicate participation prevention (DB also enforces unique index)
      const { data: existingParticipation } = await contextClient
        .from('challenge_participants')
        .select('id')
        .eq('challenge_id', challenge_id)
        .eq('user_id', contextUserId)
        .eq('status', 'active')
        .maybeSingle();
      if (existingParticipation) {
        return NextResponse.json(
          { error: 'You already joined this challenge' },
          { status: 409 }
        );
      }
    }

    // ── Community posting: server-side membership validation ──
    if (resolvedCommunityId) {
      const { data: community } = await contextClient
        .from('communities')
        .select('id, visibility, status')
        .eq('id', resolvedCommunityId)
        .single();

      if (!community || community.status !== 'active') {
        return NextResponse.json({ error: 'Community not found' }, { status: 404 });
      }
      if (community.visibility !== 'public') {
        return NextResponse.json(
          { error: 'This community does not allow posting' },
          { status: 403 }
        );
      }

      const { data: membership } = await contextClient
        .from('community_members')
        .select('id')
        .eq('community_id', resolvedCommunityId)
        .eq('user_id', contextUserId)
        .eq('membership_status', 'active')
        .maybeSingle();

      if (!membership) {
        return NextResponse.json(
          { error: 'Join the community before posting' },
          { status: 403 }
        );
      }
    }

    // Get authenticated user (legacy path resolves from the browser client;
    // context posts already resolved a real user above)
    const { data: { user } } = await supabase.auth.getUser();
    const resolvedUserId = contextUserId || user?.id || null;

    // Create the social post — one canonical record. Community/challenge are
    // context only; author ownership, reactions, comments stay unified.
    const postData = {
      content_type,
      content_text: text.trim(),
      media_url: media_url || null,
      metadata: {
        context: context || null,
        visibility: visibility || 'public',
        community_id: resolvedCommunityId || null,
        challenge_id: challenge_id || null,
      },
      user_id: resolvedUserId,
      visibility: visibility || 'public',
      community_id: resolvedCommunityId || null,
      challenge_id: challenge_id || null,
    };

    const { data: post, error: postError } = await contextClient
      .from('social_posts')
      .insert(postData)
      .select()
      .single();

    if (postError) {
      console.error('[Content] Post creation error:', postError);
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }

    // ── Async safety analysis (Master Prompt 11) ───────────────
    // Records rules + optional AI classifications and flag events. Never
    // blocks; AI provider failures are swallowed (safe-fail).
    try {
      const { analyzeContentAsync, recordSafetyEvent } = await import('@/lib/safety');
      analyzeContentAsync({
        targetType: 'social_post',
        targetId: post.id,
        text: text.trim(),
        authorUserId: resolvedUserId,
      });
      recordSafetyEvent({
        eventType: 'content_created',
        actorUserId: resolvedUserId,
        targetType: 'social_post',
        targetId: post.id,
        riskLevel: 'low',
      });
    } catch {}

    // If it's a poll, create the poll record
    let pollData = null;
    if (content_type === 'poll' && options) {
      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert({
          post_id: post.id,
          question: text.trim(),
          options: options.map((opt, i) => ({ index: i, text: opt.trim() })),
        })
        .select()
        .single();

      if (pollError) {
        console.error('[Content] Poll creation error:', pollError);
        // Post was created, but poll failed — still return success
      } else {
        pollData = poll;
      }
    }

    // Creator milestone check: a real post was published (first post,
    // 10 posts, … — recomputed server-side, fire-and-forget).
    if (resolvedUserId && contextClient) {
      pingMilestones(contextClient, resolvedUserId).catch(() => {});
    }

    // Award reputation for content creation
    if (resolvedUserId) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: resolvedUserId,
            event_type: 'content_created',
            source_type: 'social_post',
            source_id: post.id,
          }),
        });
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: resolvedUserId, event_type: 'check_badges' }),
        });
      } catch (e) {
        // Reputation award is non-critical
      }
    }

    // ── Challenge participation: register the real participant row ──
    let participation = null;
    if (challenge) {
      const { data: participant, error: participantError } = await contextClient
        .from('challenge_participants')
        .insert({
          challenge_id: challenge.id,
          user_id: resolvedUserId,
          post_id: post.id,
          status: 'active',
        })
        .select('id')
        .single();

      if (participantError) {
        console.error('[Content] Participation error:', participantError);
        // Race-condition duplicate — remove the just-created orphan post to
        // preserve the invariant (one entry per participant), then 409.
        if (participantError.code === '23505') {
          await contextClient.from('social_posts').delete().eq('id', post.id);
          return NextResponse.json({ error: 'You already joined this challenge' }, { status: 409 });
        }
      } else {
        participation = participant;

        // A pending invitation to this user is now accepted (real acceptance)
        try {
          await contextClient
            .from('challenge_invitations')
            .update({ status: 'accepted' })
            .eq('challenge_id', challenge.id)
            .eq('invitee_id', resolvedUserId)
            .eq('status', 'pending');
        } catch {}

        // Modest, abuse-resistant rep for participation (idempotent per challenge)
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: resolvedUserId,
              event_type: 'challenge_participated',
              source_type: 'challenge',
              source_id: challenge.id,
            }),
          });
        } catch {}

        // Real behavior signal: participating in a challenge is a genuine
        // interest signal (community-linked when the challenge is hosted).
        if (contextClient && contextUserId) {
          recordSignal({
            client: contextClient,
            userId: contextUserId,
            eventType: 'challenge_participated',
            targetType: 'challenge',
            targetId: challenge.id,
            context: {
              community_id: challenge.community_id || null,
              content_type: postData.content_type,
            },
            idempotencyKey: `challenge-${challenge.id}`,
          }).catch(() => {});
        }
      }
    }

    // Growth analytics (non-critical)
    try {
      const events = [];
      if (resolvedCommunityId) {
        events.push({
          eventType: 'community_content_created',
          subjectId: resolvedUserId,
          metadata: { communityId: resolvedCommunityId, postId: post.id },
        });
      }
      if (challenge) {
        events.push({
          eventType: 'challenge_participated',
          subjectId: resolvedUserId,
          metadata: { challengeId: challenge.id, postId: post.id },
        });
      }
      for (const event of events) {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/growth/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
      }
    } catch (e) {}

    return NextResponse.json({
      success: true,
      post: {
        ...post,
        poll: pollData,
      },
      participation,
    });
  } catch (err) {
    console.error('[Content] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
