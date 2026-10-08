import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { isFallbackId, toggleFallbackReaction } from '@/lib/hotSeatFallback';

const VALID_REACTIONS = ['funny', 'savage', 'fatal'];

export async function POST(req, { params }) {
  try {
    const { id: hotSeatId, roastId } = params;
    
    // Rate limit reactions
    const clientIp = getClientIp(req);
    const rlResult = rateLimitMiddleware(
      ipKey(clientIp, 'reaction'),
      RATE_LIMITS.REACTION_CREATE
    );
    
    if (rlResult.blocked) {
      return NextResponse.json(rlResult.response, { status: 429 });
    }

    const body = await req.json();
    const { reaction_type, participant_id } = body;

    // ── Validation ──────────────────────────────────────────
    if (!hotSeatId || !roastId) {
      return NextResponse.json({ error: 'Missing IDs' }, { status: 400 });
    }

    if (!reaction_type || !VALID_REACTIONS.includes(reaction_type)) {
      return NextResponse.json(
        { error: `Invalid reaction type. Must be one of: ${VALID_REACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!participant_id || !participant_id.trim()) {
      return NextResponse.json({ error: 'Participant ID required' }, { status: 400 });
    }

    // Local fallback roasts (tables missing / DB not configured) — toggle in-memory
    if (isFallbackId(roastId)) {
      const result = toggleFallbackReaction(hotSeatId, roastId, participant_id.trim(), reaction_type);
      if (!result) {
        return NextResponse.json({ error: 'Roast not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        action: result.action,
        reaction_type: result.reaction_type,
        counts: result.counts,
        _fallback: true,
      });
    }

    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // ── Verify roast exists and belongs to this hot seat ────
    const { data: roast, error: roastError } = await supabase
      .from('hot_seat_roasts')
      .select('id, hot_seat_id')
      .eq('id', roastId)
      .eq('hot_seat_id', hotSeatId)
      .single();

    if (roastError || !roast) {
      return NextResponse.json({ error: 'Roast not found' }, { status: 404 });
    }

    // ── Check existing active reaction from this participant ─
    const trimmedParticipant = participant_id.trim();
    const { data: existingReaction } = await supabase
      .from('hot_seat_roast_reactions')
      .select('id, reaction_type')
      .eq('roast_id', roastId)
      .eq('participant_id', trimmedParticipant)
      .eq('is_active', true)
      .single();

    // ── Toggle: Same reaction → remove it ───────────────────
    if (existingReaction && existingReaction.reaction_type === reaction_type) {
      const { error: deleteError } = await supabase
        .from('hot_seat_roast_reactions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', existingReaction.id);

      if (deleteError) {
        console.error('[Reaction] Toggle error:', deleteError);
        return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
      }

      // Fetch updated counts
      const counts = await fetchReactionCounts(roastId);
      return NextResponse.json({
        success: true,
        action: 'removed',
        reaction_type: null,
        counts,
      });
    }

    // ── Change: Different reaction → deactivate old, activate new ─
    if (existingReaction && existingReaction.reaction_type !== reaction_type) {
      const { error: updateError } = await supabase
        .from('hot_seat_roast_reactions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', existingReaction.id);

      if (updateError) {
        console.error('[Reaction] Deactivate error:', updateError);
        return NextResponse.json({ error: 'Failed to change reaction' }, { status: 500 });
      }
    }

    // ── Insert new active reaction ──────────────────────────
    const { data: inserted, error: insertError } = await supabase
      .from('hot_seat_roast_reactions')
      .insert([{
        roast_id: roastId,
        participant_id: trimmedParticipant,
        reaction_type,
        is_active: true,
      }])
      .select()
      .single();

    if (insertError) {
      console.error('[Reaction] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
    }

    // Fetch updated counts
    const counts = await fetchReactionCounts(roastId);
    const totalReactions = (counts.funny || 0) + (counts.savage || 0) + (counts.fatal || 0);

    // Fire-and-forget: notify at meaningful reaction milestones
    try {
      const { notifyReactionActivity } = await import('@/lib/notifications');
      notifyReactionActivity(roastId, totalReactions, hotSeatId).catch(() => {});
    } catch {}

    return NextResponse.json({
      success: true,
      action: existingReaction ? 'changed' : 'added',
      reaction_type,
      counts,
    });
  } catch (err) {
    console.error('[Reaction] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Helper: Fetch reaction counts for a roast ────────────────
async function fetchReactionCounts(roastId) {
  try {
    const { data } = await supabase
      .from('hot_seat_roast_reactions')
      .select('reaction_type')
      .eq('roast_id', roastId)
      .eq('is_active', true);

    const counts = { funny: 0, savage: 0, fatal: 0 };
    if (data) {
      for (const r of data) {
        if (counts[r.reaction_type] !== undefined) {
          counts[r.reaction_type]++;
        }
      }
    }
    return counts;
  } catch {
    return { funny: 0, savage: 0, fatal: 0 };
  }
}
