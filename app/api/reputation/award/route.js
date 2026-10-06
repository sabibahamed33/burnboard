import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAndAwardBadges } from '@/lib/reputation/badges';
import { recordDailyActivity, isStreakQualifyingEvent } from '@/lib/reputation/streaks';

/**
 * POST /api/reputation/award
 * 
 * Award Burn Rep for an action.
 * 
 * Body:
 *   - event_type: string (required)
 *   - user_id: string (optional if participant_id provided)
 *   - participant_id: string (optional if user_id provided)
 *   - source_type: string (optional)
 *   - source_id: string (optional)
 *   - metadata: object (optional)
 * 
 * Event types:
 *   - content_created: +10 rep
 *   - content_received_engagement: +2 rep
 *   - comment_created: +5 rep
 *   - comment_received_engagement: +1 rep
 *   - reaction: +1 rep
 *   - follow: +2 rep
 *   - daily_participation: +5 rep
 *   - check_badges: Check and award badges
 */

const REP_VALUES = {
  content_created: 10,
  content_received_engagement: 2,
  comment_created: 5,
  comment_received_engagement: 1,
  reaction: 1,
  follow: 2,
  daily_participation: 5,
  // Communities (Master Prompt 8)
  community_created: 5,
  community_joined: 2,
  // Challenges (Master Prompt 9) — modest participation reward only
  challenge_participated: 3,
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl) return null;
  const key = serviceRoleKey || supabaseKey;
  if (!key) return null;
  return createClient(supabaseUrl, key);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { event_type, user_id, participant_id, source_type, source_id, metadata } = body;

    // Handle badge check requests
    if (event_type === 'check_badges') {
      const uid = user_id || participant_id;
      if (!uid) {
        return NextResponse.json({ error: 'Missing user identifier' }, { status: 400 });
      }
      const newBadges = await checkAndAwardBadges(uid);
      return NextResponse.json({ new_badges: newBadges });
    }

    const resolvedUserId = user_id || participant_id;
    if (!resolvedUserId) {
      return NextResponse.json({ error: 'Missing user_id or participant_id' }, { status: 400 });
    }

    if (!event_type) {
      return NextResponse.json({ error: 'Missing event_type' }, { status: 400 });
    }

    const repValue = REP_VALUES[event_type];
    if (repValue === undefined) {
      return NextResponse.json({ error: `Unknown event_type: ${event_type}` }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Check for duplicate event (idempotency) using the unique constraint
    if (source_id) {
      const { data: existing } = await supabase
        .from('reputation_events')
        .select('id')
        .eq('user_id', resolvedUserId)
        .eq('event_type', event_type)
        .eq('reference_id', source_id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ already_awarded: true });
      }
    }

    // Record reputation event (using the reputation_events table schema)
    const { error: eventError } = await supabase
      .from('reputation_events')
      .insert({
        user_id: resolvedUserId,
        event_type,
        points: repValue,
        reference_id: source_id || null,
        metadata: {
          source_type: source_type || null,
          ...metadata,
        },
      });

    if (eventError) {
      console.error('[Rep Award] Event insert error:', eventError);
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
    }

    // Update user's total reputation
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('reputation')
      .eq('user_id', resolvedUserId)
      .single();

    if (profile) {
      const newRep = (profile.reputation || 0) + repValue;
      const level = calculateLevel(newRep);

      await supabase
        .from('user_profiles')
        .update({ reputation: newRep, level })
        .eq('user_id', resolvedUserId);

      // Update streak if qualifying event
      if (isStreakQualifyingEvent(event_type)) {
        await recordDailyActivity(resolvedUserId);
      }

      return NextResponse.json({
        success: true,
        rep_awarded: repValue,
        event_type,
        new_total: newRep,
      });
    }

    return NextResponse.json({ success: true, rep_awarded: repValue });
  } catch (err) {
    console.error('[Rep Award] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function calculateLevel(reputation) {
  if (reputation >= 15000) return 'Legend';
  if (reputation >= 5000) return 'Supernova';
  if (reputation >= 1500) return 'Inferno';
  if (reputation >= 500) return 'Blaze';
  if (reputation >= 200) return 'Flame';
  if (reputation >= 50) return 'Ember';
  return 'Spark';
}
