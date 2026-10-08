# BurnBoard Revenue Model

Master Prompt 24 — the economic operating system: what BurnBoard sells, why
people pay willingly, how creators earn transparently, and the guardrails
that keep revenue from ever degrading the product.

**The one rule that never bends:** user trust > user value > long-term
retention > creator success > sustainable revenue > short-term profit.
BurnBoard never optimizes revenue by making the product worse, and free users
are never made to feel punished.

---

## 1. Free core (Section 3) — never paywalled

The following stay free for everyone, always:

- Discovery, Communities, social interaction, content participation
- Core creation, core profiles, core sharing
- Safety: blocking, reporting, privacy controls, moderation

Monetization only adds optional value on top. Every revenue feature answers:
*can the experience remain useful without payment?* If the answer is no, the
feature is not shipped.

## 2. Revenue layers (Section 2) — diversified, never one source

| Layer | Status | Mechanism |
| --- | --- | --- |
| Platform Premium | Foundation live (MP15) | Optional membership ($4.99/mo, $39.99/yr seeded). Clear value, transparent pricing, end-of-period cancellation. |
| Creator subscriptions | Schema + creation flows (MP19) | Creators offer memberships; access gating + labeling are the remaining rollout gate (Phase 3). |
| Tips | Live (MP15/MP19) | One-time, standardized tiers ($1/$3/$5/$10), self-tip-proof, transparent. |
| Digital goods / paid communities | Schema (MP19) | Permitted products; content gating + trust systems before launch. |
| Advertising | Inventory exists (AdSlot) | Clearly disclosed "Sponsored" placement, frequency-limited, real counts only — no fabricated reach. |
| Brand-creator marketplace | Not before liquidity | Gated on creator density + demand evidence (roadmap Phase 4). |

## 3. Revenue share & take rate (Sections 9–10)

Every creator-tied sale splits as:

```
GROSS → payment processing fee → platform fee → creator earnings (net)
```

The split is **centralized policy** (`REVENUE_SPLIT` in
`lib/monetization/config.js`, env-tunable): platform fee 15%, processing 3%,
creator keeps 82%. Percentages are shown to users in their Insights revenue view
Revenue tab — fees are never hidden. The take rate is competitive,
transparent, and periodically reviewed; changes require clear communication.

## 4. Creator economy (Sections 7–17)

- Creators build audiences, communities, memberships, tips, and (when
  permitted) digital products — never treated as disposable content.
- **Payout lifecycle:** earnings → pending → available → payout request →
  processing → completed. A request moves *available* into *pending* and is
  audited; nothing moves until a compliant provider payout driver processes
  it (no instant-payout promises).
- **Payout guards (server-side, SECURITY DEFINER):** owner-scoped only,
  minimum threshold, one open payout at a time, ledger-consistent moves.
- **Eligibility** (MP19) is configurable and moderation-aware; verification
  is risk-based and only collects what's legally needed.

## 5. Advertising (Sections 19–23)

- Ads are always clearly identifiable as sponsored — never disguised as
  organic content, never sold as ranking.
- Frequency-capped (one slot per N feed items), user-reported, quality-
  reviewed (no scams/malware/misleading offers).
- Targeting is cohort-based and privacy-preserving — never built on selling
  personal data. No fabricated impression/click numbers.

## 6. Financial architecture (Sections 26–38, built in MP15)

- Append-only transaction ledger (purchases + adjustment rows), backend-
  authoritative entitlements, provider abstraction (`cc_sandbox` dev driver;
  Stripe/PayPal config placeholders), idempotent webhook pipeline, creator
  balances derived from the ledger, audit log, reconciliation RPC, refunds
  (service-role only), sandbox isolation (`origin`).
- Money is always integer minor units; no raw card/bank data ever stored.

## 7. Unit economics & health (Sections 40–50)

Tracked (never revenue alone): revenue per active user, refund rate, dispute
rate, payment success, payout health, creator adoption/retention, revenue
concentration, and contribution margin. LTV is modeled responsibly; CAC is
measured by channel; LTV:CAC is a directional indicator, not a vanity number.
Growth is never evaluated without cost context.

## 8. Ethics & decision framework (Sections 85–90)

Every monetization feature passes: TRANSPARENCY, FAIRNESS, USER CONTROL,
PRIVACY, SAFETY, ECONOMIC SUSTAINABILITY. If it fails any, it does not ship.
No hidden charges, no deceptive subscriptions, no forced payments, no
exploitative creator economics, no selling personal user data, no
undisclosed advertising, no fake transaction metrics.

## 9. Scale roadmap (Section 86)

Phase 1 (0–100k): free value + product-market fit; monetization is limited
and experimental. Phase 2 (100k–1M): premium validation + creator
monetization + payment infrastructure + unit economics. Phase 3 (1M–10M):
marketplace, subscriptions, creator economy, international payments.
Phase 4 (10M–100M): advertising, business tools, global payouts, regional
pricing. Phase 5 (100M+): multi-provider global payment resilience,
massive creator economy, compliance, sustainable profitability. Financial
features roll out gradually (feature flags, limited markets, monitoring)
and no single payment provider is ever an uncontrolled single point of
failure.