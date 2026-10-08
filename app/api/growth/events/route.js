/**
 * BURN BOARD — Growth Events API
 * 
 * Server-side growth funnel event ingestion.
 * Privacy-conscious: no individual profiling.
 * 
 * POST /api/growth/events - Record a growth event
 * GET  /api/growth/events - Get funnel metrics (admin only)
 */

import { NextResponse } from 'next/server';
import { recordGrowthEvent, getFunnelMetrics } from '@/lib/experimentService';
import { checkAdminAccess, adminAccessResponse } from '@/lib/adminGate';

// Valid funnel event types (taxonomy)
const VALID_EVENT_TYPES = [
  // Acquisition
  'landing_viewed',
  'referral_opened',
  'creator_link_opened',
  'challenge_link_opened',
  
  // Understanding
  'primary_cta_viewed',
  'primary_cta_clicked',
  'discovery_opened',
  
  // Activation
  'hot_seat_creation_started',
  'hot_seat_created',
  'first_roast_submitted',
  'first_roast_received',
  
  // Engagement
  'reaction_added',
  'battle_opened',
  'battle_joined',
  'battle_vote_added',
  
  // Viral
  'share_cta_viewed',
  'share_initiated',
  'share_completed',
  'first_share_completed',
  'challenge_created',
  'referral_conversion',
  'referral_activated',
  'invite_created',

  // Search discovery (privacy-aware: scope + counts only, never raw PII)
  'search_performed',
  'search_result_opened',

  // Notification center (aggregated UX signals, no message contents)
  'notification_opened',
  'notification_preference_changed',
  
  // Retention
  'notification_opened',
  'return_visit',
  'leaderboard_viewed',
  'weekly_recap_viewed',
  
  // Communities (Master Prompt 8)
  'community_created',
  'community_viewed',
  'community_joined',
  'community_left',
  'community_feed_viewed',
  'community_content_created',
  'community_search_opened',
  'community_discovered',
  'community_member_viewed',

  // Challenges & Battles (Master Prompt 9)
  'challenge_created',
  'challenge_viewed',
  'challenge_participated',
  'challenge_shared',
  'challenge_invite_sent',
  'challenge_invitation_opened',
  'challenge_hub_viewed',
  'battle_voted',

  // Monetization (Master Prompt 24, Section 87) — the revenue funnel. Only
  // real, server-verified financial events are recorded; amounts are coarse
  // metadata, never sensitive card/bank data. Events are best-effort and
  // never block the payment itself.
  'upgrade_started',   // user tapped upgrade / started checkout
  'payment_started',   // checkout initiated (server-verified pending row)
  'payment_succeeded', // provider event verified → purchase fulfilled
  'payment_failed',    // checkout / payment did not complete
  'subscription_cancelled', // end-of-period cancellation (transparent)
  'tip_sent',          // voluntary creator tip fulfilled
];

export async function POST(request) {
  try {
    const body = await request.json();
    const { eventType, subjectId, metadata } = body;

    if (!eventType) {
      return NextResponse.json(
        { error: 'eventType is required' },
        { status: 400 }
      );
    }

    // Validate event type
    if (!VALID_EVENT_TYPES.includes(eventType)) {
      return NextResponse.json(
        { 
          error: `Invalid event type: ${eventType}`,
          validTypes: VALID_EVENT_TYPES,
        },
        { status: 400 }
      );
    }

    const success = await recordGrowthEvent(eventType, subjectId || null, metadata || {});

    return NextResponse.json({
      success,
      eventType,
    });

  } catch (error) {
    console.error('[Growth Events API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  // Funnel aggregates are admin-only (MP26): the POST side stays open for
  // server-side event recording; reading the whole funnel is privileged.
  const access = checkAdminAccess(request);
  if (!access.ok) return adminAccessResponse(access);

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const result = await getFunnelMetrics({ days: Math.min(days, 365) });

    if (!result.data) {
      return NextResponse.json({
        funnel: [],
        period: `Last ${days} days`,
        totalEvents: 0,
      });
    }

    return NextResponse.json(result.data);

  } catch (error) {
    console.error('[Growth Events API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
