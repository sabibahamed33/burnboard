import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isProfane } from '@/lib/filter';
import { track } from '@/lib/analytics';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { createLogger } from '@/lib/logger';
import { createFallbackSeat, isMissingTableError } from '@/lib/hotSeatFallback';

const log = createLogger('hot-seat-create');

const CATEGORIES = [
  'photo', 'vibe', 'bio', 'outfit', 'idea',
  'dating_profile', 'music_taste', 'hot_take'
];

const HEAT_LEVELS = ['light', 'savage', 'brutal'];

/**
 * Complete a friend challenge after hot seat creation.
 * This closes the viral loop: Challenge → Accept → Create Hot Seat → Completed.
 */
async function completeChallenge(token, hotSeatId) {
  if (!token || !hotSeatId || !isSupabaseConfigured || !supabase) return false;

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const res = await fetch(`${siteUrl}/api/challenge/${token}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hot_seat_id: hotSeatId }),
    });
    return res.ok;
  } catch (err) {
    console.error('[HotSeat] Failed to complete challenge:', err);
    return false;
  }
}

export async function POST(req) {
  const start = Date.now();
  
  try {
    // Rate limit hot seat creation
    const clientIp = getClientIp(req);
    const rlResult = rateLimitMiddleware(
      ipKey(clientIp, 'hs_create'),
      RATE_LIMITS.HOT_SEAT_CREATE
    );
    
    if (rlResult.blocked) {
      log.warn('Rate limit exceeded for hot seat creation', { ip: clientIp.slice(0, 8) + '...' });
      return NextResponse.json(rlResult.response, { status: 429 });
    }

    const body = await req.json();
    const { category, title, context, heat_level, display_name, challenge_token } = body;

    // Validate required fields
    if (!category || !title || !title.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: category and title are required' },
        { status: 400 }
      );
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    if (heat_level && !HEAT_LEVELS.includes(heat_level)) {
      return NextResponse.json(
        { error: `Invalid heat level. Must be one of: ${HEAT_LEVELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Profanity check on title and context
    const titleCheck = isProfane(title);
    if (titleCheck.profane) {
      return NextResponse.json(
        { error: `Title rejected: ${titleCheck.reason || 'Contains prohibited content'}` },
        { status: 422 }
      );
    }

    if (context) {
      const contextCheck = isProfane(context);
      if (contextCheck.profane) {
        return NextResponse.json(
          { error: `Context rejected: ${contextCheck.reason || 'Contains prohibited content'}` },
          { status: 422 }
        );
      }
    }

    // Determine creator_id from session if available
    let creator_id = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader && isSupabaseConfigured && supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) creator_id = user.id;
      } catch {
        // Anonymous creation is fine
      }
    }

    if (isSupabaseConfigured && supabase) {
      const newHotSeat = {
        display_name: (display_name || 'Anonymous').trim().slice(0, 40),
        category,
        title: title.trim().slice(0, 200),
        context: (context || '').trim().slice(0, 500),
        heat_level: heat_level || 'savage',
        status: 'active',
        creator_id,
        roast_count: 0,
        image_url: null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from('hot_seats')
        .insert([newHotSeat])
        .select()
        .single();

      if (insertError) {
        console.error('[HotSeat] Insert error:', insertError);

        // Fresh Supabase project without tables applied yet (PGRST205) —
        // fall back to local in-memory seat so localhost/dev keeps working.
        // Run supabase/bootstrap.sql in the Supabase SQL Editor for persistence.
        if (isMissingTableError(insertError)) {
          log.warn('hot_seats table missing, using local fallback. Run supabase/bootstrap.sql in Supabase SQL Editor.', {
            code: insertError.code,
          });
          const fallback = createFallbackSeat({
            category,
            title,
            context,
            heat_level,
            display_name,
          });
          track('hot_seat_created', {
            hot_seat_id: fallback.id,
            category,
            heat_level: heat_level || 'savage',
            from_challenge: !!challenge_token,
            fallback: true,
          });
          return NextResponse.json({
            success: true,
            hot_seat: {
              ...fallback,
              challenge_completed: !!challenge_token,
            },
            _fallback: true,
            _warning: 'Using temporary local storage.',
          });
        }

        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(
          {
            error: 'Failed to create hot seat',
            ...(isDev ? { details: insertError.message, code: insertError.code } : {}),
          },
          { status: 500 }
        );
      }

      // If this hot seat was created from a challenge, complete the challenge
      if (challenge_token) {
        const completed = await completeChallenge(challenge_token, inserted.id);
        if (completed) {
          track('challenge_completed', {
            challenge_token,
            hot_seat_id: inserted.id,
          });
        }
      }

      track('hot_seat_created', {
        hot_seat_id: inserted.id,
        category,
        heat_level: heat_level || 'savage',
        from_challenge: !!challenge_token,
      });

      return NextResponse.json({
        success: true,
        hot_seat: {
          ...inserted,
          slug: inserted.id, // Use UUID as slug
          share_url: `/hot-seat/${inserted.id}`,
          challenge_completed: !!challenge_token,
        }
      });
    }

    // Dev fallback (Supabase not configured) — store in-memory so detail view works
    const fallback = createFallbackSeat({
      category,
      title,
      context,
      heat_level,
      display_name,
    });
    track('hot_seat_created', {
      hot_seat_id: fallback.id,
      category,
      heat_level: heat_level || 'savage',
      from_challenge: !!challenge_token,
      fallback: true,
    });
    return NextResponse.json({
      success: true,
      hot_seat: {
        ...fallback,
        challenge_completed: !!challenge_token,
      },
      _fallback: true,
    });
  } catch (err) {
    console.error('[HotSeat] Error:', err);
    if (isMissingTableError(err)) {
      return NextResponse.json(
        {
          error: 'Something went wrong. Please try again.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
