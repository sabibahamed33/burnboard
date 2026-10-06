import { NextResponse } from 'next/server';
import { getFinancialObservability, getRevenueHistory } from '@/lib/monetization/revenueAnalytics';
import { checkAdminAccess, adminAccessResponse } from '@/lib/adminGate';

/**
 * GET /api/admin/financials
 *
 * Financial observability for the admin dashboard. Aggregate only — no
 * user-level financial data is ever returned. Gated by the centralized
 * admin gate (x-admin-password verified against ADMIN_PASSWORD) or
 * CRON_SECRET — fail-closed, no default secret (MP26).
 *
 * Returns: ledger health checks (entitlement drift, stuck webhook events,
 * failed events, pending payouts, audit volume) + recent revenue snapshots.
 */
export async function GET(req) {
  try {
    const access = checkAdminAccess(req);
    if (!access.ok) return adminAccessResponse(access);

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ available: false, checks: [] });
    }
    const client = createClient(supabaseUrl, supabaseKey);

    const [observability, history] = await Promise.all([
      getFinancialObservability(client),
      getRevenueHistory(client, 30),
    ]);

    // Latest snapshot summary for quick glance.
    const latest = history.snapshots[0]?.data || null;

    return NextResponse.json({
      available: observability.available,
      checks: observability.checks,
      latestSnapshot: latest,
      snapshotDates: history.snapshots.map(s => s.snapshot_date),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Admin Financials] Error:', err?.message || err);
    return NextResponse.json({ available: false, checks: [], error: 'internal' }, { status: 500 });
  }
}