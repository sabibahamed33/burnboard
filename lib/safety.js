/**
 * BURNBOARD Trust & Safety — Core Service (Master Prompt 11)
 *
 * Centralized safety architecture:
 *   - safety_events            — one record per safety-relevant event
 *   - content_classifications  — every rules/AI/report classification
 *   - moderation_state         — DB-enforced content state (visible/limited/
 *                                under_review/removed) on social content
 *   - user_blocks / user_mutes — relationship stores enforced server-side
 *   - user_restrictions        — action-specific, time-bounded limits
 *
 * Principles:
 *   - Context matters. Roasting is not harassment; repeated targeted abuse
 *     is. Deterministic high-precision rules block; AI/rule signals flag.
 *   - Automation is never an uncontrolled authority: no auto-removal from
 *     AI alone, no auto-ban from report volume alone.
 *   - AI failure is safe: if no provider or a timeout/parse error occurs,
 *     content is unaffected and only a rules classification is recorded.
 *   - Reporter identity and internal risk data never leave server APIs.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isClean } from '@/lib/filter';

// ── Report reasons (user-facing, configurable set) ───────────
export const REPORT_REASONS = [
  { id: 'harassment', label: 'Harassment or bullying', severity: 'high' },
  { id: 'hate', label: 'Hateful or abusive content', severity: 'high' },
  { id: 'threat', label: 'Threats of violence', severity: 'critical' },
  { id: 'spam', label: 'Spam or scam', severity: 'medium' },
  { id: 'impersonation', label: 'Impersonation', severity: 'high' },
  { id: 'non_consensual', label: 'Targeting without consent', severity: 'high' },
  { id: 'privacy_violation', label: 'Private info shared', severity: 'high' },
  { id: 'sexual_content', label: 'Sexually explicit content', severity: 'medium' },
  { id: 'self_harm', label: 'Self-harm concern', severity: 'critical' },
  { id: 'illegal', label: 'Illegal content', severity: 'critical' },
  { id: 'other', label: 'Something else', severity: 'low' },
];

export const REPORT_REASON_IDS = REPORT_REASONS.map(r => r.id);

export const REPORT_TARGET_TYPES = [
  'roast', 'hot_seat', 'battle', 'profile', 'user',
  'social_post', 'comment', 'challenge', 'community',
];

// ── Deterministic policy rules ───────────────────────────────
// High-precision, conservative rules. These BLOCK only explicit policy
// violations (slurs/hate already filtered platform-wide, promotion of
// self-harm, clearly illegal content). Everything else flags for review.
const BLOCK_PATTERNS = {
  hate: {
    reason: 'Hateful or abusive content',
    risk: 'critical',
    test: (t) => !isClean(t),
  },
  self_harm: {
    reason: 'Encouraging self-harm',
    risk: 'critical',
    test: (t) => {
      const n = t.toLowerCase();
      const phrases = [
        'kill yourself', 'just kys', 'go kys', 'you should kys',
        'end yourself', 'do us all a favor and die', 'kill urself',
        'jump off a', 'self harm challenge',
      ];
      return phrases.some(p => n.includes(p));
    },
  },
  illegal: {
    reason: 'Illegal content',
    risk: 'critical',
    test: (t) => {
      const n = t.toLowerCase();
      const phrases = [
        'dm me minors', 'selling guns no license', 'how to make a bomb',
        'buy cocaine from me', 'csam', 'child porn',
      ];
      return phrases.some(p => n.includes(p));
    },
  },
};

// Flag signals (never auto-remove; surface for review + reduce noise later)
const FLAG_PATTERNS = {
  harassment: {
    reason: 'Potential targeted harassment',
    risk: 'medium',
    test: (t) => {
      const n = t.toLowerCase();
      // Direct repeated-name targeting with hostile terms — intentionally
      // conservative to avoid blocking roast culture.
      const hostile = ['worthless piece of', 'nobody likes you', 'delete your account', 'never post again', 'you should be banned'];
      return hostile.some(p => n.includes(p));
    },
  },
  spam_links: {
    reason: 'Possible link spam',
    risk: 'low',
    test: (t) => {
      const links = (t.match(/https?:\/\/[^\s]+/g) || []).length;
      const phones = (t.match(/\+?\d[\d\s-]{8,}\d/g) || []).length;
      return links >= 2 || phones >= 2;
    },
  },
};

/**
 * Deterministic policy check. Returns blocked findings (must reject the
 * write) and flagged findings (async classification, review only).
 */
export function runDeterministicPolicy(text) {
  const findings = [];
  let blocked = false;
  if (!text || typeof text !== 'string') return { blocked: false, findings: [] };

  for (const [category, rule] of Object.entries(BLOCK_PATTERNS)) {
    if (rule.test(text)) {
      blocked = true;
      findings.push({ category, reason: rule.reason, risk: rule.risk, action: 'block', source: 'rules' });
    }
  }
  for (const [category, rule] of Object.entries(FLAG_PATTERNS)) {
    if (rule.test(text)) {
      findings.push({ category, reason: rule.reason, risk: rule.risk, action: 'flag', source: 'rules' });
    }
  }
  return { blocked, findings };
}

// ── Safety events ────────────────────────────────────────────
export async function recordSafetyEvent({
  eventType,
  actorUserId = null,
  targetType = null,
  targetId = null,
  riskLevel = 'low',
  metadata = {},
}) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('safety_events').insert({
      event_type: eventType,
      actor_user_id: actorUserId || null,
      target_type: targetType,
      target_id: targetId ? String(targetId) : null,
      risk_level: riskLevel,
      metadata,
    });
  } catch (err) {
    console.error('[Safety] Event error:', err);
  }
}

/**
 * Persist a classification record (rules/AI). Never claims AI reviewed
 * content the AI did not — the source field is exact.
 */
export async function recordClassification({
  targetType,
  targetId,
  source,
  category,
  riskLevel,
  confidence = null,
  provider = null,
  action = 'none',
  metadata = {},
}) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('content_classifications').insert({
      target_type: targetType,
      target_id: targetId,
      source,
      category,
      risk_level: riskLevel,
      confidence,
      provider,
      action,
      metadata,
    });
  } catch (err) {
    console.error('[Safety] Classification error:', err);
  }
}

// ── AI-assisted moderation (optional, safe-fail) ─────────────
/**
 * Classify text via the configured moderation AI endpoint. If none is
 * configured, or on any timeout/parse/provider error, returns skipped —
 * the caller must treat "no AI" as acceptable (never blocks content).
 */
export async function runAiModeration(text) {
  const endpoint = process.env.AI_MODERATION_ENDPOINT;
  const apiKey = process.env.AI_MODERATION_API_KEY;
  if (!endpoint || !apiKey) {
    return { skipped: true, reason: 'not-configured' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        text: String(text).slice(0, 2000),
        task: 'moderation-classification',
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { skipped: true, reason: `provider-${res.status}` };
    const data = await res.json();
    // Accept either { category, risk, confidence } directly or nested.
    const classification = data.classification || data.result || data;
    const category = String(classification.category || '').toLowerCase();
    const risk = ['low', 'medium', 'high', 'critical'].includes(classification.risk)
      ? classification.risk
      : 'low';
    const confidence = Number(classification.confidence);
    const band = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
      ? Math.round(confidence * 100) / 100
      : null;
    if (!category) return { skipped: true, reason: 'no-category' };
    return {
      skipped: false,
      provider: endpoint.replace(/^https?:\/\//, '').split('/')[0] || 'ai',
      category,
      risk,
      confidence: band,
    };
  } catch (err) {
    return { skipped: true, reason: err?.name === 'AbortError' ? 'timeout' : 'provider-error' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full content policy pipeline for a newly created item.
 *  1. Deterministic rules classification is recorded synchronously-safe.
 *  2. Flagged signals → safety events (never auto-removal).
 *  3. AI analysis runs async and records its own classification. AI output
 *     is advisory only — it never changes content state on its own.
 *
 * This is fire-and-forget; it never blocks or delays the write path.
 */
export async function analyzeContentAsync({
  targetType,
  targetId,
  text,
  authorUserId = null,
}) {
  try {
    if (!isSupabaseConfigured || !supabase) return;

    const { blocked, findings } = runDeterministicPolicy(text);
    const flagged = findings.filter(f => !blocked);

    // Record every rules finding (blocked writes never reached here, but
    // flag-level findings still need to be auditable).
    for (const f of findings) {
      await recordClassification({
        targetType,
        targetId,
        source: 'rules',
        category: f.category,
        riskLevel: f.risk,
        action: f.action === 'block' ? 'flag' : 'none',
      });
    }
    if (flagged.some(f => f.risk === 'medium' || f.risk === 'high')) {
      await recordSafetyEvent({
        eventType: 'content_flagged',
        actorUserId: authorUserId,
        targetType,
        targetId,
        riskLevel: 'medium',
        metadata: { categories: flagged.map(f => f.category) },
      });
    }

    // AI analysis (advisory, safe-fail).
    const ai = await runAiModeration(text);
    if (!ai.skipped) {
      await recordClassification({
        targetType,
        targetId,
        source: 'ai',
        category: ai.category,
        riskLevel: ai.risk,
        confidence: ai.confidence,
        provider: ai.provider,
        action: 'none', // AI is advisory; actions come from policy
      });
      if (ai.risk === 'high' || ai.risk === 'critical') {
        await recordSafetyEvent({
          eventType: 'content_flagged',
          actorUserId: authorUserId,
          targetType,
          targetId,
          riskLevel: ai.risk,
          metadata: { source: 'ai', category: ai.category, confidence: ai.confidence },
        });
      }
    }
  } catch (err) {
    // Safety analysis must never break the product.
    console.error('[Safety] Async analysis error:', err);
  }
}

// ── Enforcement helpers (server-side) ────────────────────────

/**
 * Can the signed-in user perform an action? (restrictions + bans)
 * Requires an SSR client with the user session.
 */
export async function canUserPerform(client, action) {
  if (!client) return true;
  try {
    const { data } = await client.rpc('safety_can_perform', { p_action: action });
    return data !== false;
  } catch {
    return true; // fail-open for reads; write routes double-check auth
  }
}

/**
 * Relationship status between viewer and another user (mutual blocks,
 * viewer mute). Only resolvable for the signed-in viewer (SSR client).
 */
export async function relationshipBetween(client, viewerUserId, otherUserId) {
  const empty = { viewer_blocks_other: false, other_blocks_viewer: false, viewer_mutes_other: false };
  if (!client || !viewerUserId || !otherUserId || viewerUserId === otherUserId) return empty;
  try {
    const { data } = await client.rpc('safety_relationship_between', {
      p_viewer: viewerUserId,
      p_other: otherUserId,
    });
    if (!data) return empty;
    return {
      viewer_blocks_other: !!data.viewer_blocks_other,
      other_blocks_viewer: !!data.other_blocks_viewer,
      viewer_mutes_other: !!data.viewer_mutes_other,
    };
  } catch {
    return empty;
  }
}

/**
 * Batched: does the viewer hide content authored by each of these users?
 * (viewer blocked them, viewer muted them, or they blocked the viewer).
 */
export async function hiddenAuthorIds(client, viewerUserId, authorIds) {
  const hidden = new Set();
  if (!client || !viewerUserId || !authorIds || authorIds.length === 0) return hidden;
  try {
    const unique = [...new Set(authorIds.filter(Boolean))];
    // Chunk to stay well under URL limits
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const [{ data: myBlocks }, { data: myMutes }, { data: blockedMe }] = await Promise.all([
        client.from('user_blocks').select('blocked_id').in('blocked_id', chunk).eq('blocker_id', viewerUserId),
        client.from('user_mutes').select('muted_id').in('muted_id', chunk).eq('muter_id', viewerUserId),
        client.from('user_blocks').select('blocker_id').in('blocker_id', chunk).eq('blocked_id', viewerUserId),
      ]);
      for (const r of myBlocks || []) hidden.add(r.blocked_id);
      for (const r of myMutes || []) hidden.add(r.muted_id);
      for (const r of blockedMe || []) hidden.add(r.blocker_id);
    }
  } catch {
    // Fail-open: relationship data must not break feed reads.
  }
  return hidden;
}

/**
 * Create a block with follow cleanup (server-side).
 */
export async function createBlock({ client, blockerUserId, blockedUserId }) {
  if (!client || !blockerUserId || !blockedUserId || blockerUserId === blockedUserId) {
    return { error: 'Invalid block target' };
  }
  // Remove any follow relationships in both directions
  await client
    .from('follows')
    .delete()
    .or(`and(follower_id.eq.${blockerUserId},following_id.eq.${blockedUserId}),and(follower_id.eq.${blockedUserId},following_id.eq.${blockerUserId})`);

  const { error } = await client.from('user_blocks').insert({
    blocker_id: blockerUserId,
    blocked_id: blockedUserId,
    reason: 'user_blocked',
  });
  if (error) {
    if (error.code === '23505') return { success: true, alreadyBlocked: true };
    return { error: error.message };
  }
  await recordSafetyEvent({
    eventType: 'block_created',
    actorUserId: blockerUserId,
    targetType: 'user',
    targetId: blockedUserId,
    riskLevel: 'low',
  });
  return { success: true };
}

export async function removeBlock({ client, blockerUserId, blockedUserId }) {
  if (!client || !blockerUserId || !blockedUserId) return { error: 'Invalid block target' };
  const { error } = await client
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerUserId)
    .eq('blocked_id', blockedUserId);
  if (error) return { error: error.message };
  await recordSafetyEvent({
    eventType: 'block_removed',
    actorUserId: blockerUserId,
    targetType: 'user',
    targetId: blockedUserId,
  });
  return { success: true };
}

export async function createMute({ client, muterUserId, mutedUserId }) {
  if (!client || !muterUserId || !mutedUserId || muterUserId === mutedUserId) {
    return { error: 'Invalid mute target' };
  }
  const { error } = await client.from('user_mutes').insert({
    muter_id: muterUserId,
    muted_id: mutedUserId,
  });
  if (error) {
    if (error.code === '23505') return { success: true, alreadyMuted: true };
    return { error: error.message };
  }
  await recordSafetyEvent({
    eventType: 'mute_created',
    actorUserId: muterUserId,
    targetType: 'user',
    targetId: mutedUserId,
  });
  return { success: true };
}

export async function removeMute({ client, muterUserId, mutedUserId }) {
  if (!client || !muterUserId || !mutedUserId) return { error: 'Invalid mute target' };
  const { error } = await client
    .from('user_mutes')
    .delete()
    .eq('muter_id', muterUserId)
    .eq('muted_id', mutedUserId);
  if (error) return { error: error.message };
  await recordSafetyEvent({
    eventType: 'mute_removed',
    actorUserId: muterUserId,
    targetType: 'user',
    targetId: mutedUserId,
  });
  return { success: true };
}

// ── Platform moderator identity ─────────────────────────────
/**
 * Resolve whether the request's authenticated user is a platform moderator.
 * Requires the request-scoped SSR client (session JWT). Returns a boolean;
 * never reveals moderator flags for other users.
 */
export async function isPlatformModeratorClient(client) {
  if (!client) return false;
  try {
    const { data } = await client.rpc('is_platform_moderator');
    return data === true;
  } catch {
    return false;
  }
}

// ── Moderator wrappers (SSR moderator account required) ──────
export async function moderatorSetContentState(client, targetType, targetId, state, note) {
  const { data, error } = await client.rpc('safety_set_content_state', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_state: state,
    p_note: note || null,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error) return { error: error.message };
  if (result && result.success === false) return { error: result.error || 'Action failed' };
  return { success: true, ...(result || {}) };
}

export async function moderatorRestrictUser(client, userId, actionType, reason, expiresAt) {
  const { data, error } = await client.rpc('safety_restrict_user', {
    p_user_id: userId,
    p_action_type: actionType,
    p_reason: reason || null,
    p_expires_at: expiresAt || null,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error) return { error: error.message };
  if (result && result.success === false) return { error: result.error || 'Action failed' };
  return { success: true };
}

export async function moderatorLiftRestriction(client, userId, actionType) {
  const { data, error } = await client.rpc('safety_lift_restriction', {
    p_user_id: userId,
    p_action_type: actionType,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error) return { error: error.message };
  if (result && result.success === false) return { error: result.error || 'Action failed' };
  return { success: true };
}

export async function moderatorSetBan(client, userId, banned, reason) {
  const { data, error } = await client.rpc('safety_set_user_ban', {
    p_user_id: userId,
    p_banned: banned,
    p_reason: reason || null,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error) return { error: error.message };
  if (result && result.success === false) return { error: result.error || 'Action failed' };
  return { success: true };
}

export async function moderatorFlaggedQueue(client, limit = 50) {
  try {
    const { data, error } = await client.rpc('safety_admin_flagged', { p_limit: limit });
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

// ── Utility ──────────────────────────────────────────────────
export function riskOfCategory(category) {
  const found = REPORT_REASONS.find(r => r.id === category);
  return found ? found.severity : 'low';
}
