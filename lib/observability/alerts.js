/**
 * BURNBOARD Observability — alert evaluation + delivery.
 *
 * Rules live in lib/observability/budgets.js (ALERT_RULES). Delivery is a
 * generic incoming-webhook POST (Slack/Discord-compatible payload) to
 * OBS_ALERT_WEBHOOK_URL. When the webhook is NOT configured, alerts are
 * recorded as pending and the dashboard reports "Alerting not configured" —
 * never claimed active.
 *
 * Dedup: per-fingerprint hourly cooldown; auth-burst + synthetic rules have
 * their own cooldowns. Recovery: when a previously-alerted group goes 30m
 * quiet, a single recovery notice is queued.
 */

import { ALERT_RULES, RESPONSE_CHECKLIST } from './budgets';
import { errorStats, listGroups, markAlerted, markRecovered } from './errorStore';
import { getConsecutiveFails, getLastSyntheticRun } from './synthetic';

const lastFired = new Map(); // ruleKey -> ms (cooldown tracking)
const pending = []; // bounded queue of alert objects
const MAX_PENDING = 100;

function cooledDown(key, cooldownMs) {
  const last = lastFired.get(key) || 0;
  if (Date.now() - last < cooldownMs) return false;
  lastFired.set(key, Date.now());
  return true;
}

function queueAlert(alert) {
  pending.unshift({ ...alert, at: new Date().toISOString() });
  if (pending.length > MAX_PENDING) pending.length = MAX_PENDING;
  return alert;
}

async function deliver(alert) {
  const url = process.env.OBS_ALERT_WEBHOOK_URL;
  if (!url) {
    queueAlert({ ...alert, delivered: false, reason: 'webhook_not_configured' });
    return { delivered: false, reason: 'webhook_not_configured' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const text = `*${alert.severity.toUpperCase()}* ${alert.title}\n${alert.detail || ''}\nStarted: ${alert.startedAt || alert.at}\nChecklist: /control/incidents`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...alert }),
      signal: controller.signal,
    }).catch(() => {});
    clearTimeout(timer);
    queueAlert({ ...alert, delivered: true });
    return { delivered: true };
  } catch (err) {
    queueAlert({ ...alert, delivered: false, reason: String(err?.message || 'delivery failed').slice(0, 120) });
    return { delivered: false, reason: 'delivery_failed' };
  }
}

export function alertingConfigured() {
  return !!process.env.OBS_ALERT_WEBHOOK_URL;
}

/**
 * Evaluate rules against current state. Called fire-and-forget after error
 * ingest and after synthetic runs. Never throws, never blocks.
 */
export async function evaluateAlerts({ window = '24h' } = {}) {
  try {
    const fired = [];
    // 1. Critical groups fire immediately (hourly dedup per fingerprint).
    for (const g of listGroups({ window })) {
      if (g.severity !== 'critical') continue;
      const key = `critical:${g.fingerprint}`;
      if (!cooledDown(key, ALERT_RULES.critical.cooldownMs)) continue;
      markAlerted(g.fingerprint);
      const alert = {
        severity: 'critical', title: `Critical errors: ${g.kind} on ${g.route}`,
        detail: `${g.count} occurrences. Message: ${g.message}`,
        startedAt: g.firstSeen, fingerprint: g.fingerprint,
        checklist: RESPONSE_CHECKLIST,
      };
      await deliver(alert);
      fired.push(alert);
    }
    // 2. Spike: any single group >= threshold in the recent window.
    const stats = errorStats(window);
    if (stats.last15m >= ALERT_RULES.spike.threshold && cooledDown('spike', ALERT_RULES.spike.cooldownMs)) {
      const top = listGroups({ window })[0];
      const alert = {
        severity: 'high', title: `Error spike: ${stats.last15m} errors in 15m`,
        detail: top ? `Top group: ${top.kind} on ${top.route} (${top.count}x)` : 'Volume across groups.',
        startedAt: new Date().toISOString(), checklist: RESPONSE_CHECKLIST,
      };
      await deliver(alert);
      fired.push(alert);
    }
    // 3. Auth burst.
    const authCount = (stats.byCategory || {}).auth || 0;
    if (authCount >= ALERT_RULES.authBurst.threshold && cooledDown('authBurst', ALERT_RULES.authBurst.cooldownMs)) {
      const alert = {
        severity: 'high', title: `Auth failure burst: ${authCount} auth errors (${window})`,
        detail: 'Possible login/signup/session regression or redirect loop. Check /auth + /welcome + middleware.',
        startedAt: new Date().toISOString(), checklist: RESPONSE_CHECKLIST,
      };
      await deliver(alert);
      fired.push(alert);
    }
    // 4. Synthetic failures (2 consecutive).
    const run = getLastSyntheticRun();
    if (run) {
      for (const c of run.checks || []) {
        if (c.configured === false || c.ok) continue;
        if (getConsecutiveFails(c.name) < ALERT_RULES.synthetic.consecutiveFails) continue;
        const key = `synthetic:${c.name}`;
        if (!cooledDown(key, ALERT_RULES.synthetic.cooldownMs)) continue;
        const alert = {
          severity: c.category === 'availability' || c.category === 'health' ? 'critical' : 'high',
          title: `Synthetic failing: ${c.name} (${getConsecutiveFails(c.name)}x consecutive)`,
          detail: c.detail || `status ${c.status}`,
          startedAt: c.at, checklist: RESPONSE_CHECKLIST,
        };
        await deliver(alert);
        fired.push(alert);
      }
    }
    // 5. Recovery notices: alerted groups quiet for 30m.
    for (const g of listGroups({ window: '7d' })) {
      if (g.recoveredNotified) continue;
      if (g.lastAlertAt && Date.now() - g.lastSeenMs > 30 * 60 * 1000 && Date.now() - g.lastAlertAt < 24 * 3600 * 1000) {
        markRecovered(g.fingerprint);
        const alert = {
          severity: 'low', title: `Recovered: ${g.kind} on ${g.route} quiet for 30m`,
          detail: `Last seen ${g.lastSeen}. No action needed unless it recurs.`,
          startedAt: g.lastSeen,
        };
        await deliver(alert);
        fired.push(alert);
      }
    }
    return fired;
  } catch {
    return [];
  }
}

export function pendingAlerts(limit = 30) {
  try {
    return pending.slice(0, limit);
  } catch {
    return [];
  }
}
