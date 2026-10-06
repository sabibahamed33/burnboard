import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';

/**
 * POST /api/comments/react
 * 
 * React to a comment.
 * 
 * Body:
 *   - comment_id: string (required)
 *   - reaction_type: 'burn' | 'dead' | 'finished' | 'brutal' | 'wild' | 'respect' | 'hmm' (required)
 *   - participant_id: string (required)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

const VALID_REACTIONS = ['burn', 'dead', 'finished', 'brutal', 'wild', 'respect', 'hmm'];

export async function POST(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Layered rate limit: per-IP + per-participant (anti-reaction-spam).
    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'comment_react_ip'), RATE_LIMITS.COMMENT_REACT);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error, retryAfter: ipLimit.retryAfterSeconds }, { status: 429 });
    }

    const body = await req.json();
    const { comment_id, reaction_type, participant_id } = body;

    if (participant_id) {
      const userLimit = rateLimitMiddleware(ipKey(participant_id, 'comment_react_user'), RATE_LIMITS.COMMENT_REACT);
      if (userLimit.blocked) {
        return NextResponse.json({ error: userLimit.response.error, retryAfter: userLimit.retryAfterSeconds }, { status: 429 });
      }
    }

    if (!comment_id || !reaction_type || !participant_id) {
      return NextResponse.json(
        { error: 'Missing required fields: comment_id, reaction_type, participant_id' },
        { status: 400 }
      );
    }

    if (!VALID_REACTIONS.includes(reaction_type)) {
      return NextResponse.json(
        { error: `Invalid reaction_type. Must be one of: ${VALID_REACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Check existing reaction
    const { data: existing } = await supabase
      .from('comment_reactions')
      .select('id, reaction_type')
      .eq('comment_id', comment_id)
      .eq('participant_id', participant_id)
      .single();

    let action = 'added';
    let newReactionType = reaction_type;

    if (existing) {
      if (existing.reaction_type === reaction_type) {
        // Toggle off
        await supabase.from('comment_reactions').delete().eq('id', existing.id);
        action = 'removed';
        newReactionType = null;
      } else {
        // Switch
        await supabase
          .from('comment_reactions')
          .update({ reaction_type })
          .eq('id', existing.id);
        action = 'switched';
      }
    } else {
      // New reaction
      await supabase.from('comment_reactions').insert({
        comment_id,
        participant_id,
        reaction_type,
      });
    }

    // Get updated counts
    const { data: allReactions } = await supabase
      .from('comment_reactions')
      .select('reaction_type')
      .eq('comment_id', comment_id);

    const counts = {};
    for (const type of VALID_REACTIONS) {
      counts[type] = 0;
    }
    for (const r of allReactions || []) {
      if (counts[r.reaction_type] !== undefined) {
        counts[r.reaction_type]++;
      }
    }
    counts.total = (allReactions || []).length;

    return NextResponse.json({
      success: true,
      action,
      reaction_type: newReactionType,
      counts,
    });
  } catch (err) {
    console.error('[Comment Reactions] POST Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
