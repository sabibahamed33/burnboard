// BURNBOARD Analytics Engine (Zero-Cost LocalStorage + Vercel Events)

const STORAGE_KEY = 'burnboard_analytics_events';

// Identical events fired within this window are React-rerender echoes, not
// new user behavior — suppress them so analytics never double-count and can
// never form an infinite loop.
const DEDUPE_WINDOW_MS = 1000;
let lastEvent = { key: null, at: 0 };

export function track(event, data = {}) {
  const key = `${event}:${JSON.stringify(data || {})}`;
  const now = Date.now();
  if (lastEvent.key === key && now - lastEvent.at < DEDUPE_WINDOW_MS) {
    return false; // suppressed duplicate
  }
  lastEvent.key = key;
  lastEvent.at = now;

  const payload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  try {
    console.log(`[BURNBOARD Analytics] 🔥 Event: ${event}`, data);
    
    if (typeof window !== 'undefined') {
      const existingStr = localStorage.getItem(STORAGE_KEY);
      const existing = existingStr ? JSON.parse(existingStr) : [];
      existing.unshift(payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 200)));
    }
  } catch (err) {
    console.warn('Analytics tracking error:', err);
  }
  return true; // emitted
}

export function getAnalyticsEvents() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
