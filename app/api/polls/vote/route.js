import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, ipKey, RATE_LIMITS, getClientIp } from '@/lib/serverRateLimit';

/**
 * POST /api/polls/vote
 *
 * Server-side validated poll voting endpoint. One vote per identity per
 * poll (switchable); the unique(poll_id, participant_id) constraint is the
 * atomic backstop for concurrent duplicates, and per-identity + per-IP rate
 * limits stop floods before they reach the database.
 *
 * Body:
 *   - poll_id: string (required)
 *   - option_index: number (required)
 *   - participant_id: string (required)
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

export async function POST(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const body = await req.json();
    const { poll_id, option_index } = body;
    const participant_id = typeof body?.participant_id === 'string' ? body.participant_id.trim() : '';

    // Validate required fields
    if (!poll_id || option_index === undefined || !participant_id) {
      return NextResponse.json(
        { error: 'Missing required fields: poll_id, option_index, participant_id' },
        { status: 400 }
      );
    }

    // Participant identity must be plausible (anon `anon_*` ids or UUIDs are
    // tens of chars; junk/garbage ids are rejected before touching the DB).
    if (participant_id.length < 6 || participant_id.length > 120) {
      return NextResponse.json({ error: 'Invalid participant_id' }, { status: 400 });
    }

    // Rate limit voting per identity AND per hashed IP (sliding window).
    // Limits are generic counts — never internal thresholds in responses
    // beyond the retry guidance clients need.
    const ipGate = checkRateLimit(ipKey(hashIp(getClientIp(req)), 'poll_vote_ip'), RATE_LIMITS.POLL_VOTE);
    const idGate = checkRateLimit(ipKey(participant_id, 'poll_vote'), RATE_LIMITS.POLL_VOTE);
    const gated = !ipGate.allowed ? ipGate : (!idGate.allowed ? idGate : null);
    if (gated) {
      const retryAfterSeconds = Math.ceil((gated.retryAfterMs || 0) / 1000);
      return NextResponse.json(
        { error: `Please wait before voting again. Try again in ${retryAfterSeconds} seconds.`, retryAfter: retryAfterSeconds },
        { status: 429 }
      );
    }

    // Validate option_index
    if (typeof option_index !== 'number' || option_index < 0) {
      return NextResponse.json(
        { error: 'Invalid option_index' },
        { status: 400 }
      );
    }

    // Verify poll exists
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .select('id, options, total_votes')
      .eq('id', poll_id)
      .single();

    if (pollError || !poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
    }

    // Validate option_index is within range
    if (option_index >= poll.options.length) {
      return NextResponse.json(
        { error: `Invalid option_index. Must be 0-${poll.options.length - 1}` },
        { status: 400 }
      );
    }

    // Check if participant already voted
    const { data: existingVote } = await supabase
      .from('poll_votes')
      .select('id, option_index')
      .eq('poll_id', poll_id)
      .eq('participant_id', participant_id)
      .single();

    if (existingVote) {
      // Already voted with same option — no-op
      if (existingVote.option_index === option_index) {
        return NextResponse.json({
          success: true,
          action: 'already_voted',
          option_index,
        });
      }

      // Switch vote to new option
      await supabase
        .from('poll_votes')
        .update({ option_index })
        .eq('id', existingVote.id);
    } else {
      // New vote. The unique(poll_id, participant_id) constraint is the
      // atomic backstop: a concurrent duplicate insert fails with 23505 and
      // is reported honestly as already-voted instead of double-counting.
      const { error: insertError } = await supabase
        .from('poll_votes')
        .insert({
          poll_id,
          participant_id,
          option_index,
        });

      if (insertError) {
        // Lost a concurrent race — re-read the winner's row and answer
        // truthfully. Never increment the counter on a failed insert.
        if (insertError.code === '23505' || /duplicate|unique/i.test(insertError.message || '')) {
          const { data: raced } = await supabase
            .from('poll_votes')
            .select('id, option_index')
            .eq('poll_id', poll_id)
            .eq('participant_id', participant_id)
            .maybeSingle();
          return NextResponse.json({
            success: true,
            action: raced && raced.option_index === option_index ? 'already_voted' : 'added',
            option_index: raced ? raced.option_index : option_index,
          });
        }
        console.error('[Polls] Vote insert error:', insertError.message);
        return NextResponse.json({ error: 'Could not record vote. Please try again.' }, { status: 500 });
      }
    }

    // Get updated vote counts (derived from real rows — the source of truth)
    const { data: votes } = await supabase
      .from('poll_votes')
      .select('option_index')
      .eq('poll_id', poll_id);

    // Calculate results
    const results = poll.options.map((opt, i) => ({
      index: i,
      text: opt.text,
      votes: (votes || []).filter(v => v.option_index === i).length,
    }));

    const totalVotes = (votes || []).length;
    results.forEach(r => {
      r.percentage = totalVotes > 0 ? Math.round((r.votes / totalVotes) * 100) : 0;
    });

    // Self-healing counter: the denormalized total is reconciled to the real
    // row count instead of a racy read-modify-write increment, so past drift
    // (e.g. from failed inserts) converges back to truth. Best-effort.
    try {
      if (totalVotes !== (poll.total_votes || 0)) {
        await supabase.from('polls').update({ total_votes: totalVotes }).eq('id', poll_id);
      }
    } catch {}

    return NextResponse.json({
      success: true,
      action: existingVote ? 'switched' : 'added',
      option_index,
      results,
      total_votes: totalVotes,
    });
  } catch (err) {
    console.error('[Polls] Vote error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
