/**
 * BURNBOARD Personalization — Central Configuration (Master Prompt 12)
 *
 * Single source of truth for recommendation tuning:
 *   - signal strengths (how strongly a behavior moves the interest graph)
 *   - ranking weights (freshness, affinity, popularity, diversity, exploration)
 *   - feedback sensitivity (proportional negative learning)
 *
 * Server-side only. Internal weights and scores are NEVER exposed to users;
 * the feed only ever emits product-level explanation strings.
 */

// ── Behavioral signal strengths ─────────────────────────────
// Every signal is a real platform behavior or explicit user choice. Weak
// signals (views) weigh far less than strong ones (follows, comments).
export const SIGNAL_STRENGTH = {
  content_viewed: 0.15,
  content_opened: 0.3,
  content_reacted: 1.0,
  content_commented: 1.5,
  content_replied: 1.4,
  content_shared: 2.0,
  content_hidden: 0.1,            // tiny negative: "this one wasn't for me"
  not_interested: 2.0,            // explicit negative on every captured scope
  show_less_creator: 1.5,         // explicit creator-level negative
  user_followed: 2.5,             // strong creator signal
  user_unfollowed: 1.2,           // creator negative
  community_joined: 2.5,          // strong community signal
  community_left: 1.2,            // community negative
  challenge_participated: 1.2,
  challenge_invite_accepted: 1.0,
  battle_voted: 0.6,
  topic_viewed: 0.2,
};

// Default polarity per event (overridable through event context).
export const EVENT_POLARITY = {
  content_viewed: 'positive',
  content_opened: 'positive',
  content_reacted: 'positive',
  content_commented: 'positive',
  content_replied: 'positive',
  content_shared: 'positive',
  content_hidden: 'negative',
  not_interested: 'negative',
  show_less_creator: 'negative',
  user_followed: 'positive',
  user_unfollowed: 'negative',
  community_joined: 'positive',
  community_left: 'negative',
  challenge_participated: 'positive',
  challenge_invite_accepted: 'positive',
  battle_voted: 'positive',
  topic_viewed: 'positive',
};

// ── Ranking weights ─────────────────────────────────────────
// Affinity factors are normalized to ~[0, 1] then weighted. Weights below
// are significance multipliers — tuned conservatively so no single signal
// dominates and discovery always survives.
export const RANKING_WEIGHTS = {
  following: 0.6,          // content from people you chose to follow
  creatorAffinity: 1.0,    // creators you keep engaging with
  communityAffinity: 1.0,  // communities you joined or engage with
  topicRelevance: 1.0,     // topics you selected / engage with
  typeAffinity: 0.5,       // content formats you prefer
  popularity: 0.9,         // recent unique engagement (never raw totals alone)
  freshness: 0.8,          // time decay
  exploration: 1.0,        // controlled discovery of new/under-discovered content
  creatorQuality: 0.35,    // consistent per-post engagement quality (not follower count)
  creatorNegative: 3.0,    // suppression strength for creator negatives
  communityNegative: 1.5,
  typeNegative: 1.0,
};

// ── Freshness (time decay) ──────────────────────────────────
export const FRESHNESS = {
  // Half-life in hours for the freshness component of a candidate.
  halfLifeHours: 36,
  // Older than this (hours) a candidate stops being considered at all.
  maxAgeHours: 168, // 7 days
};

// ── Affinity decay ──────────────────────────────────────────
export const AFFINITY = {
  // Half-life in days: an interest halves (in the stored magnitude) after
  // this long without any new signal — interests must be allowed to fade.
  halfLifeDays: 14,
  // Cap applied when accumulating a dimension so a single runaway creator
  // or topic cannot crowd out everything else.
  maxAccumulated: 20,
};

// ── Diversity ───────────────────────────────────────────────
export const DIVERSITY = {
  // Greedy re-ranking: penalize a candidate when the same creator /
  // community / format already appeared within the last N picks.
  creatorWindow: 2,
  creatorPenalty: 0.55,
  communityWindow: 3,
  communityPenalty: 0.7,
  typeWindow: 4,
  typePenalty: 0.85,
};

// ── Creator quality (from candidate aggregates already in memory) ─
// Quality = consistent per-post engagement, log-normalized. Volume and
// follower count never enter: a small creator with excellent posts outscores
// a prolific creator with flat engagement. Computed over the candidates
// already fetched for this request — zero additional database reads.
export const CREATOR_QUALITY = {
  // log1p denominator: avg engagement of ~40/post saturates the signal.
  saturationEngagement: 40,
};

// ── Viral velocity: temporary launch boost ──────────────────────
// A post earning strong quality engagement shortly after publishing gets a
// small, strictly temporary distribution boost. It decays automatically:
// velocity = engagement / (ageHours + 2) collapses as the post ages, and the
// boost only applies inside the launch window. Old posts with large lifetime
// totals can never ride this — their velocity is near zero.
export const VIRAL = {
  launchWindowHours: 12,
  launchVelocityNormThreshold: 0.5,
  launchBoost: 0.25,
};

// ── Exploration vs exploitation ─────────────────────────────
export const EXPLORATION = {
  // Minimum number of exploration picks to preserve per page when an
  // exploration pool exists (small, controlled portion of the feed).
  minPerPage: 2,
  // Candidates qualify for exploration when the author is not followed,
  // content is fresh, and total engagement is low (under-discovered).
  maxEngagementToExplore: 3,
  freshWindowHours: 48,
};

// ── Candidate generation bounds ─────────────────────────────
export const CANDIDATE_POOL = {
  followingAuthorLimit: 500,   // most recent follows considered
  followingPosts: 120,
  affinityCreatorPosts: 60,
  communityPosts: 150,
  globalFreshPosts: 250,       // recency window applies (FRESHNESS.maxAgeHours)
  explorationPosts: 80,
  maxCandidates: 400,
  // Engagement is computed against this many ranked candidates per request.
  aggregateLimit: 240,
};

// ── Cold start ──────────────────────────────────────────────
export const COLD_START = {
  // Users who haven't followed anyone, joined a community, picked
  // interests, or accumulated signals get the cold-start experience.
  interestsToSuggest: 12,
};

// ── Explicit feedback sensitivity ───────────────────────────
// One "not interested" must not erase a whole category. Sensitivity is
// proportional: a repeated pattern is required to meaningfully suppress.
export const FEEDBACK = {
  minNotInterestedForStrongSuppression: 2, // creator/community repeated twice
  singleNegativeMultiplier: 0.55,          // applied to matching candidates
  repeatedNegativeMultiplier: 0.25,        // applied after repeated feedback
};

// ── Content quality in ranking (Master Prompt 27, second pass) ──
// The MP17 worker writes understanding metadata (quality_score, language,
// topics, source) into ai_content_metadata. Ranking must not let clearly
// low-quality content ride a popularity wave, but it must also never punish
// new/legitimate content on weak evidence:
//   - Only REAL provider rows count as evidence (source != 'builtin'): the
//     builtin fallback runs with no provider key and must never shape what
//     users see.
//   - Only clearly-low scores dampen — and they dampen the POPULARITY term
//     only, never the whole fit. Nothing is ever removed by this signal;
//     moderation remains the only removal authority.
//   - Missing metadata (the common case until a provider is enabled) means
//     no change at all.
export const QUALITY = {
  lowScore: 0.4,              // quality_score below this counts as low
  popularityMultiplier: 0.35, // multiply the popularity term by this
};
