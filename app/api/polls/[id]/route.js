import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/polls/[id]
 * 
 * Get poll results and check if participant has voted.
 * 
 * Query params:
 *   - participant_id: string (optional, to check if voted)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
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

    // Get poll
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .select('*')
      .eq('id', id)
      .single();

    if (pollError || !poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
    }

    // Get all votes
    const { data: votes } = await supabase
      .from('poll_votes')
      .select('option_index')
      .eq('poll_id', id);

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

    // Check if participant voted
    let participantVote = null;
    if (participantId) {
      const { data: vote } = await supabase
        .from('poll_votes')
        .select('option_index')
        .eq('poll_id', id)
        .eq('participant_id', participantId)
        .single();
      participantVote = vote?.option_index ?? null;
    }

    return NextResponse.json({
      poll: {
        id: poll.id,
        question: poll.question,
        options: poll.options,
        total_votes: totalVotes,
        closes_at: poll.closes_at,
      },
      results,
      participant_vote: participantVote,
    });
  } catch (err) {
    console.error('[Polls] Get error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
