/**
 * BURNBOARD — Ethical Retention Engine
 *
 * Long-term community growth without dark patterns, fake engagement,
 * or unnecessary personal data collection.
 *
 * Principles (enforced in code, not just docs):
 *  1. VALUE BEFORE NUDGE — never send a return nudge unless there is
 *     genuine new value (a real reply, a live challenge, community activity).
 *  2. NO FAKE SOCIAL PROOF — counts come from real rows. Empty communities,
 *     dead challenges, and zero-signal content are never promoted.
 *  3. NO LOSS-AVERSION WEAPONS — streaks forgive (grace day), never shame,
 *     never threaten. Badges reward meaning, not grind.
 *  4. FREQUENCY CAPS + PREFERENCE GATES — every nudge is preference-checked
 *     and rate-limited. Weekly recap is opt-in, aggregated, 7-day deduped.
 *  5. DATA MINIMIZATION — aggregate-only. No scroll tracking, no location,
 *     no cross-site attribution, no PII in logs. Coarse locale only.
 *
 * This module is pure logic + thin Supabase reads so it can be unit-tested
 * without a DB (all row-fetching is injected via `deps`).
 */

// ── Policy constants (tune with evidence, never silently) ──

export const RETENTION_POLICY = {
  // Streak forgiveness: 1 missed day does NOT reset to zero.
  // Rationale: punishing streak resets are a classic dark pattern.
  STREAK_GRACE_DAYS: 1,
  STREAK_FREEZE_EARNED_EVERY_DAYS: 7,

  // Nudge frequency: max 1 proactive return nudge per user per window.
  NUDGE_MIN_INTERVAL_HOURS: 72,
  MAX_NUDGES_PER_WEEK: 2,

  // Community promotion floor: never surface ghost towns.
  MIN_MEMBERS_TO_PROMOTE: 3,
  MIN_POSTS_7D_TO_PROMOTE: 2,

  // Challenge promotion floor: never push dead challenges.
  MIN_PARTICIPANTS_TO_NUDGE: 2,

  // Weekly recap: opt-in only, one per 7 days.
  RECAP_DEDUP_DAYS: 7,
  RECAP_MIN_SIGNAL: 1, // at least 1 real event, else stay silent
};

export const RETURN_REASONS = {
  GENUINE_REPLY: 'genuine_reply',       // someone replied to you — strongest return driver
  COMMUNITY_RITUAL: 'community_ritual', // weekly ritual in a community you joined
  LIVE_CHALLENGE: 'live_challenge',     // active challenge with real participants
  FOLLOW_BACK: 'follow_back',           // real follow-back, not a bot
  MILESTONE_EARNED: 'milestone_earned', // level/badge you actually earned
  QUIET: 'quiet',                       // nothing worth your time — stay silent
};

// ── Ethical streak evaluation (pure, testable) ─────────────

/**
 * Evaluate a streak transition with forgiveness.
 *
 * @param {Object} opts { lastActiveDate: 'YYYY-MM-DD'|null, currentStreak, today?: 'YYYY-MM-DD' }
 * @returns {Object} { nextStreak, streakKept, usedGrace, isNewRecord }
 */
export function evaluateStreak({ lastActiveDate, currentStreak = 0, longestStreak = 0, today = null } = {}) {
  const todayStr = today || new Date().toISOString().split('T')[0];
  if (!lastActiveDate) {
    return { nextStreak: 1, streakKept: true, usedGrace: false, isNewRecord: 1 > longestStreak, today: todayStr };
  }
  if (lastActiveDate === todayStr) {
    return { nextStreak: currentStreak, streakKept: true, usedGrace: false, isNewRecord: false, alreadyActive: true, today: todayStr };
  }
  const diffDays = Math.floor(
    (new Date(todayStr) - new Date(lastActiveDate)) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 1) {
    const next = currentStreak + 1;
    return { nextStreak: next, streakKept: true, usedGrace: false, isNewRecord: next > longestStreak, today: todayStr };
  }
  if (diffDays === 2 && RETENTION_POLICY.STREAK_GRACE_DAYS >= 1) {
    // Forgiven: one missed day keeps the streak alive, no shame copy.
    const next = currentStreak + 1;
    return { nextStreak: next, streakKept: true, usedGrace: true, isNewRecord: next > longestStreak, today: todayStr };
  }
  return { nextStreak: 1, streakKept: false, usedGrace: false, isNewRecord: false, reset: true, today: todayStr };
}

/**
 * Copy for streak display. Never shames, never threatens loss.
 */
export function streakCopy({ currentStreak, usedGrace = false, reset = false } = {}) {
  if (reset) return 'Fresh start — every return counts.';
  if (usedGrace) return 'Welcome back — your streak is intact. Life happens.';
  if (currentStreak >= 30) return `${currentStreak}-day rhythm. Impressive consistency.`;
  if (currentStreak >= 7) return `${currentStreak}-day rhythm. Nice.`;
  if (currentStreak >= 2) return `${currentStreak}-day rhythm.`;
  return 'Day one. Glad you are here.';
}

// ── Nudge gating (frequency + value gates) ─────────────────

/**
 * Decide whether a proactive nudge is allowed.
 *
 * @param {Object} opts { lastNudgeAt: ISO|null, nudgesThisWeek, hasRealValue, prefsAllowed, now?: ms }
 * @returns {Object} { allowed, reason }
 */
export function shouldSendNudge({ lastNudgeAt = null, nudgesThisWeek = 0, hasRealValue = false, prefsAllowed = true, now = Date.now() } = {}) {
  if (!prefsAllowed) return { allowed: false, reason: 'prefs_off' };
  if (!hasRealValue) return { allowed: false, reason: 'no_value_no_nudge' };
  if (nudgesThisWeek >= RETENTION_POLICY.MAX_NUDGES_PER_WEEK) {
    return { allowed: false, reason: 'weekly_cap' };
  }
  if (lastNudgeAt) {
    const hours = (now - new Date(lastNudgeAt).getTime()) / (1000 * 60 * 60);
    if (hours < RETENTION_POLICY.NUDGE_MIN_INTERVAL_HOURS) {
      return { allowed: false, reason: 'too_soon' };
    }
  }
  return { allowed: true, reason: 'ok' };
}

// ── Community vitality (never promote ghost towns) ─────────

/**
 * A community is worth a return visit only with real people + real posts.
 * Pure function over aggregate counts — no user-level data needed.
 */
export function isCommunityWorthPromoting({ memberCount = 0, posts7d = 0 } = {}) {
  if (memberCount < RETENTION_POLICY.MIN_MEMBERS_TO_PROMOTE) {
    return { worthIt: false, reason: 'too_few_members' };
  }
  if (posts7d < RETENTION_POLICY.MIN_POSTS_7D_TO_PROMOTE) {
    return { worthIt: false, reason: 'no_recent_activity' };
  }
  return { worthIt: true, reason: 'alive' };
}

/**
 * Rank return reasons by long-term value (replies > rituals > challenges).
 * Returns the single best reason, or QUIET when nothing is genuinely new.
 */
export function pickReturnReason(signals = {}) {
  const {
    unreadReplies = 0,
    activeRituals = 0,
    liveChallenges = 0,
    newFollowers = 0,
    milestoneEarned = false,
  } = signals;
  if (unreadReplies > 0) return { reason: RETURN_REASONS.GENUINE_REPLY, count: unreadReplies };
  if (activeRituals > 0) return { reason: RETURN_REASONS.COMMUNITY_RITUAL, count: activeRituals };
  if (liveChallenges > 0) return { reason: RETURN_REASONS.LIVE_CHALLENGE, count: liveChallenges };
  if (newFollowers > 0) return { reason: RETURN_REASONS.FOLLOW_BACK, count: newFollowers };
  if (milestoneEarned) return { reason: RETURN_REASONS.MILESTONE_EARNED, count: 1 };
  return { reason: RETURN_REASONS.QUIET, count: 0 };
}

// ── Weekly digest builder (opt-in, aggregated, honest) ─────

/**
 * Build an honest weekly recap from pre-aggregated counts.
 * Returns null when there is nothing real to report — silence beats filler.
 *
 * @param {Object} aggregates { replies, reactions, newFollowers, communityPosts, liveChallenges }
 * @param {Object} opts { displayName, prefsAllowed }
 */
export function buildWeeklyDigest(aggregates = {}, { displayName = 'there', prefsAllowed = true } = {}) {
  if (!prefsAllowed) return null;
  const {
    replies = 0,
    reactions = 0,
    newFollowers = 0,
    communityPosts = 0,
    liveChallenges = 0,
  } = aggregates;

  const totalSignal = replies + reactions + newFollowers + communityPosts + liveChallenges;
  if (totalSignal < RETENTION_POLICY.RECAP_MIN_SIGNAL) return null;

  const lines = [];
  if (replies > 0) lines.push(`${replies} ${replies === 1 ? 'reply' : 'replies'} to your posts`);
  if (reactions > 0) lines.push(`${reactions} reactions on your content`);
  if (newFollowers > 0) lines.push(`${newFollowers} new ${newFollowers === 1 ? 'follower' : 'followers'}`);
  if (communityPosts > 0) lines.push(`${communityPosts} new posts in your communities`);
  if (liveChallenges > 0) lines.push(`${liveChallenges} live ${liveChallenges === 1 ? 'challenge' : 'challenges'} you can join`);

  return {
    title: 'Your week on BurnBoard',
    message: `Hey ${displayName} — ${lines.join(' • ')}. Come back when you like; nothing expires.`,
    lines,
    link: '/notifications',
  };
}

// ── Notification copy guardrails ───────────────────────────

/**
 * Banned patterns: urgency threats, shame, fake scarcity, guilt.
 * Returns { ok, violation? } so callers and tests can enforce it.
 */
const BANNED_COPY = [
  /last chance/i,
  /you('ll| will) lose/i,
  /don\'t miss out/i,
  /hurry/i,
  /streak (expir|dying|at risk)/i,
  /we miss you so much/i,
  /\d+ people (are talking|miss you)/i, // fabricated social proof
  /you have been selected/i,
];

export function checkCopyEthics(text = '') {
  for (const pattern of BANNED_COPY) {
    if (pattern.test(text)) {
      return { ok: false, violation: pattern.source };
    }
  }
  return { ok: true };
}
