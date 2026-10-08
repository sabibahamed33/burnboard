import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { checkRateLimit, ipKey, RATE_LIMITS, getClientIp } from '@/lib/serverRateLimit';

/**
 * POST /api/battle/[id]/vote
 *
 * Server-controlled arena voting.
 *
 * Body:
 *   - selection: 1 | 2 (required)
 *   - participant_id: anon identity used when no signed-in session exists
 *
 * Policy (clearly communicated): one vote per identity per matchup; votes
 * may be switched while the matchup is open. All writes go through the
 * cast_battle_vote RPC — the client can never control totals, and there is
 * no direct table write path for votes.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

const IP_SALT = process.env.RATE_LIMIT_SALT || 'burnboard_secret_salt_2024';

function hashIp(ip) {
  return crypto.createHash('sha256').update((ip || '127.0.0.1') + IP_SALT).digest('hex').substring(0, 16);
}

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { id } = params;
    const body = await req.json();
    const { selection, participant_id } = body;

    const auth = await getRequestContext(req);
    const voterKey = auth.userId || (typeof participant_id === 'string' ? participant_id.trim() : '');

    if (!voterKey) {
      return NextResponse.json(
        { error: 'Missing voter identity — sign in or retry' },
        { status: 400 }
      );
    }

    if (typeof voterKey === 'string' && voterKey.length < 6) {
      return NextResponse.json({ error: 'Invalid voter identity' }, { status: 400 });
    }

    if (selection !== 1 && selection !== 2) {
      return NextResponse.json(
        { error: 'selection must be 1 or 2' },
        { status: 400 }
      );
    }

    // Rate limit voting per identity AND per IP (sliding window, server-side)
    const ip = ipKey(getClientIp(req), 'battle_vote_ip');
    const voter = ipKey(voterKey, 'battle_vote');
    const [ipCheck, voterCheck] = [
      checkRateLimit(ip, RATE_LIMITS.BATTLE_VOTE),
      checkRateLimit(voter, RATE_LIMITS.BATTLE_VOTE),
    ];
    if (!ipCheck.allowed || !voterCheck.allowed) {
      return NextResponse.json({ error: 'Too many votes — slow down' }, { status: 429 });
    }

    const { data, error } = await supabase.rpc('cast_battle_vote', {
      p_battle_id: id,
      p_voter_key: voterKey,
      p_selection: selection,
      p_user_id: auth.userId || null,
      // Network-identity binding for abuse analysis (salted hash only —
      // never the raw IP, never exposed publicly).
      p_ip_hash: hashIp(getClientIp(req)),
    });

    if (error) {
      console.error('[Battle Vote] RPC error:', error);
      return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || !result.success) {
      return NextResponse.json({ error: result?.message || 'Vote rejected' }, { status: 400 });
    }

    const votes1 = Number(result.votes1) || 0;
    const votes2 = Number(result.votes2) || 0;

    return NextResponse.json({
      success: true,
      action: result.action, // 'added' | 'switched'
      votes1,
      votes2,
      totalVotes: votes1 + votes2,
      viewerVote: selection,
    });
  } catch (err) {
    console.error('[Battle Vote] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
