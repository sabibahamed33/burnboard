/**
 * BURN BOARD — Server-Side Rate Limiting
 * 
 * In-memory rate limiting for API endpoints.
 * Works in Vercel serverless (per-instance, not distributed).
 * 
 * Strategy:
 * - Per-IP rate limiting for mutations
 * - Per-subject limiting for authenticated users
 * - Sliding window algorithm
 * - Non-discriminatory (same limits for all users)
 * - Compatible with legitimate viral traffic (reasonable limits)
 */

// ── Rate Limit Store ─────────────────────────────────────────
const rateLimitStore = new Map();

// ── Default Limits ───────────────────────────────────────────
export const RATE_LIMITS = {
  // Roast submission: 5 per 10 minutes
  ROAST_CREATE: {
    windowMs: 10 * 60 * 1000,  // 10 minutes
    maxRequests: 5,
  },
  
  // Hot seat creation: 3 per hour
  HOT_SEAT_CREATE: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 3,
  },
  
  // Reaction submission: 30 per minute
  REACTION_CREATE: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 30,
  },
  
  // Battle voting: 20 per minute
  BATTLE_VOTE: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 20,
  },
  
  // General API reads: 60 per minute
  API_READ: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 60,
  },
  
  // Authentication attempts: 10 per 5 minutes
  AUTH: {
    windowMs: 5 * 60 * 1000,  // 5 minutes
    maxRequests: 10,
  },
  
  // Share card generation: 20 per minute
  SHARE_CARD: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 20,
  },
  
  // Report submission: 10 per hour
  REPORT: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 10,
  },
  
  // Community creation: 3 per hour (anti-community-spam)
  COMMUNITY_CREATE: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 3,
  },

  // Challenge creation: 3 per hour (anti-challenge-spam)
  CHALLENGE_CREATE: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 3,
  },

  // Challenge invitations: 20 per hour per user (anti-invitation-spam)
  CHALLENGE_INVITE: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 20,
  },

  // Comment creation: 10 per minute (generous for threads, stops floods)
  COMMENT_CREATE: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 10,
  },

  // Comment reactions: 30 per minute
  COMMENT_REACT: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 30,
  },

  // Follow/unfollow toggles: 30 per minute (normal users rarely exceed a few)
  FOLLOW: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 30,
  },

  // Share recording: 30 per minute (share-link bursts from the UI)
  SHARE: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 30,
  },

  // Challenge voting: 20 per minute per user (switching counts too)
  CHALLENGE_VOTE: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 20,
  },

  // Direct messages: 20 sends per minute (flood protection), 10 new
  // conversations per hour (unsolicited-contact protection)
  DM_SEND: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 20,
  },
  DM_THREAD_CREATE: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 10,
  },
};

// ── Core Rate Limiter ────────────────────────────────────────

/**
 * Check if a request is allowed under the rate limit.
 * Uses sliding window algorithm.
 * 
 * @param {string} key - Rate limit key (usually IP hash or user ID)
 * @param {object} limit - Rate limit config { windowMs, maxRequests }
 * @returns {object} { allowed, remaining, resetAt, retryAfterMs }
 */
export function checkRateLimit(key, limit) {
  const { windowMs, maxRequests } = limit;
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Get or create entry
  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { requests: [] };
    rateLimitStore.set(key, entry);
  }
  
  // Remove expired requests (sliding window)
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);
  
  // Check limit
  const currentCount = entry.requests.length;
  const allowed = currentCount < maxRequests;
  
  if (allowed) {
    entry.requests.push(now);
  }
  
  // Calculate reset time
  const oldestRequest = entry.requests[0];
  const resetAt = oldestRequest ? oldestRequest + windowMs : now + windowMs;
  const retryAfterMs = allowed ? 0 : Math.max(0, resetAt - now);
  
  return {
    allowed,
    remaining: Math.max(0, maxRequests - currentCount - (allowed ? 1 : 0)),
    resetAt,
    retryAfterMs,
    currentCount,
    maxRequests,
  };
}

/**
 * Express-style middleware for rate limiting.
 * Returns 429 response if rate limited.
 */
export function rateLimitMiddleware(key, limit) {
  const result = checkRateLimit(key, limit);
  
  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
    // Record a centralized safety event (anti-spam/abuse signal). This is
    // fire-and-forget: rate limiting must never depend on the safety store.
    try {
      const action = String(key).split(':')[0];
      const prefix = String(key).split(':')[1] || 'unknown';
      import('@/lib/safety').then(({ recordSafetyEvent }) => {
        recordSafetyEvent({
          eventType: 'rate_limit_triggered',
          targetType: 'rate_limit',
          targetId: `${action}:${prefix}`,
          riskLevel: 'low',
          metadata: { limit: result.maxRequests, windowMs: limit.windowMs },
        });
      }).catch(() => {});
    } catch {}
    return {
      blocked: true,
      response: {
        error: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds,
        limit: result.maxRequests,
        remaining: 0,
      },
      retryAfterSeconds,
    };
  }
  
  return {
    blocked: false,
    remaining: result.remaining,
  };
}

/**
 * Get client IP from request headers.
 * Handles Vercel/Cloudflare/proxy headers.
 */
export function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Create a rate limit key from IP.
 */
export function ipKey(ip, prefix = 'rl') {
  return `${prefix}:${ip}`;
}

// ── Cleanup ──────────────────────────────────────────────────

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      // Remove entries with no recent requests
      if (entry.requests.length === 0 || 
          entry.requests[entry.requests.length - 1] < now - 60 * 60 * 1000) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

// ── Stats ────────────────────────────────────────────────────

export function getRateLimitStats() {
  return {
    activeKeys: rateLimitStore.size,
  };
}
