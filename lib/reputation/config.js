/**
 * BurnBoard Reputation Configuration
 *
 * Centralized configuration for the Burn Rep system: level curve
 * (LEVELS + getLevelInfo — the single source of truth for progression)
 * and reference event point values. Live badge/achievement definitions
 * live in lib/reputation/badges.js (awarded server-side); the daily
 * point values enforced at award time live in app/api/reputation/award.
 *
 * Philosophy: Reward meaningful participation, not noise.
 */

// ── Burn Rep Event Types & Points ──────────────────────────

export const REP_EVENTS = {
  // Content creation
  CONTENT_CREATED: { type: 'content_created', points: 5, description: 'Created content' },
  ROAST_CREATED: { type: 'roast_created', points: 3, description: 'Created a roast' },
  
  // Content engagement (received)
  CONTENT_RECEIVED_UPVOTE: { type: 'content_received_upvote', points: 2, description: 'Received an upvote' },
  CONTENT_RECEIVED_REACTION: { type: 'content_received_reaction', points: 3, description: 'Received a reaction' },
  CONTENT_RECEIVED_COMMENT: { type: 'content_received_comment', points: 4, description: 'Received a comment' },
  
  // Social actions
  FOLLOW_RECEIVED: { type: 'follow_received', points: 5, description: 'Gained a follower' },
  COMMENT_CREATED: { type: 'comment_created', points: 2, description: 'Posted a comment' },
  REACTION_GIVEN: { type: 'reaction_given', points: 1, description: 'Reacted to content' },
  
  // Daily participation
  DAILY_PARTICIPATION: { type: 'daily_participation', points: 10, description: 'Daily activity' },
  STREAK_BONUS: { type: 'streak_bonus', points: 5, description: 'Streak bonus' },
  
  // Poll participation
  POLL_VOTED: { type: 'poll_voted', points: 2, description: 'Voted in a poll' },
  POLL_CREATED: { type: 'poll_created', points: 5, description: 'Created a poll' },
  
  // Communities (Master Prompt 8)
  COMMUNITY_CREATED: { type: 'community_created', points: 5, description: 'Created a community' },
  COMMUNITY_JOINED: { type: 'community_joined', points: 2, description: 'Joined a community' },

  // Challenges (Master Prompt 9) — participation only. Creating challenges or
  // sending invites is intentionally NOT rewarded (anti-spam).
  CHALLENGE_PARTICIPATED: { type: 'challenge_participated', points: 3, description: 'Participated in a challenge' },
  // Challenge wins ARE rewarded (earned competitively, one per challenge).
  CHALLENGE_WON: { type: 'challenge_won', points: 25, description: 'Won a challenge' },
};

// ── Level Definitions ──────────────────────────────────────

export const LEVELS = [
  { level: 1, name: 'Spark',      emoji: '✨', minRep: 0,     color: 'text-zinc-400',     bgColor: 'bg-zinc-400/10' },
  { level: 2, name: 'Ember',      emoji: '🕯',  minRep: 50,    color: 'text-amber-400',    bgColor: 'bg-amber-400/10' },
  { level: 3, name: 'Flame',      emoji: '🔥', minRep: 200,   color: 'text-[#ff4d00]',    bgColor: 'bg-[#ff4d00]/10' },
  { level: 4, name: 'Blaze',      emoji: '💥', minRep: 500,   color: 'text-orange-500',   bgColor: 'bg-orange-500/10' },
  { level: 5, name: 'Inferno',    emoji: '🌋', minRep: 1500,  color: 'text-red-500',      bgColor: 'bg-red-500/10' },
  { level: 6, name: 'Supernova',  emoji: '⭐', minRep: 5000,  color: 'text-amber-300',    bgColor: 'bg-amber-300/10' },
  { level: 7, name: 'Legend',      emoji: '👑', minRep: 15000, color: 'text-yellow-300',   bgColor: 'bg-yellow-300/10' },
];

/**
 * Get level info from karma/rep score
 */
export function getLevelInfo(rep) {
  let currentLevel = LEVELS[0];
  for (const level of LEVELS) {
    if (rep >= level.minRep) {
      currentLevel = level;
    } else {
      break;
    }
  }

  // Calculate progress to next level
  const currentIndex = LEVELS.indexOf(currentLevel);
  const nextLevel = LEVELS[currentIndex + 1] || null;
  
  let progress = 100;
  let progressToNext = 0;
  
  if (nextLevel) {
    const range = nextLevel.minRep - currentLevel.minRep;
    const current = rep - currentLevel.minRep;
    progress = Math.min(100, Math.round((current / range) * 100));
    progressToNext = nextLevel.minRep - rep;
  }

  return {
    ...currentLevel,
    rep,
    progress,
    progressToNext,
    nextLevel: nextLevel ? { name: nextLevel.name, emoji: nextLevel.emoji, minRep: nextLevel.minRep } : null,
    isMaxLevel: !nextLevel,
  };
}

// ── Daily Spark Prompts ────────────────────────────────────

export const DAILY_SPARKS = [
  { title: "Hot Take Hour", prompt: "What's the most overrated thing in your industry?", category: 'opinion' },
  { title: "Unpopular Opinion", prompt: "Defend an opinion most people disagree with.", category: 'debate' },
  { title: "This or That", prompt: "Would you rather have unlimited money or unlimited time?", category: 'poll' },
  { title: "Roast Yourself", prompt: "What's the most embarrassing thing about your online presence?", category: 'roast' },
  { title: "Controversial Take", prompt: "What's a hill you're willing to die on?", category: 'debate' },
  { title: "Hot Seat", prompt: "What's the worst advice you've ever received?", category: 'story' },
  { title: "Red Flag Alert", prompt: "What's an instant red flag in someone's profile?", category: 'opinion' },
  { title: "Would You Rather", prompt: "Would you rather be famous for something stupid or unknown for something brilliant?", category: 'poll' },
  { title: "Unfiltered", prompt: "What's something you wish you could say at work?", category: 'opinion' },
  { title: "Spicy Take", prompt: "What's a trend that needs to die?", category: 'debate' },
  { title: "Tell Your Story", prompt: "What's the most ridiculous thing that happened to you this week?", category: 'story' },
  { title: "Debate Time", prompt: "Is remote work actually better? Make your case.", category: 'debate' },
  { title: "Rate & React", prompt: "What's the worst movie that everyone loves?", category: 'opinion' },
  { title: "First World Problems", prompt: "What's your most ridiculous first world problem?", category: 'story' },
  { title: "Hot Take", prompt: "What's a common practice that's actually toxic?", category: 'debate' },
  { title: "Confession Booth", prompt: "What's a guilty pleasure you're not ashamed of?", category: 'story' },
  { title: "Battle Ready", prompt: "What's the best comeback you've ever used?", category: 'roast' },
  { title: "Reality Check", prompt: "What's something social media gets completely wrong?", category: 'opinion' },
  { title: "Final Verdict", prompt: "What's the most overrated achievement?", category: 'debate' },
  { title: "Hot Seat AMA", prompt: "What's the most controversial opinion you hold?", category: 'debate' },
];

/**
 * Get today's spark prompt
 */
export function getTodaysSpark() {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const index = dayOfYear % DAILY_SPARKS.length;
  return {
    ...DAILY_SPARKS[index],
    date: today.toISOString().split('T')[0],
  };
}
