/**
 * BURNBOARD — Growth Analytics API
 *
 * GET /api/growth/analytics?days=30
 *
 * Returns the global growth snapshot (North Star metrics, funnel,
 * activation, cohort retention, referral quality, network density,
 * creators, communities, regions) + snapshot history.
 *
 * Aggregate-only and privacy-safe (no user-level data). Protected by:
 *   - Authorization: Bearer $CRON_SECRET   (cron / ops dashboards), or
 *   - x-admin-password: $ADMIN_PASSWORD    (in-app admin, same gate as /admin)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildGrowthDashboard } from '@/lib/growth/analytics';
import { checkAdminAccess, adminAccessResponse } from '@/lib/adminGate';

export async function GET(req) {
  // Fail-closed admin gate (MP26): no default secret; cron bearer still works.
  const access = checkAdminAccess(req);
  if (!access.ok) return adminAccessResponse(access);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') || '30', 10) || 30, 90);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const dashboard = await buildGrowthDashboard(supabase, { days });

  return NextResponse.json(dashboard, {
    headers: { 'Cache-Control': 'no-store' },
  });
}