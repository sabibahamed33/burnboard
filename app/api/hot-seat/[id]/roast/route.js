import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isProfane } from '@/lib/filter';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { createLogger } from '@/lib/logger';
import { getFallbackSeat, createFallbackRoast, isFallbackId, isMissingTableError } from '@/lib/hotSeatFallback';

const log = createLogger('hot-seat-roast');

const SALT = process.env.RATE_LIMIT_SALT || 'burnboard_secret_salt_2024';

function hashIp(ip) {
  return crypto.createHash('sha256').update((ip || '127.0.0.1') + SALT).digest('hex').substring(0, 16);
}

export async function POST(req, { params }) {
  const start = Date.now();
  
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json({ error: 'Missing hot seat ID' }, { status: 400 });
    }

    // Server-side rate limiting
    const clientIp = getClientIp(req);
    const rlResult = rateLimitMiddleware(
      ipKey(clientIp, 'roast'),
      RATE_LIMITS.ROAST_CREATE
    );
    
    if (rlResult.blocked) {
      log.warn('Rate limit exceeded', { ip: clientIp.slice(0, 8) + '...', hotSeatId: id });
      return NextResponse.json(rlResult.response, { status: 429 });
    }

    const body = await req.json();
    const { roast_text, anon_id } = body;

    if (!roast_text || !roast_text.trim()) {
      return NextResponse.json({ error: 'Roast text is required' }, { status: 400 });
    }

    if (roast_text.trim().length > 280) {
      return NextResponse.json({ error: 'Roast must be 280 characters or fewer' }, { status: 400 });
    }

    // IP hash for rate limiting and duplicate detection
    const ip_hash = hashIp(clientIp);

    // Profanity check
    const profanityCheck = isProfane(roast_text);
    if (profanityCheck.profane) {
      return NextResponse.json(
        { error: `Roast rejected: ${profanityCheck.reason || 'Contains prohibited content'}` },
        { status: 422 }
      );
    }

    // Local fallback seats (DB missing or not configured) — store roast in-memory.
    // This must run before the DB branches so fallback seats never depend on
    // Supabase being set up. A fallback ID that is unknown here means the seat
    // is gone (e.g. dev server restarted) — 404 instead of a confusing 503.
    if (isFallbackId(id)) {
      if (getFallbackSeat(id)) {
        const roast = createFallbackRoast(id, { roast_text, anon_id });
        if (!roast) {
          return NextResponse.json({ error: 'Hot seat not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, roast, _fallback: true });
      }
      return NextResponse.json({ error: 'Hot seat not found' }, { status: 404 });
    }

    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Verify hot seat exists and is active
    const { data: hotSeat, error: seatError } = await supabase
      .from('hot_seats')
      .select('id, status')
      .eq('id', id)
      .single();

    if (seatError || !hotSeat) {
      if (isMissingTableError(seatError)) {
        return NextResponse.json(
          { error: 'Something went wrong. Please try again.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: 'Hot seat not found' }, { status: 404 });
    }

    if (hotSeat.status !== 'active') {
      return NextResponse.json({ error: 'This hot seat is no longer accepting roasts' }, { status: 410 });
    }

    // Check blocked IPs
    const { data: blocked } = await supabase
      .from('blocked_ips')
      .select('ip_hash')
      .eq('ip_hash', ip_hash)
      .single();

    if (blocked) {
      return NextResponse.json(
        { error: 'Your access has been restricted' },
        { status: 403 }
      );
    }

    // Rate limit: 5 roasts per 10 minutes from same IP
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentRoasts } = await supabase
      .from('hot_seat_roasts')
      .select('id')
      .eq('ip_hash', ip_hash)
      .gte('created_at', tenMinutesAgo);

    if (recentRoasts && recentRoasts.length >= 5) {
      return NextResponse.json(
        { error: 'Spam limit reached: Maximum 5 roasts per 10 minutes' },
        { status: 429 }
      );
    }

    // Check duplicate roast for same hot seat in last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: duplicates } = await supabase
      .from('hot_seat_roasts')
      .select('roast_text')
      .eq('hot_seat_id', id)
      .gte('created_at', oneHourAgo);

    const isDuplicate = duplicates?.some(
      r => r.roast_text.trim().toLowerCase() === roast_text.trim().toLowerCase()
    );

    if (isDuplicate) {
      return NextResponse.json(
        { error: 'Already roasted with this line — be more creative!' },
        { status: 409 }
      );
    }

    // Insert roast
    const newRoast = {
      hot_seat_id: id,
      roast_text: roast_text.trim(),
      anon_id: anon_id || 'Anonymous Roaster',
      ip_hash,
      is_hidden: false,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('hot_seat_roasts')
      .insert([newRoast])
      .select()
      .single();

    if (insertError) {
      console.error('[HotSeat Roast] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to submit roast' }, { status: 500 });
    }

    // Fire-and-forget: increment roast count (non-blocking)
    supabase
      .from('hot_seats')
      .update({ roast_count: (hotSeat.roast_count || 0) + 1 })
      .eq('id', id)
      .then(() => {}) // fire-and-forget
      .catch(() => {});    // Fire-and-forget: notify hot seat creator about new roast
    try {
      const { notifyNewRoast } = await import('@/lib/notifications');
      notifyNewRoast(id, inserted.id).catch(() => {});
    } catch {}

    log.info('Roast submitted', {
      hotSeatId: id,
      roastId: inserted.id,
      durationMs: Date.now() - start,
    });

    return NextResponse.json({ success: true, roast: inserted });
  } catch (err) {
    log.error('Roast submission error', {
      hotSeatId: id,
      error: err.message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
