import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { track } from '@/lib/analytics';

/**
 * GET /api/battle/[id]
 *
 * Returns a specific matchup with authoritative counts derived from the
 * battle_votes table. Supports ?participant_id for anon viewer resolution.
 * Powers shareable arena links (/battle?battle=ID).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

async function getTopRoasts(supabase, profileId) {
  const { data } = await supabase
    .from('roasts')
    .select('id, roast_text, anon_id, upvotes, reaction_haha, reaction_brutal, reaction_cry, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(2);
  return data || [];
}

export async function GET(req, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { id } = params;
    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get('participant_id');

    const { data: battle, error } = await supabase
      .from('battles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !battle) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    }

    const [profile1Result, profile2Result, votesResult, auth] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', battle.profile1_id).single(),
      supabase.from('profiles').select('*').eq('id', battle.profile2_id).single(),
      supabase.from('battle_votes').select('selection').eq('battle_id', battle.id),
      getRequestContext(req),
    ]);

    if (!profile1Result.data || !profile2Result.data) {
      return NextResponse.json({ error: 'Battle participants unavailable' }, { status: 404 });
    }

    const voteRows = votesResult.data || [];
    const votes1 = voteRows.filter(v => v.selection === 1).length;
    const votes2 = voteRows.filter(v => v.selection === 2).length;

    const [roasts1, roasts2] = await Promise.all([
      getTopRoasts(supabase, battle.profile1_id),
      getTopRoasts(supabase, battle.profile2_id),
    ]);

    const viewerKey = auth.userId || participantId || null;
    let viewerVote = null;
    if (viewerKey) {
      const { data: vote } = await supabase
        .from('battle_votes')
        .select('selection')
        .eq('battle_id', battle.id)
        .eq('voter_key', viewerKey)
        .maybeSingle();
      viewerVote = vote?.selection ?? null;
    }

    track('battle_viewed', { battle_id: battle.id });

    return NextResponse.json({
      battle: {
        id: battle.id,
        profile1_id: battle.profile1_id,
        profile2_id: battle.profile2_id,
        created_at: battle.created_at,
      },
      profile1: profile1Result.data,
      profile2: profile2Result.data,
      roasts1,
      roasts2,
      votes1,
      votes2,
      totalVotes: voteRows.length,
      viewerVote,
    });
  } catch (err) {
    console.error('[Battle Detail] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
