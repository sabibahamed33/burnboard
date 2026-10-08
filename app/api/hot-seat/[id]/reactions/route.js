import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { isFallbackId, getFallbackSeat, listFallbackReactions } from '@/lib/hotSeatFallback';

export async function GET(req, { params }) {
  try {
    const { id } = params;
    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get('participant_id') || '';

    if (!id) {
      return NextResponse.json({ error: 'Missing hot seat ID' }, { status: 400 });
    }

    // Local fallback seats (tables missing / DB not configured) — read in-memory
    if (isFallbackId(id)) {
      if (!getFallbackSeat(id)) {
        return NextResponse.json({ error: 'Hot seat not found' }, { status: 404 });
      }
      const { reactions, participantReactions } = listFallbackReactions(id, participantId);
      return NextResponse.json({ success: true, reactions, participantReactions, _fallback: true });
    }

    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Fetch all active reactions for roasts in this hot seat
    // First get roast IDs for this hot seat
    const { data: roastIds } = await supabase
      .from('hot_seat_roasts')
      .select('id')
      .eq('hot_seat_id', id)
      .eq('is_hidden', false);

    if (!roastIds || roastIds.length === 0) {
      return NextResponse.json({ success: true, reactions: {}, participantReactions: {} });
    }

    const ids = roastIds.map(r => r.id);

    // Fetch all active reactions
    const { data: reactions } = await supabase
      .from('hot_seat_roast_reactions')
      .select('roast_id, reaction_type, participant_id')
      .in('roast_id', ids)
      .eq('is_active', true);

    // Build counts per roast
    const reactionCounts = {};
    const participantReactions = {};

    if (reactions) {
      for (const r of reactions) {
        // Count totals
        if (!reactionCounts[r.roast_id]) {
          reactionCounts[r.roast_id] = { funny: 0, savage: 0, fatal: 0, total: 0 };
        }
        reactionCounts[r.roast_id][r.reaction_type]++;
        reactionCounts[r.roast_id].total++;

        // Track participant's own reactions
        if (participantId && r.participant_id === participantId) {
          participantReactions[r.roast_id] = r.reaction_type;
        }
      }
    }

    return NextResponse.json({
      success: true,
      reactions: reactionCounts,
      participantReactions,
    });
  } catch (err) {
    console.error('[Reactions] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
