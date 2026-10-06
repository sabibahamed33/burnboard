/**
 * BURNBOARD — AI Background Worker Cron
 *
 * Processes the ai_jobs queue (content classification, embeddings, quality
 * scoring) through lib/ai/worker.js. Runs from the daily cleanup cron by
 * default (respects Vercel Hobby cron limits); this route exists so it can
 * be scheduled independently when the plan allows more crons.
 *
 * GET /api/cron/ai?batch=50
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processAiJobs } from '@/lib/ai/worker';

export async function GET(request) {
  // Fail closed: without CRON_SECRET configured, never run queue processing.
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

  const { searchParams } = new URL(request.url);
  const batch = Math.min(parseInt(searchParams.get('batch') || '50', 10) || 50, 200);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const result = await processAiJobs(supabase, { batchSize: batch });

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...result,
  });
}