/**
 * BURNBOARD Daily Cleanup Cron
 *
 * Runs daily at midnight via Vercel Cron (free tier).
 * - Deletes expired stories (older than 24h past expiry)
 * - Deletes security logs older than 30 days
 * - Updates profile roast_count for consistency
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processAiJobs } from '@/lib/ai/worker';
import { captureDailySnapshot } from '@/lib/growth/analytics';
import { captureDailyRevenueSnapshot } from '@/lib/monetization/revenueAnalytics';
import { processWebhookDeliveries } from '@/lib/platform/webhooks';

export async function GET(request) {
  // Verify cron secret — fail closed. If CRON_SECRET is not configured this
  // route must not run at all (it performs deletes and queue processing).
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
  const results = {};

  try {
    // 1. Delete expired stories (older than 24h past expiry)
    const { count: storiesDeleted, error: storiesErr } = await supabase
      .from('stories')
      .delete()
      .lt('expires_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    results.storiesDeleted = storiesDeleted || 0;
    if (storiesErr) results.storiesError = storiesErr.message;

    // 2. Delete security logs older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: logsDeleted, error: logsErr } = await supabase
      .from('security_logs')
      .delete()
      .lt('created_at', thirtyDaysAgo);

    results.logsDeleted = logsDeleted || 0;
    if (logsErr) results.logsError = logsErr.message;

    // 3. Update profile roast_count for consistency
    // Batch refresh via RPC (single aggregate statement) — replaces the
    // old per-profile loop that issued O(profiles) queries per run.
    const { data: refreshResult, error: refreshErr } = await supabase.rpc('refresh_profile_roast_counts');
    results.profilesUpdated = refreshResult || 0;
    if (refreshErr) results.roastCountRefreshError = refreshErr.message;


    // 4. Deactivate expired challenges
    const { count: challengesDeactivated } = await supabase
      .from('challenges')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('expires_at', new Date().toISOString());

    results.challengesDeactivated = challengesDeactivated || 0;

    // 5. AI background jobs (content understanding, embeddings, quality)
    // Runs daily inside the existing cleanup cron so no additional Vercel
    // cron slot is consumed on Hobby. Idempotent and failure-safe.
    const aiResult = await processAiJobs(supabase, { batchSize: 50 });
    results.ai = aiResult;

    // 6. Growth snapshot: persist today's aggregate metrics for cohort /
    // retention history. Idempotent per date; never blocks cleanup.
    const growthResult = await captureDailySnapshot(supabase);
    results.growthSnapshot = growthResult;

    // 7. Revenue snapshot: persist today's ledger-derived monetization
    // aggregates (gross/net by day, by product type, payout state, payment
    // health). Idempotent per date; never blocks cleanup.
    const revenueResult = await captureDailyRevenueSnapshot(supabase);
    results.revenueSnapshot = revenueResult;

    // 8. Platform webhook deliveries: deliver due signed webhook events to
    // subscribed third-party endpoints (idempotent, retry with backoff).
    const webhookResult = await processWebhookDeliveries(supabase, { batchSize: 25 });
    results.webhooks = webhookResult;

    // 9. Referral rewards sweep (MP23): grant karma to referrers whose
    // referred users ACTIVATED (strong first-value activity within 7 days of
    // conversion). Idempotent per referral visit, monthly-capped, and gated
    // on real activation — raw signups never earn rewards.
    const sweepResult = await supabase.rpc('sweep_referral_rewards');
    results.referralRewardsGranted = sweepResult.error ? null : (sweepResult.data || 0);
    if (sweepResult.error) results.referralRewardsError = sweepResult.error.message;

    // 10. Scheduled photo posts: publish rows whose time has come.
    // Bounded (100/run), idempotent (visibility leaves 'scheduled'),
    // failure-safe — a missed run just publishes on the next one.
    try {
      const nowIso = new Date().toISOString();
      const { data: due } = await supabase
        .from('social_posts')
        .select('id, visibility, metadata')
        .eq('visibility', 'scheduled')
        .lte('metadata->>scheduled_at', nowIso)
        .limit(100);
      let published = 0;
      for (const row of due || []) {
        try {
          const meta = { ...(row.metadata || {}) };
          const target = ['public', 'followers', 'only_me'].includes(meta.target_visibility)
            ? meta.target_visibility
            : 'public';
          delete meta.scheduled_at;
          meta.published_at = nowIso;
          const { error: pubErr } = await supabase
            .from('social_posts')
            .update({ visibility: target, metadata: meta, updated_at: nowIso })
            .eq('id', row.id)
            .eq('visibility', 'scheduled');
          if (!pubErr) published += 1;
        } catch {}
      }
      results.scheduledPublished = published;
    } catch (e) {
      results.scheduledError = e?.message || 'scheduled sweep failed';
    }

    console.log('[Cron] Cleanup completed:', results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });

  } catch (err) {
    console.error('[Cron] Cleanup failed:', err);
    return NextResponse.json({
      error: 'Cleanup failed',
      details: err.message,
      partialResults: results,
    }, { status: 500 });
  }
}
