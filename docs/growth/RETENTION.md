# BurnBoard Long-Term Retention — Ethical Community Growth

How BurnBoard earns return visits without dark patterns, fake engagement,
or unnecessary personal data.

---

## 1. Core objective

Build a community users **want** to return to. Every return driver must be:

- powered by **real value** (a genuine reply beats any badge),
- **honest** (no fabricated counts, no fake members, no empty hype),
- **consensual** (preference-gated, frequency-capped, opt-in for digests),
- **minimal** (aggregates only, coarse locale, no scroll/location tracking).

If a tactic needs shame, urgency threats, or invented social proof, it ships never.

## 2. What already existed (and where the risks were)

| System | Status | Risk fixed |
| --- | --- | --- |
| Communities, challenges, battles, referrals | real rows, RLS-enforced, fraud-proof | — (keep) |
| Notifications | deduped, preference-gated, safety-gated | weekly recap type existed but had **no generator** → added opt-in `notifyWeeklyRecap` |
| Streaks (`lib/reputation/streaks.js`) | hard reset on 1 missed day | **loss-aversion dark pattern** → 1-day grace via `evaluateStreak()` |
| Badges/rep | rewards participation | volume badges (`reaction_100`) can induce grind — monitor; never notify-shame |
| Social health (`lib/socialHealth.js`) | honest bounded samples, tombstone gaps disclosed | churn still unmeasurable (unfollows/leaves are deleted rows) — tracked gap |
| Onboarding (`lib/onboarding.js`) | localStorage-only, privacy-good | no server activation event — do NOT "fix" with invasive tracking |

## 3. New: ethical retention engine (`lib/growth/retention.js`)

Pure-logic, testable, DB-injected:

- `evaluateStreak()` — 1-day forgiveness, idempotent same-day.
- `streakCopy()` — encouraging copy only. Never "streak dying", "you'll lose".
- `shouldSendNudge()` — hard gates: prefs ON + real value + ≥72h since last + ≤2/week.
- `isCommunityWorthPromoting()` — floor: ≥3 members + ≥2 posts/7d. Ghost towns never surface.
- `pickReturnReason()` — priority: genuine reply > community ritual > live challenge > follow-back > milestone. Else `QUIET` (silence).
- `buildWeeklyDigest()` — aggregated recap; returns `null` when signal < 1 (silence beats filler).
- `checkCopyEthics()` — bans urgency/shame/fake-proof patterns; enforce in tests + review.
- `RETENTION_POLICY` — all thresholds in one place, tuned with evidence.

## 4. Return reasons that compound (in priority order)

1. **Genuine replies** — someone answered *you*. Strongest driver. Notify once, grouped 60-min.
2. **Community rituals** — weekly prompt / challenge in a community you joined, only if alive (vitality floor).
3. **Live challenges/battles** — active + ≥2 real participants. Dead ones never push.
4. **Real follows** — follow-back from a discoverable profile. No bot welcomes.
5. **Earned milestones** — level/badge you actually earned. No "almost there" guilt.
6. **Quiet** — nothing new → nothing sent. The most underrated retention feature.

## 5. Rituals & network effects (sustainable cadence)

- **Daily Spark** (`lib/reputation/dailySpark.js`): one prompt/day, participation idempotent. No streak threat attached.
- **Weekly challenge**: time-boxed (1–14d enforced in `lib/challenges.js`), honest outcome (`getChallengeOutcome` only declares a winner with real reaction signal).
- **Community loop**: valuable discussion → member invites relevant person → better discussion. No mass-invite rewards (invite volume is deliberately unrewarded in `REP_EVENTS`).
- **Density > size**: track follows/user, mutuals, community overlap (`docs/growth/GROWTH_MODEL.md` §6). A small dense network retains better than a large disconnected one.

## 6. What we explicitly will NOT do

- ❌ Streak-expiry threats, shame copy, "we miss you so much" guilt.
- ❌ Fake members, fake reactions, fake trends, inflated counts (`/api/stats` already stripped of hardcoded numbers).
- ❌ Forced contact upload, spam invites, reward-per-invite (only activated referrals earn, capped 10/mo).
- ❌ Optimizing screen time. North Star is *weekly users receiving/creating meaningful value*, not minutes.
- ❌ Collecting location, scroll logs, cross-site tracking for retention. Locale is coarse (en/bn/hi) at signup only.
- ❌ Expanding faster than moderation capacity (growth never overrides blocks/mutes/safety).

## 7. Measurement (already wired)

- `lib/socialHealth.js` → `/admin/social`: graph, first-connection rate, reciprocity, community joins, conversation depth, return-loop volume, boundary ratio. Alerts: `activation_low`, `reciprocity_low`, `community_stagnant`, `conversation_idle`, `return_loop_silent`.
- `lib/growth/analytics.js` → `/admin/growth`: D1/D7/D30 cohorts, activation rate, creators, density, referral quality (activated, not raw signups), K-factor estimate.
- Guardrail for every retention experiment: retention ↑ must not move boundary-ratio, report-rate, or pref-off-rate adversely.

## 8. Operating checklist (weekly)

1. Check `/admin/social` + `/admin/growth`: any alert firing?
2. If `return_loop_silent` + network active → wire the missing genuine event, never invent one.
3. If `community_stagnant` → seed with a real host/ritual, never fake members.
4. If activation < 25% first-connection → fix discovery/first-follow, not more nudges.
5. Recap quality: what share of weekly recaps had ≥2 real lines? If filler rises, raise `RECAP_MIN_SIGNAL`, not volume.

## 9. Files

- Engine: `lib/growth/retention.js`
- Streak grace: `lib/reputation/streaks.js` (+ `evaluateStreak`)
- Recap sender: `notifyWeeklyRecap()` in `lib/notifications.js` (opt-in `email_notifications === true`, 7-day dedup)
- Loops: `docs/growth/GROWTH_LOOPS.md` · Model: `docs/growth/GROWTH_MODEL.md` · Health: `docs/social/SOCIAL_HEALTH.md`
