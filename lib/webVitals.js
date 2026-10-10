/**
 * BURNBOARD Observability — real-user Web Vitals (dependency-free RUM).
 *
 * Uses native PerformanceObserver for LCP/CLS/INP where supported.
 * Sampled (10%), bounded, fire-and-forget — never impacts interaction.
 * Reports via POST /api/errors with kind=web_vital (grouped + budgeted
 * on the dashboard). Lab vs field are labeled at display time.
 */

import { reportClientError } from './clientErrors';

const SAMPLE_RATE = 0.1;
let started = false;

function sampled() {
  try {
    return Math.random() < SAMPLE_RATE;
  } catch {
    return false;
  }
}

function send(metric, value, extra = {}) {
  try {
    reportClientError({
      kind: 'web_vital',
      operation: `web-vital:${metric}`,
      message: `${metric}=${Math.round(value)}`,
      ...extra,
    });
  } catch {}
}

export function installWebVitals() {
  if (typeof window === 'undefined') return;
  if (started) return;
  started = true;
  try {
    if (!sampled()) return;
    if (typeof PerformanceObserver === 'undefined') return;

    // LCP — largest contentful paint.
    try {
      const lcp = new PerformanceObserver((list) => {
        try {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) send('LCP', last.startTime, { route: window.location.pathname });
        } catch {}
      });
      lcp.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    // CLS — cumulative layout shift (session sum, no recent input).
    try {
      let cls = 0;
      const obs = new PerformanceObserver((list) => {
        try {
          for (const e of list.getEntries()) {
            if (!e.hadRecentInput) cls += e.value || 0;
          }
        } catch {}
      });
      obs.observe({ type: 'layout-shift', buffered: true });
      window.addEventListener('pagehide', () => send('CLS', cls * 1000), { once: true });
    } catch {}

    // INP — interaction to next paint (worst event duration approximation).
    try {
      let worst = 0;
      const obs = new PerformanceObserver((list) => {
        try {
          for (const e of list.getEntries()) {
            const d = e.duration || 0;
            if (d > worst) worst = d;
          }
        } catch {}
      });
      obs.observe({ type: 'event', buffered: true, durationThreshold: 40 });
      window.addEventListener('pagehide', () => {
        if (worst > 0) send('INP', worst);
      }, { once: true });
    } catch {}
  } catch {}
}
