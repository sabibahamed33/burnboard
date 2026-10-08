# BurnBoard Growth Loops

Master Prompt 23 — the wiring diagram of every legitimate growth loop, what
feeds it, how it is measured, and the guardrails that keep it honest.

**The one rule that never bends:** every loop must be powered by REAL product
value. A loop that needs spam, fake engagement, purchased users, or deceptive
prompts is not a growth loop — it is a leak that destroys trust.

---

## 1. The core flywheel

```
NEW USER → FAST ACTIVATION → PERSONALIZED VALUE → FIRST MEANINGFUL ACTION
→ SOCIAL CONNECTION → COMMUNITY PARTICIPATION → CONTENT CREATION
→ NATURAL SHARING → NEW USER DISCOVERY → NETWORK EXPANSION
→ BETTER CONTENT SUPPLY → HIGHER RETENTION → MORE USERS
```

Every feature is judged against: does it create VALUE, RETENTION, SHARING,
CONNECTION, CONTENT SUPPLY, or NETWORK EFFECTS? (It must create at least one
without harming the others.)

---

## 2. Content viral loop

**Mechanism:** user creates content → content is discovered → content is
shareable → an external person sees it → BurnBoard identity is present →
visitor lands on a real, context-rich page → visitor can consume value
without a login wall → visitor signs up when value justifies it → new user
creates content.

**Surfaces:**

- Public feed, public profiles (`/u/[username]`), public communities.
- Share buttons + tracked share events (`lib/growth/share.js`, `/api/share`).
- Share cards: Hot Seat burn reports at `/hot-seat/[id]/share`
  (`components/BurnShareCard.js`) — 1080×1080 PNG export + native share.
- OG previews on share landing pages (`/r/[id]`, `/post/[id]`).

**Measurement:** `shares.total7d` + `shares.byChannel` in the growth
snapshot; share conversion is judged with the referral funnel (shared →
visited → signed up → activated → retained).

**Safeguards:** no login walls on public value; share recording is
server-validated (only genuinely public content can be shared, RLS-enforced);
no forced watermarking; sharing is always optional.

## 3. Referral loop (user)

**Mechanism:** user receives a unique invite link (`/s/CODE`) → shares with a
relevant person → person visits (visit token, rate-capped) → person signs up
(conversion claimed, self-referral-proof) → person activates (strong
first-value activity within 7 days) → referrer earns 50 karma (idempotent,
max 10/month).

**Surfaces:** `/invite` hub (`components/growth/InviteClient.js`), "Invite"
link in the app header, `/s/[code]` landing page (served via middleware
rewrite from `/api/s/[code]` so deep links never 404 and attribution needs no
client JS).

**Measurement:** `referral.visits7d`, `conversions7d`, `conversionRatePct`,
`activatedConverted7d` in the snapshot; per-user stats via
`get_referral_summary`; K-factor estimate (`virality.kFactorEstimate`).

**Safeguards:** rewards are granted ONLY for activated conversions (SQL-side
activation check); idempotent per visit; monthly cap; self-referrals never
convert; visit tokens are opaque and cannot be forged; rewards sweep is
service-role-only (`sweep_referral_rewards`).

## 4. Challenge viral loop

**Mechanism:** user joins a challenge → creates an entry → entry can be
shared → friends discover the challenge → friends join → more entries → more
discovery → challenge expands.

**Surfaces:** `/challenges`, `/challenge/[slug]`, `/friend-challenge`,
invite tokens, shareable entries.

**Safeguards:** participation is real (server-validated), no fake entries, no
vote manipulation, invite volume is never rewarded (only participation is,
and only modestly — see `REP_EVENTS.CHALLENGE_PARTICIPATED`).

## 5. Battle viral loop

**Mechanism:** user starts a battle → invites a friend → audience
participates → the result is shareable → new users discover the battle → new
battles start.

**Safeguards:** battles stay fun/fair/safe; share attribution is real; no
fabricated battle activity.

## 6. Community growth loop

**Mechanism:** community → valuable discussions → members invite relevant
people → more knowledge → better discussions → higher retention → stronger
community identity.

**Safeguards:** no mass-invite incentives; community invites are member
intent-driven; empty communities are never promoted (seeding uses real
users/hosts, never fake members).

## 7. User growth loop

**Mechanism:** user joins → finds an audience → creates content →
audience shares → new audience discovers the user → new users see the
opportunity → more content supply.

**Surfaces:** `/insights` (private user insights), public profiles, user
analytics.

**Safeguards:** no promise of instant fame; analytics are real; users can
always point people at their BurnBoard profile — never at paid or fake
growth.

## 8. Network effects (measured, never claimed without evidence)

| Effect | Mechanism | Measured by |
| --- | --- | --- |
| Social | more people → more relevant connections | follows, density |
| Content | more creators → more valuable content | content supply, discovery success |
| Community | more members → better discussions | community activity |
| Creator | audience attracts creators and vice versa | creator retention + audience growth |
| Data/personalization | more signals → better recommendations | rec_events volume, rec quality |

---

## Fraud & abuse controls (all loops)

1. **Referral fraud:** opaque tokens, server-only writes, idempotent claims,
   self-referral-proof, visit rate caps (200/hour/code), reward monthly cap.
2. **Share spam:** per-IP rate limits on `/api/share`, idempotency keys.
3. **Engagement manipulation:** RLS validates every share/reaction against
   genuinely visible content; no fake accounts, no seeded engagement.
4. **Growth alerting:** `/api/growth/alerts` detects retention cliffs,
   activation drops, referral visit spikes with collapsing conversion, and
   signup anomalies — surfaced in `/admin/growth` so failures are caught
   before they compound.

## Loop health questions

- Does the loop reward REAL activation (not registration)?
- Would a user be embarrassed to send the link/message?
- Does the landing page deliver value before asking for anything?
- Is every number in the loop authentic (never fabricated social proof)?
- Does the loop have a rate limit / cap / idempotency guard?

If the answer to any is no, the loop is not ready to ship.