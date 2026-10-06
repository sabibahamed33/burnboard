import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { checkRateLimit, ipKey, RATE_LIMITS, getClientIp } from '@/lib/serverRateLimit';
import { track } from '@/lib/analytics';

/**
 * GET /api/battle/random
 *
 * Server-driven random Roast Arena matchup.
 * Picks two eligible real profiles (with actual roasts), finds or creates
 * the battle row, and returns authoritative vote counts derived from the
 * battle_votes table — never client-maintained counters.
 *
 * Query params:
 *   - participant_id: anon identity (used to resolve the viewer's vote)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getTopRoasts(supabase, profileId) {
  // RLS hides moderated roasts for the anon key — only real visible burns surface.
  const { data } = await supabase
    .from('roasts')
    .select('id, roast_text, anon_id, upvotes, reaction_haha, reaction_brutal, reaction_cry, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(2);
  return data || [];
}

async function findOrCreateBattle(supabase, p1, p2) {
  // Reuse an existing matchup if one exists (either order)
  const { data: existing } = await supabase
    .from('battles')
    .select('id, created_at')
    .or(`and(profile1_id.eq.${p1},profile2_id.eq.${p2}),and(profile1_id.eq.${p2},profile2_id.eq.${p1})`)
    .limit(1);

  if (existing && existing.length > 0) return existing[0];

  const { data: created } = await supabase
    .from('battles')
    .insert({ profile1_id: p1, profile2_id: p2, votes1: 0, votes2: 0 })
    .select('id, created_at')
    .single();
  return created || null;
}

async function getAuthoritativeCounts(supabase, battleId) {
  const { data: votes } = await supabase
    .from('battle_votes')
    .select('selection')
    .eq('battle_id', battleId);
  const rows = votes || [];
  const votes1 = rows.filter(v => v.selection === 1).length;
  const votes2 = rows.filter(v => v.selection === 2).length;
  return { votes1, votes2, totalVotes: rows.length };
}

export async function GET(req) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get('participant_id');

    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Read rate limiting (light) to stop arena scraping
    const rl = checkRateLimit(ipKey(getClientIp(req), 'battle_random'), RATE_LIMITS.API_READ);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Pick fighters from real profiles that actually have burns
    const { data: candidates } = await supabase
      .from('profiles')
      .select('*')
      .gt('roast_count', 0)
      .order('created_at', { ascending: false })
      .limit(150);

    const pool = shuffle(candidates || []);
    if (pool.length < 2) {
      return NextResponse.json({ empty: true, reason: 'not-enough-fighters', battle: null });
    }

    const profile1 = pool[0];
    const profile2 = pool[1];

    const battle = await findOrCreateBattle(supabase, profile1.id, profile2.id);
    if (!battle) {
      return NextResponse.json({ error: 'Failed to create battle' }, { status: 500 });
    }

    const [roasts1, roasts2, counts, auth] = await Promise.all([
      getTopRoasts(supabase, profile1.id),
      getTopRoasts(supabase, profile2.id),
      getAuthoritativeCounts(supabase, battle.id),
      getRequestContext(req),
    ]);

    // Resolve viewer vote (signed-in uid first, else anon participant id)
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

    track('battle_opened', { battle_id: battle.id, random: true });

    return NextResponse.json({
      empty: false,
      battle: {
        id: battle.id,
        created_at: battle.created_at,
      },
      profile1,
      profile2,
      roasts1,
      roasts2,
      votes1: counts.votes1,
      votes2: counts.votes2,
      totalVotes: counts.totalVotes,
      viewerVote,
    });
  } catch (err) {
    console.error('[Battle Random] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
