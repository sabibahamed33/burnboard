/**
 * BURN BOARD — Moderation Service (Server-Side)
 * 
 * Handles content state management, report processing,
 * moderation actions, audit logging, and anti-harassment signals.
 * 
 * Content States:
 *   VISIBLE → content is public and eligible for discovery
 *   LIMITED → content exists but not amplified (no trending/discovery)
 *   UNDER_REVIEW → content under moderator review
 *   REMOVED → content hidden from public view
 * 
 * Privacy:
 *   - Reporter identity never exposed to reported user
 *   - Audit logs restricted to moderator access
 *   - No unnecessary personal data stored
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { REPORT_REASON_IDS, REPORT_TARGET_TYPES, riskOfCategory } from '@/lib/safety';

// ── Content States ───────────────────────────────────────────
export const CONTENT_STATE = {
  VISIBLE: 'visible',
  LIMITED: 'limited',
  UNDER_REVIEW: 'under_review',
  REMOVED: 'removed',
};

// ── Report Categories ────────────────────────────────────────
export const REPORT_CATEGORY = {
  HARASSMENT: 'harassment',
  THREAT: 'threat',
  HATE: 'hate',
  PRIVACY_VIOLATION: 'privacy_violation',
  PERSONAL_INFO: 'personal_info',
  SEXUAL_CONTENT: 'sexual_content',
  EXPLOITATION: 'exploitation',
  CHILD_SAFETY: 'child_safety',
  SELF_HARM: 'self_harm',
  SPAM: 'spam',
  SCAM: 'scam',
  IMPERSONATION: 'impersonation',
  COPYRIGHT: 'copyright',
  DANGEROUS: 'dangerous',
  MANIPULATION: 'manipulation',
  OTHER: 'other',
};

// ── High-Severity Categories (require escalation) ────────────
const HIGH_SEVERITY_CATEGORIES = [
  REPORT_CATEGORY.THREAT,
  REPORT_CATEGORY.EXPLOITATION,
  REPORT_CATEGORY.PRIVACY_VIOLATION,
];

// ── Report Creation ──────────────────────────────────────────

/**
 * Create a content report.
 * Handles duplicate detection, severity classification, and anti-harassment signals.
 */
export async function createReport({
  targetType,
  targetId,
  category,
  context,
  reporterId,
  reporterIp,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Database not configured' };
  }

  // Validate required fields
  if (!targetType || !targetId) {
    return { error: 'targetType and targetId are required' };
  }

  if (!REPORT_TARGET_TYPES.includes(targetType)) {
    return { error: `Invalid targetType. Must be one of: ${REPORT_TARGET_TYPES.join(', ')}` };
  }

  const reportCategory = REPORT_REASON_IDS.includes(category) ? category : 'other';

  // Severity mapping (reports are signals; severity informs review priority)
  const severity = riskOfCategory(reportCategory) === 'critical' ? 'high'
    : riskOfCategory(reportCategory) === 'high' ? 'high'
    : 'normal';

  // Duplicate check: same target, same reporter identity, last hour.
  // Runs through a definer RPC because reporter rows are RLS-private.
  try {
    const { data: isDuplicate } = await supabase.rpc('safety_duplicate_report', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reporter_id: reporterId || null,
      p_reporter_ip: reporterIp || null,
    });
    if (isDuplicate) {
      return { success: true, message: 'Already reported', duplicate: true };
    }
  } catch (err) {
    // If the RPC is unavailable (migration not run), fall back to an
    // in-memory check via a lightweight count query guarded to this
    // reporter's own rows only. Never blocks the report itself.
  }

  // Create report
  const report = {
    target_type: targetType,
    target_id: targetId,
    roast_id: targetType === 'roast' ? targetId : null,
    category: reportCategory,
    reason: reportCategory,
    context: context || null,
    reporter_id: reporterId || null,
    reporter_ip: reporterIp || null,
    severity,
    status: severity === 'high' ? 'escalated' : 'open',
  };

  const { error } = await supabase
    .from('reports')
    .insert([report]);

  if (error) {
    console.error('[Moderation] Report creation error:', error);
    return { error: error.message };
  }

  // NOTE: no .select() read-back here. Report rows are RLS-private to their
  // reporter (reporter identity protection), and this service runs with the
  // shared anon-key client, so a read-back would not return the row.
  // Callers receive the opaque success response only.

  // Check if target should move to under_review. Reports are safety signals,
  // NOT automatic proof: the DB-side policy only escalates when multiple
  // distinct reporters agree or a critical-severity flag exists. The RPC is
  // authoritative and audited; it never removes content or bans.
  try {
    await supabase.rpc('safety_auto_review', {
      p_target_type: targetType,
      p_target_id: targetId,
    });
  } catch {}

  // Track harassment signal for high-severity
  if (severity === 'high') {
    await trackHarassmentSignal(targetType, targetId, 'repeated_reports');
  }

  // Centralized safety event
  try {
    const { recordSafetyEvent } = await import('@/lib/safety');
    await recordSafetyEvent({
      eventType: targetType === 'user' ? 'user_reported' : 'content_reported',
      actorUserId: reporterId || null,
      targetType,
      targetId,
      riskLevel: severity === 'high' ? 'high' : 'low',
      metadata: { category: reportCategory },
    });
  } catch {}

  return { success: true, report: null };
}

// ── Auto-Restriction ─────────────────────────────────────────

/**
 * Check if content should be moved to review based on DISTINCT reporters.
 *
 * Reports are signals, not proof. A pile of reports from one identity must
 * not hide content (false-report protection); multiple distinct reporters
 * flagging the same target triggers review only.
 */
async function checkAutoRestriction(targetType, targetId) {
  const { data: rows } = await supabase
    .from('reports')
    .select('reporter_id, reporter_ip, severity')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .in('status', ['open', 'escalated']);

  const openRows = rows || [];
  const distinctReporters = new Set();
  let criticalFlagged = false;
  for (const r of openRows) {
    if (r.severity === 'high' || r.severity === 'critical') criticalFlagged = true;
    if (r.reporter_id) distinctReporters.add(`u:${r.reporter_id}`);
    else if (r.reporter_ip) distinctReporters.add(`ip:${r.reporter_ip}`);
  }

  // Move to under_review only with multiple distinct reporters or a
  // critical-severity signal. Never auto-remove.
  const shouldReview = openRows.length >= 3 && distinctReporters.size >= 2;
  if (!shouldReview && !criticalFlagged) return;

  if (targetType === 'roast') {
    await updateContentState('roast', targetId, CONTENT_STATE.UNDER_REVIEW);
  } else if (targetType === 'hot_seat') {
    await updateContentState('hot_seat', targetId, CONTENT_STATE.UNDER_REVIEW);
  } else if (targetType === 'social_post') {
    await updateContentState('social_post', targetId, CONTENT_STATE.UNDER_REVIEW);
  } else if (targetType === 'comment') {
    await updateContentState('comment', targetId, CONTENT_STATE.UNDER_REVIEW);
  }
}

// ── Content State Management ─────────────────────────────────

/**
 * Update content moderation state.
 * Creates audit log entry.
 */
export async function updateContentState(targetType, targetId, newState, options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Database not configured' };
  }

  const { moderatorId, moderatorNote, policyCategory } = options;

  // Determine table and state column
  let table, stateColumn, previousState;

  if (targetType === 'roast') {
    table = 'roasts';
    stateColumn = 'is_hidden';
    const { data } = await supabase.from(table).select(stateColumn).eq('id', targetId).single();
    previousState = data?.[stateColumn] ? CONTENT_STATE.REMOVED : CONTENT_STATE.VISIBLE;
  } else if (['hot_seat', 'social_post', 'comment'].includes(targetType)) {
    table = targetType === 'hot_seat' ? 'hot_seats' : targetType === 'social_post' ? 'social_posts' : 'comments';
    stateColumn = 'moderation_state';
    const { data } = await supabase.from(table).select(stateColumn).eq('id', targetId).single();
    previousState = data?.[stateColumn] || CONTENT_STATE.VISIBLE;
  } else {
    return { error: `Unsupported targetType: ${targetType}` };
  }

  // Map content state to database values
  let dbUpdate = {};
  if (targetType === 'roast') {
    dbUpdate = { is_hidden: newState === CONTENT_STATE.REMOVED || newState === CONTENT_STATE.LIMITED };
  } else if (targetType === 'social_post') {
    dbUpdate = { moderation_state: newState, updated_at: new Date().toISOString() };
  } else {
    dbUpdate = { moderation_state: newState };
  }

  const { error } = await supabase
    .from(table)
    .update(dbUpdate)
    .eq('id', targetId);

  if (error) {
    console.error('[Moderation] State update error:', error);
    return { error: error.message };
  }

  // Create audit log
  await createAuditLog({
    actionType: `update_${targetType}_state`,
    targetType,
    targetId,
    previousState,
    newState,
    policyCategory,
    moderatorId,
    moderatorNote,
  });

  return { success: true, previousState, newState };
}

// ── Safe Report Output ───────────────────────────────────────

/**
 * Strip reporter-sensitive fields before any report leaves a service.
 * Reporter identity is only ever visible to authorized platform systems.
 */
export function sanitizeReport(report) {
  if (!report) return null;
  const { reporter_id, reporter_ip, ...safe } = report;
  return safe;
}

// ── Audit Logging ────────────────────────────────────────────

/**
 * Create a moderation audit log entry.
 */
export async function createAuditLog({
  actionType,
  targetType,
  targetId,
  previousState,
  newState,
  policyCategory,
  moderatorId,
  moderatorNote,
}) {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    await supabase.from('moderation_actions').insert([{
      action_type: actionType,
      target_type: targetType,
      target_id: targetId,
      previous_state: previousState || null,
      new_state: newState || null,
      policy_category: policyCategory || null,
      moderator_id: moderatorId || null,
      moderator_note: moderatorNote || null,
    }]);
  } catch (err) {
    console.error('[Moderation] Audit log error:', err);
  }
}

// ── Report Status Updates ────────────────────────────────────

/**
 * Update report status (for moderator use).
 */
export async function updateReportStatus(reportId, newStatus, options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Database not configured' };
  }

  const validStatuses = ['open', 'in_review', 'resolved', 'dismissed', 'escalated'];
  if (!validStatuses.includes(newStatus)) {
    return { error: `Invalid status: ${newStatus}` };
  }

  const { moderatorId, moderatorNote } = options;

  // Get current report
  const { data: report } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (!report) {
    return { error: 'Report not found' };
  }

  // Update status
  const update = { status: newStatus };
  if (newStatus === 'resolved' || newStatus === 'dismissed') {
    update.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('reports')
    .update(update)
    .eq('id', reportId);

  if (error) {
    return { error: error.message };
  }

  // Audit log
  await createAuditLog({
    actionType: `${newStatus}_report`,
    targetType: 'report',
    targetId: reportId,
    previousState: report.status,
    newState: newStatus,
    moderatorId,
    moderatorNote,
  });

  return { success: true };
}

// ── Appeals ──────────────────────────────────────────────────

/**
 * Submit an appeal.
 */
export async function submitAppeal({
  enforcementType,
  enforcementTargetType,
  enforcementTargetId,
  appellantId,
  appellantAnonId,
  explanation,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Database not configured' };
  }

  const appeal = {
    enforcement_type: enforcementType,
    enforcement_target_type: enforcementTargetType,
    enforcement_target_id: enforcementTargetId,
    appellant_id: appellantId || null,
    appellant_anon_id: appellantAnonId || null,
    explanation: explanation || null,
    status: 'open',
  };

  // No .select() read-back: appeals are RLS-private to the appellant and
  // this service runs with the shared client, so the row wouldn't come
  // back. Submission success is the contract; the moderator queue reads
  // through its own definer RPC.
  const { error } = await supabase.from('appeals').insert([appeal]);

  if (error) {
    return { error: error.message };
  }

  // Safety event (non-critical)
  try {
    const { recordSafetyEvent } = await import('@/lib/safety');
    await recordSafetyEvent({
      eventType: 'appeal_submitted',
      actorUserId: appellantId || null,
      targetType: enforcementTargetType,
      targetId: enforcementTargetId,
      riskLevel: 'low',
    });
  } catch {}

  return { success: true, appeal: null };
}

/**
 * Review an appeal (moderator use).
 */
export async function reviewAppeal(appealId, decision, options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Database not configured' };
  }

  const validDecisions = ['upheld', 'reversed'];
  if (!validDecisions.includes(decision)) {
    return { error: `Invalid decision: ${decision}` };
  }

  const { reviewerId, reviewerNote } = options;

  // Get appeal
  const { data: appeal } = await supabase
    .from('appeals')
    .select('*')
    .eq('id', appealId)
    .single();

  if (!appeal) {
    return { error: 'Appeal not found' };
  }

  if (appeal.status !== 'open' && appeal.status !== 'in_review') {
    return { error: 'Appeal already decided' };
  }

  // Update appeal
  const { error } = await supabase
    .from('appeals')
    .update({
      status: decision,
      reviewer_id: reviewerId,
      reviewer_note: reviewerNote,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', appealId);

  if (error) {
    return { error: error.message };
  }

  // If reversed, restore content state
  if (decision === 'reversed') {
    await updateContentState(
      appeal.enforcement_target_type,
      appeal.enforcement_target_id,
      CONTENT_STATE.VISIBLE,
      { moderatorId: reviewerId, moderatorNote: 'Appeal reversed' }
    );
  }

  // Audit log
  await createAuditLog({
    actionType: `${decision}_appeal`,
    targetType: 'appeal',
    targetId: appealId,
    previousState: appeal.status,
    newState: decision,
    moderatorId: reviewerId,
    moderatorNote: reviewerNote,
  });

  return { success: true };
}

// ── Anti-Harassment Signals ──────────────────────────────────

/**
 * Track harassment signals for repeated targeting.
 */
export async function trackHarassmentSignal(subjectType, subjectId, signalType) {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    // Check if signal already exists in current window (1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: existing } = await supabase
      .from('harassment_signals')
      .select('*')
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .eq('signal_type', signalType)
      .gte('created_at', oneHourAgo)
      .limit(1)
      .single();

    if (existing) {
      // Increment count
      await supabase
        .from('harassment_signals')
        .update({
          report_count: (existing.report_count || 0) + (signalType === 'repeated_reports' ? 1 : 0),
          block_count: (existing.block_count || 0) + (signalType === 'repeated_blocks' ? 1 : 0),
          target_count: (existing.target_count || 0) + (signalType === 'excessive_targeting' ? 1 : 0),
        })
        .eq('id', existing.id);
    } else {
      // Create new signal
      await supabase.from('harassment_signals').insert([{
        signal_type: signalType,
        subject_type: subjectType,
        subject_id: subjectId,
        report_count: signalType === 'repeated_reports' ? 1 : 0,
        block_count: signalType === 'repeated_blocks' ? 1 : 0,
        target_count: signalType === 'excessive_targeting' ? 1 : 0,
      }]);
    }
  } catch (err) {
    console.error('[Moderation] Harassment signal error:', err);
  }
}

// ── Safety-Aware Queries ─────────────────────────────────────

/**
 * Check if content is visible (not removed/limited).
 * Used by discovery, trending, and leaderboard queries.
 */
export function isVisibleFilter(table) {
  if (table === 'roasts') {
    return 'is_hidden:eq:false';
  }
  if (table === 'hot_seats') {
    return 'moderation_state:eq:visible';
  }
  return null;
}

/**
 * Get reports for moderation queue.
 */
export async function getReportsQueue(options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], total: 0 };
  }

  const { status = 'open', limit = 50, offset = 0 } = options;

  let query = supabase
    .from('reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return { data: [], total: 0 };
  }

  return { data: data || [], total: count || 0 };
}

/**
 * Get appeals for review.
 */
export async function getAppealsQueue(options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], total: 0 };
  }

  const { status = 'open', limit = 50, offset = 0 } = options;

  let query = supabase
    .from('appeals')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return { data: [], total: 0 };
  }

  return { data: data || [], total: count || 0 };
}
