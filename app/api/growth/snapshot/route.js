/**
 * BURNBOARD — Growth Snapshot Capture
 *
 * GET /api/growth/snapshot
 *
 * Computes and persists today's growth snapshot (idempotent per date).
 * Called by the daily cleanup cron; also callable on demand. Protected by
 * CRON_SECRET (same convention as other internal endpoints).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { captureDailySnapshot } from '@/lib/growth/analytics';

export async function GET(request) {
  // Fail closed: without CRON_SECRET configured, never compute/persist.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const result = await captureDailySnapshot(supabase);

  return NextResponse.json({
    success: result.captured,
    date: result.date || null,
    error: result.error || null,
    timestamp: new Date().toISOString(),
  });
}