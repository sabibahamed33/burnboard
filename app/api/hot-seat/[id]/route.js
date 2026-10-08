import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { cacheAside, CACHE_TTL } from '@/lib/cache';
import { createLogger } from '@/lib/logger';
import { getFallbackSeat, listFallbackRoasts, listFallbackReactions, isFallbackId } from '@/lib/hotSeatFallback';

const log = createLogger('hot-seat-detail');

export async function GET(req, { params }) {
  const start = Date.now();
  
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Missing hot seat ID' }, { status: 400 });
    }

    // Local fallback seats (created while DB tables are missing) — serve directly
    if (isFallbackId(id)) {
      const seat = getFallbackSeat(id);
      if (!seat) {
        return NextResponse.json({ error: 'Hot seat not found' }, { status: 404 });
      }
      const { reactions: reactionCounts } = listFallbackReactions(id, null);
      return NextResponse.json({
        success: true,
        hot_seat: seat,
        roasts: listFallbackRoasts(id),
        reactionCounts,
        _fallback: true,
      });
    }

    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Use cache-aside pattern for hot seat data
    const data = await cacheAside(
      `hotseat:${id}`,
      async () => {
        // Fetch the hot seat
        const { data: hotSeat, error: seatError } = await supabase
          .from('hot_seats')
          .select('*')
          .eq('id', id)
          .neq('status', 'deleted')
          .single();

        if (seatError || !hotSeat) {
          return null;
        }

        // Fetch roasts for this hot seat
        const { data: roasts } = await supabase
          .from('hot_seat_roasts')
          .select('*')
          .eq('hot_seat_id', id)
          .eq('is_hidden', false)
          .order('created_at', { ascending: false })
          .limit(100);

        // Fetch reaction counts for all roasts in one query
        let reactionCounts = {};
        if (roasts && roasts.length > 0) {
          const roastIds = roasts.map(r => r.id);
          const { data: reactions } = await supabase
            .from('hot_seat_roast_reactions')
            .select('roast_id, reaction_type')
            .in('roast_id', roastIds)
            .eq('is_active', true);

          if (reactions) {
            for (const r of reactions) {
              if (!reactionCounts[r.roast_id]) {
                reactionCounts[r.roast_id] = { funny: 0, savage: 0, fatal: 0, total: 0 };
              }
              reactionCounts[r.roast_id][r.reaction_type]++;
              reactionCounts[r.roast_id].total++;
            }
          }
        }

        return {
          hot_seat: hotSeat,
          roasts: roasts || [],
          reactionCounts,
        };
      },
      CACHE_TTL.HOT_SEAT
    );

    if (!data) {
      return NextResponse.json({ error: 'Hot seat not found' }, { status: 404 });
    }

    log.info('Hot seat fetched', {
      hotSeatId: id,
      roastCount: data.roasts.length,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err) {
    log.error('Hot seat fetch error', {
      hotSeatId: params?.id,
      error: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
