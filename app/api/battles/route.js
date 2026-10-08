import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { instrumentHandler } from '@/lib/metrics';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET /api/battles?status=live|finished&limit=
 *
 * Read-only battles hub feed over the REAL battles + battle_history tables.
 * Battles are profile-vs-profile matchups: no titles, no schedules, no
 * deadlines exist in the schema, so none are invented. Live = is_active,
 * finished = recorded history rows with real winners. Participant
 * resolution is bounded; failures yield empty lists, never fake rows.
 */

async function resolveProfiles(db, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))].slice(0, 60);
  if (!unique.length) return new Map();
  try {
    const { data } = await db
      .from('profiles')
      .select('id, username, avatar_letter, avatar_color')
      .in('id', unique);
    return new Map((data || []).map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

async function getHandler(req) {
  try {
    const anon = getSupabase();
    if (!anon) {
      return NextResponse.json({ battles: [], history: [] });
    }

    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'battles_list'), RATE_LIMITS.API_READ);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || 'live').toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '12', 10) || 12, 30);
    if (!['live', 'finished'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (status === 'finished') {
      let hq = anon
        .from('battle_history')
        .select('id, battle_id, profile1_id, profile2_id, winner_profile_id, total_votes1, total_votes2, round_count, completed_at')
        .order('completed_at', { ascending: false })
        .limit(limit);
      const { data: rows } = await hq;
      const list = rows || [];
      const byId = await resolveProfiles(
        anon,
        list.flatMap((h) => [h.profile1_id, h.profile2_id, h.winner_profile_id])
      );
      const slim = (p) => (p ? { id: p.id, username: p.username } : null);
      return NextResponse.json({
        history: list.map((h) => ({
          id: h.id,
          battle_id: h.battle_id,
          profile1: slim(byId.get(h.profile1_id)),
          profile2: slim(byId.get(h.profile2_id)),
          winner: slim(byId.get(h.winner_profile_id)),
          votes1: h.total_votes1 || 0,
          votes2: h.total_votes2 || 0,
          rounds: h.round_count || 1,
          completedAt: h.completed_at,
        })),
      });
    }

    const { data: rows } = await anon
      .from('battles')
      .select('id, profile1_id, profile2_id, votes1, votes2, is_active, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    const list = rows || [];
    const byId = await resolveProfiles(anon, list.flatMap((b) => [b.profile1_id, b.profile2_id]));
    const slim = (p) => (p ? { id: p.id, username: p.username } : null);
    const battles = list.map((b) => ({
      id: b.id,
      profile1: slim(byId.get(b.profile1_id)),
      profile2: slim(byId.get(b.profile2_id)),
      votes1: b.votes1 || 0,
      votes2: b.votes2 || 0,
      votes: (b.votes1 || 0) + (b.votes2 || 0),
      createdAt: b.created_at,
    }));
    battles.sort((a, b) => b.votes - a.votes);

    return NextResponse.json({ battles });
  } catch (err) {
    return NextResponse.json({ battles: [], history: [] });
  }
}

export const GET = instrumentHandler('battles_list', getHandler);
