/**
 * BURNBOARD — Growth Alerts API (Master Prompt 23, Section 79)
 *
 * GET /api/growth/alerts
 *
 * Turns the persisted growth snapshot history into actionable alerts so a
 * major failure (retention cliff, activation drop, referral abuse) is never
 * discovered only in a monthly report:
 *   - signup_spike        (passthrough from the snapshot anomaly detector)
 *   - retention_cliff     (latest cohort D1/D7 vs the prior cohort)
 *   - activation_drop     (7d activation rate vs the prior snapshot)
 *   - referral_abuse      (visit spike with collapsing conversion rate)
 *   - referral_quality    (info: conversion below a healthy threshold)
 *
 * Aggregate-only; never exposes user-level data. Protected by the same
 * admin gate as /api/growth/analytics.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildGrowthDashboard } from '@/lib/growth/analytics';
import { checkAdminAccess, adminAccessResponse } from '@/lib/adminGate';

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Retention cliff: latest cohort vs previous cohort, per-day threshold.
function retentionCliffAlerts(snapshot) {
  const cohorts = (snapshot?.cohorts || [])
    .filter((c) => pct(c.size) > 0)
    .sort((a, b) => String(a.cohort).localeCompare(String(b.cohort)));
  if (cohorts.length < 2) return [];

  const latest = cohorts[cohorts.length - 1];
  const prior = cohorts[cohorts.length - 2];
  const alerts = [];

  for (const [day, key] of [['D1', 'd1_pct'], ['D7', 'd7_pct']]) {
    const now = pct(latest[key]);
    const before = pct(prior[key]);
    if (now === null || before === null) continue;
    const drop = before - now;
    if (drop >= 20) {
      alerts.push({
        type: 'retention_cliff',
        level: 'warn',
        detail: `${day} retention dropped ${drop}pts (${before}% → ${now}%) for the ${latest.cohort} cohort vs ${prior.cohort}. Investigate activation or onboarding regressions.`,
      });
    }
  }
  return alerts;
}

// Activation rate trend across persisted snapshots.
function activationTrendAlerts(history) {
  const points = history
    .map((h) => ({ date: h.date, rate: pct(h.data?.activation?.activationRatePct) }))
    .filter((p) => p.rate !== null);
  if (points.length < 2) return [];

  const last = points[points.length - 1];
  const prior = points[points.length - 2];
  const drop = prior.rate - last.rate;
  if (drop >= 20) {
    return [{
      type: 'activation_drop',
      level: 'warn',
      detail: `7d activation rate dropped ${drop.toFixed(1)}pts (${prior.rate}% → ${last.rate}%) between ${prior.date} and ${last.date}.`,
    }];
  }
  return [];
}

// Referral abuse: visit spike with collapsing conversion.
function referralAbuseAlerts(history) {
  const points = history
    .map((h) => ({
      date: h.date,
      visits: pct(h.data?.referral?.visits7d),
      conversions: pct(h.data?.referral?.conversions7d),
    }))
    .filter((p) => p.visits !== null);
  if (points.length < 2) return [];

  const last = points[points.length - 1];
  const prior = points[points.length - 2];
  if (prior.visits <= 0 || last.visits < prior.visits * 3) return [];

  const lastRate = last.visits > 0 ? (last.conversions || 0) / last.visits : 0;
  const priorRate = prior.visits > 0 ? (prior.conversions || 0) / prior.visits : 0;
  if (lastRate < priorRate * 0.5) {
    return [{
      type: 'referral_abuse',
      level: 'warn',
      detail: `Referral visits spiked ${Math.round((last.visits / prior.visits) * 100)}% (${prior.visits} → ${last.visits}) while conversion collapsed (${(priorRate * 100).toFixed(1)}% → ${(lastRate * 100).toFixed(1)}%). Possible visit farming — verify before rewarding.`,
    }];
  }
  return [];
}

function referralQualityInfo(snapshot) {
  const rate = pct(snapshot?.referral?.conversionRatePct);
  if (rate === null) return [];
  if (rate < 10) {
    return [{
      type: 'referral_quality',
      level: 'info',
      detail: `Referral conversion is ${rate}% (${snapshot.referral.conversions7d || 0}/${snapshot.referral.visits7d || 0}). Low conversion usually means the invite landing or post-signup flow needs work.`,
    }];
  }
  return [];
}

export async function GET(req) {
  const access = checkAdminAccess(req);
  if (!access.ok) return adminAccessResponse(access);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const dashboard = await buildGrowthDashboard(supabase, { days: 60 });

  const alerts = [
    ...(dashboard.snapshot?.anomalies || []).filter((a) => a?.level === 'warn'),
    ...retentionCliffAlerts(dashboard.snapshot),
    ...activationTrendAlerts(dashboard.history),
    ...referralAbuseAlerts(dashboard.history),
    ...referralQualityInfo(dashboard.snapshot),
  ];

  return NextResponse.json(
    {
      alerts,
      generatedAt: new Date().toISOString(),
      hasSnapshot: !!dashboard.snapshot,
      historyPoints: dashboard.history.length,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}