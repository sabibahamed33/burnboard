import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { captureDailyRevenueSnapshot } from '@/lib/monetization/revenueAnalytics';

/**
 * GET /api/cron/revenue-snapshot
 *
 * Daily revenue analytics snapshot (compute + persist, idempotent). Gated by
 * CRON_SECRET. Also wired into the existing daily cleanup cron — this route
 * exists so ops can trigger it standalone or via a dedicated scheduler when
 * the platform outgrows the Hobby cron slot.
 */
export async function GET(req) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization') || '';
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    }
    const client = createClient(supabaseUrl, supabaseKey);

    const result = await captureDailyRevenueSnapshot(client);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    console.error('[Cron] Revenue snapshot failed:', err?.message || err);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}