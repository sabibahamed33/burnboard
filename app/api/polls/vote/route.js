import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/polls/vote
 * 
 * Server-side validated poll voting endpoint.
 * 
 * Body:
 *   - poll_id: string (required)
 *   - option_index: number (required)
 *   - participant_id: string (required)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

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
    const { poll_id, option_index, participant_id } = body;

    // Validate required fields
    if (!poll_id || option_index === undefined || !participant_id) {
      return NextResponse.json(
        { error: 'Missing required fields: poll_id, option_index, participant_id' },
        { status: 400 }
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
      // New vote
      await supabase
        .from('poll_votes')
        .insert({
          poll_id,
          participant_id,
          option_index,
        });

      // Increment total votes
      await supabase
        .from('polls')
        .update({ total_votes: (poll.total_votes || 0) + 1 })
        .eq('id', poll_id);
    }

    // Get updated vote counts
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
