import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { recordSignal, resolveContentContext } from '@/lib/reco/signals';
import { pingMilestones } from '@/lib/creator/milestones';

/**
 * POST /api/reactions
 * 
 * Unified reaction endpoint supporting all content types and 7 reaction types.
 * 
 * Body:
 *   - target_type: 'roast' | 'social_post' | 'comment' (required)
 *   - target_id: string (required)
 *   - reaction_type: 'burn' | 'dead' | 'finished' | 'brutal' | 'wild' | 'respect' | 'hmm' (required)
 *   - participant_id: string (required)
 * 
 * GET /api/reactions?target_type=roast&target_id=xxx
 *   - Get reaction counts for a target
 *   - Get participant's reaction if participant_id provided
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

const VALID_REACTIONS = ['burn', 'dead', 'finished', 'brutal', 'wild', 'respect', 'hmm'];
const VALID_TARGET_TYPES = ['roast', 'social_post', 'comment'];

export async function GET(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ counts: {}, participantReaction: null });
    }

    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get('target_type');
    const targetId = searchParams.get('target_id');
    const participantId = searchParams.get('participant_id');

    if (!targetType || !targetId) {
      return NextResponse.json({ error: 'Missing target_type or target_id' }, { status: 400 });
    }

    // Get all reactions for this target
    const { data: reactions } = await supabase
      .from('reactions')
      .select('reaction_type')
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    // Count by type
    const counts = {};
    for (const type of VALID_REACTIONS) {
      counts[type] = 0;
    }
    for (const r of reactions || []) {
      if (counts[r.reaction_type] !== undefined) {
        counts[r.reaction_type]++;
      }
    }
    counts.total = (reactions || []).length;

    // Get participant's reaction
    let participantReaction = null;
    if (participantId) {
      const { data: pr } = await supabase
        .from('reactions')
        .select('reaction_type')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('participant_id', participantId)
        .single();
      participantReaction = pr?.reaction_type || null;
    }

    return NextResponse.json({ counts, participantReaction });
  } catch (err) {
    console.error('[Reactions] GET Error:', err);
    return NextResponse.json({ counts: {}, participantReaction: null });
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Resolve the signed-in viewer (used only for legitimate personalization
    // signals; anonymous participants simply produce no signals).
    let sessionClient = null;
    let sessionUserId = null;
    try {
      const session = await getRequestContext(req);
      sessionClient = session.client;
      sessionUserId = session.userId;
    } catch {}

    const body = await req.json();
    const { target_type, target_id, reaction_type, participant_id } = body;

    // Validate required fields
    if (!target_type || !target_id || !reaction_type || !participant_id) {
      return NextResponse.json(
        { error: 'Missing required fields: target_type, target_id, reaction_type, participant_id' },
        { status: 400 }
      );
    }

    // Validate types
    if (!VALID_TARGET_TYPES.includes(target_type)) {
      return NextResponse.json(
        { error: `Invalid target_type. Must be one of: ${VALID_TARGET_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!VALID_REACTIONS.includes(reaction_type)) {
      return NextResponse.json(
        { error: `Invalid reaction_type. Must be one of: ${VALID_REACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    if (typeof participant_id !== 'string' || participant_id.length < 10) {
      return NextResponse.json({ error: 'Invalid participant_id' }, { status: 400 });
    }

    // Check for existing reaction from this participant on this target
    const { data: existing } = await supabase
      .from('reactions')
      .select('id, reaction_type')
      .eq('target_type', target_type)
      .eq('target_id', target_id)
      .eq('participant_id', participant_id)
      .single();

    let action = 'added';
    let newReactionType = reaction_type;

    if (existing) {
      if (existing.reaction_type === reaction_type) {
        // Toggle off: remove reaction
        await supabase.from('reactions').delete().eq('id', existing.id);
        action = 'removed';
        newReactionType = null;
      } else {
        // Switch reaction type
        await supabase
          .from('reactions')
          .update({ reaction_type })
          .eq('id', existing.id);
        action = 'switched';
      }
    } else {
      // New reaction
      await supabase.from('reactions').insert({
        target_type,
        target_id,
        participant_id,
        reaction_type,
      });

      // Award reputation for reacting (non-critical)
      try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reputation/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id,
            event_type: 'reaction',
            source_type: target_type,
            source_id: target_id,
          }),
        });
      } catch (e) {}
    }

    // Real behavior signal: a genuine reaction was created/switched by the
    // authenticated user → positive content signal (fire-and-forget).
    if (action !== 'removed' && sessionClient && sessionUserId
        && (target_type === 'roast' || target_type === 'social_post')) {
      (async () => {
        try {
          const meta = await resolveContentContext(sessionClient, target_type, target_id);
          await recordSignal({
            client: sessionClient,
            userId: sessionUserId,
            eventType: 'content_reacted',
            targetType: target_type,
            targetId: target_id,
            context: { ...(meta || {}) },
            idempotencyKey: `react-${target_type}-${target_id}`,
          });

          // Creator milestone check: the author received a real reaction.
          if (meta?.author_id) {
            await pingMilestones(sessionClient, meta.author_id);
          }
        } catch {}
      })();
    }

    // Fetch updated counts
    const { data: allReactions } = await supabase
      .from('reactions')
      .select('reaction_type')
      .eq('target_type', target_type)
      .eq('target_id', target_id);

    const counts = {};
    for (const type of VALID_REACTIONS) {
      counts[type] = 0;
    }
    for (const r of allReactions || []) {
      if (counts[r.reaction_type] !== undefined) {
        counts[r.reaction_type]++;
      }
    }
    counts.total = (allReactions || []).length;

    return NextResponse.json({
      success: true,
      action,
      reaction_type: newReactionType,
      counts,
    });
  } catch (err) {
    console.error('[Reactions] POST Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
