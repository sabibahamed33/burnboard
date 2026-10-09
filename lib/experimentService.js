/**
 * BURN BOARD — Server-Side Experiment Service
 * 
 * DB-backed experiment management using Supabase RPC functions.
 * All experiments are OFF by default and must be explicitly activated.
 * 
 * Lifecycle: DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED
 * 
 * Privacy: No fingerprinting. Uses existing identity only.
 * Aggregate reporting only. No individual-level profiling.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ── Experiment Status Constants ──────────────────────────────
export const EXPERIMENT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

// ── Valid Status Transitions ─────────────────────────────────
const VALID_TRANSITIONS = {
  [EXPERIMENT_STATUS.DRAFT]: [EXPERIMENT_STATUS.ACTIVE],
  [EXPERIMENT_STATUS.ACTIVE]: [EXPERIMENT_STATUS.PAUSED, EXPERIMENT_STATUS.COMPLETED],
  [EXPERIMENT_STATUS.PAUSED]: [EXPERIMENT_STATUS.ACTIVE, EXPERIMENT_STATUS.COMPLETED],
  [EXPERIMENT_STATUS.COMPLETED]: [EXPERIMENT_STATUS.ARCHIVED],
  [EXPERIMENT_STATUS.ARCHIVED]: [],
};

// ── Experiment CRUD ──────────────────────────────────────────

/**
 * Create a new experiment (starts in DRAFT status).
 * All experiments are OFF unless explicitly activated.
 */
export async function createExperiment({
  key,
  name,
  description = '',
  variants = [],
  primaryMetric = null,
  guardrailMetrics = [],
  startAt = null,
  endAt = null,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  // Validate required fields
  if (!key || !name) {
    return { error: 'key and name are required' };
  }

  if (!variants || variants.length < 2) {
    return { error: 'At least 2 variants are required' };
  }

  // Check for duplicate key
  const { data: existing } = await supabase
    .from('experiments')
    .select('id')
    .eq('key', key)
    .single();

  if (existing) {
    return { error: `Experiment with key "${key}" already exists` };
  }

  const { data, error } = await supabase
    .from('experiments')
    .insert([{
      key,
      name,
      description,
      status: EXPERIMENT_STATUS.DRAFT,
      variants: variants,
      primary_metric: primaryMetric,
      guardrail_metrics: guardrailMetrics,
      start_at: startAt,
      end_at: endAt,
    }])
    .select()
    .single();

  if (error) {
    console.error('[ExperimentService] Create error:', error);
    return { error: error.message };
  }

  return { data };
}

/**
 * Get an experiment by key.
 */
export async function getExperimentByKey(key) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null };
  }

  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .eq('key', key)
    .single();

  if (error) return { data: null };
  return { data };
}

/**
 * Get an experiment by ID.
 */
export async function getExperimentById(id) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null };
  }

  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return { data: null };
  return { data };
}

/**
 * Get all experiments (for admin use).
 */
export async function getAllExperiments() {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [] };
  }

  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { data: [] };
  return { data: data || [] };
}

/**
 * Update experiment status with lifecycle validation.
 * Only valid transitions are allowed.
 */
export async function updateExperimentStatus(experimentId, newStatus) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  // Get current experiment
  const { data: experiment } = await supabase
    .from('experiments')
    .select('*')
    .eq('id', experimentId)
    .single();

  if (!experiment) {
    return { error: 'Experiment not found' };
  }

  // Validate transition
  const allowed = VALID_TRANSITIONS[experiment.status] || [];
  if (!allowed.includes(newStatus)) {
    return {
      error: `Invalid transition: ${experiment.status} → ${newStatus}. Allowed: ${allowed.join(', ')}`,
    };
  }

  // Build update
  const update = { status: newStatus };

  // Auto-set timestamps on lifecycle changes
  if (newStatus === EXPERIMENT_STATUS.ACTIVE && !experiment.start_at) {
    update.start_at = new Date().toISOString();
  }
  if (newStatus === EXPERIMENT_STATUS.COMPLETED) {
    update.end_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('experiments')
    .update(update)
    .eq('id', experimentId)
    .select()
    .single();

  if (error) {
    console.error('[ExperimentService] Update error:', error);
    return { error: error.message };
  }

  return { data };
}

/**
 * Update experiment configuration.
 */
export async function updateExperiment(experimentId, updates) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: 'Supabase not configured' };
  }

  // Only allow updating certain fields on draft experiments
  const { data: experiment } = await supabase
    .from('experiments')
    .select('status')
    .eq('id', experimentId)
    .single();

  if (!experiment) {
    return { error: 'Experiment not found' };
  }

  if (experiment.status !== EXPERIMENT_STATUS.DRAFT) {
    return { error: 'Can only edit draft experiments' };
  }

  const allowedUpdates = {};
  const allowedFields = ['name', 'description', 'variants', 'primary_metric', 'guardrail_metrics', 'start_at', 'end_at'];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      allowedUpdates[field] = updates[field];
    }
  }

  if (Object.keys(allowedUpdates).length === 0) {
    return { error: 'No valid fields to update' };
  }

  const { data, error } = await supabase
    .from('experiments')
    .update(allowedUpdates)
    .eq('id', experimentId)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data };
}

// ── Variant Assignment ───────────────────────────────────────

/**
 * Get or create a stable variant assignment for a subject.
 * Uses Supabase RPC for deterministic, persistent assignment.
 * 
 * @param {string} experimentKey - Experiment key
 * @param {string} subjectId - User ID or anonymous session ID
 * @returns {string|null} - Assigned variant or null
 */
export async function getVariantAssignment(experimentKey, subjectId) {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  if (!experimentKey || !subjectId) {
    return null;
  }

  try {
    // Get experiment via RPC
    const { data: experiment, error: expError } = await supabase
      .rpc('get_experiment_by_key', { p_key: experimentKey });

    if (expError || !experiment || experiment.length === 0) {
      return null;
    }

    const exp = experiment[0];

    // Check if experiment is within time bounds
    if (exp.start_at && new Date(exp.start_at) > new Date()) {
      return null;
    }
    if (exp.end_at && new Date(exp.end_at) < new Date()) {
      return null;
    }

    // Get or create assignment via RPC (deterministic, stable)
    const { data: variant, error: assignError } = await supabase
      .rpc('get_or_create_assignment', {
        p_experiment_id: exp.id,
        p_subject_id: subjectId,
        p_variants: exp.variants,
      });

    if (assignError) {
      console.error('[ExperimentService] Assignment error:', assignError);
      return null;
    }

    return variant || null;
  } catch (err) {
    console.error('[ExperimentService] getVariantAssignment error:', err);
    return null;
  }
}

// ── Exposure Tracking ────────────────────────────────────────

/**
 * Record that a subject was exposed to an experiment variant.
 * Idempotent — only records once per subject per experiment.
 */
export async function recordExposure(experimentKey, subjectId, variant) {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  if (!experimentKey || !subjectId || !variant) {
    return false;
  }

  try {
    // Get experiment ID
    const { data: experiment } = await supabase
      .from('experiments')
      .select('id')
      .eq('key', experimentKey)
      .single();

    if (!experiment) return false;

    // Record via RPC (idempotent)
    const { data, error } = await supabase
      .rpc('record_experiment_exposure', {
        p_experiment_id: experiment.id,
        p_subject_id: subjectId,
        p_variant: variant,
      });

    if (error) {
      console.error('[ExperimentService] Exposure error:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('[ExperimentService] recordExposure error:', err);
    return false;
  }
}

// ── Conversion Tracking ──────────────────────────────────────

/**
 * Record a conversion event for an experiment.
 * Only counts if the subject was previously exposed.
 * 
 * @param {string} experimentKey - Experiment key
 * @param {string} subjectId - User ID or anonymous session ID
 * @param {string} event - Conversion event name
 * @param {object} data - Additional metadata
 * @returns {boolean} - Whether conversion was recorded
 */
export async function recordConversion(experimentKey, subjectId, event, data = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  if (!experimentKey || !subjectId || !event) {
    return false;
  }

  try {
    // Get experiment ID
    const { data: experiment } = await supabase
      .from('experiments')
      .select('id')
      .eq('key', experimentKey)
      .single();

    if (!experiment) return false;

    // Record via RPC (checks exposure first)
    const { data: result, error } = await supabase
      .rpc('record_experiment_conversion', {
        p_experiment_id: experiment.id,
        p_subject_id: subjectId,
        p_event: event,
        p_data: data,
      });

    if (error) {
      console.error('[ExperimentService] Conversion error:', error);
      return false;
    }

    return !!result;
  } catch (err) {
    console.error('[ExperimentService] recordConversion error:', err);
    return false;
  }
}

// ── Growth Events ────────────────────────────────────────────

/**
 * Record a growth funnel event.
 * Privacy-conscious — no individual profiling.
 */
export async function recordGrowthEvent(eventType, subjectId = null, metadata = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  if (!eventType) return false;

  try {
    const { error } = await supabase
      .from('growth_events')
      .insert([{
        event_type: eventType,
        subject_id: subjectId,
        metadata: metadata,
      }]);

    if (error) {
      console.error('[ExperimentService] Growth event error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[ExperimentService] recordGrowthEvent error:', err);
    return false;
  }
}

// ── Reporting ────────────────────────────────────────────────

/**
 * Get aggregate experiment report (no user-level data).
 */
export async function getExperimentReport(experimentKey) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null };
  }

  try {
    // Get experiment
    const { data: experiment } = await supabase
      .from('experiments')
      .select('*')
      .eq('key', experimentKey)
      .single();

    if (!experiment) {
      return { data: null };
    }

    // Get variant report via RPC
    const { data: variantReport } = await supabase
      .rpc('get_experiment_report', { p_experiment_id: experiment.id });

    return {
      data: {
        experiment,
        variants: variantReport || [],
      },
    };
  } catch (err) {
    console.error('[ExperimentService] Report error:', err);
    return { data: null };
  }
}

/**
 * Get aggregate funnel metrics from growth_events.
 */
export async function getFunnelMetrics(options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null };
  }

  const { days = 30 } = options;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events, error } = await supabase
      .from('growth_events')
      .select('event_type, created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (error) return { data: null };

    // Aggregate by event type
    const funnel = {};
    for (const evt of events || []) {
      if (!funnel[evt.event_type]) {
        funnel[evt.event_type] = 0;
      }
      funnel[evt.event_type]++;
    }

    // Calculate funnel rates
    const funnelOrder = [
      'landing_viewed',
      'primary_cta_viewed',
      'primary_cta_clicked',
      'signup_started',
      'signup_completed',
      'verification_completed',
      'welcome_opened',
      'profile_setup_completed',
      'interest_selection_completed',
      'onboarding_completed',
      'hot_seat_creation_started',
      'hot_seat_created',
      'first_roast_submitted',
      'first_roast_received',
      'reaction_added',
      'share_initiated',
      'share_completed',
      'challenge_created',
      'referral_conversion',
      'notification_opened',
      'return_visit',
    ];

    const orderedFunnel = funnelOrder
      .filter(key => funnel[key] !== undefined)
      .map((key, index, arr) => ({
        event: key,
        count: funnel[key],
        rateFromPrevious: index > 0 && funnel[arr[index - 1]] > 0
          ? ((funnel[key] / funnel[arr[index - 1]]) * 100).toFixed(1) + '%'
          : null,
        rateFromTop: funnel[arr[0]] > 0
          ? ((funnel[key] / funnel[arr[0]]) * 100).toFixed(1) + '%'
          : null,
      }));

    // Any events not in the ordered funnel
    const extraEvents = Object.entries(funnel)
      .filter(([key]) => !funnelOrder.includes(key))
      .map(([key, count]) => ({
        event: key,
        count,
        rateFromPrevious: null,
        rateFromTop: null,
      }));

    return {
      data: {
        period: `Last ${days} days`,
        totalEvents: events?.length || 0,
        funnel: [...orderedFunnel, ...extraEvents],
      },
    };
  } catch (err) {
    console.error('[ExperimentService] Funnel error:', err);
    return { data: null };
  }
}

/**
 * Get guardrail metrics for an experiment.
 */
export async function getGuardrailMetrics(experimentKey) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null };
  }

  try {
    const { data: experiment } = await supabase
      .from('experiments')
      .select('*')
      .eq('key', experimentKey)
      .single();

    if (!experiment) {
      return { data: null };
    }

    // Get exposures and conversions for guardrail analysis
    const { data: exposures } = await supabase
      .from('experiment_exposures')
      .select('variant, subject_id')
      .eq('experiment_id', experiment.id);

    const { data: conversions } = await supabase
      .from('experiment_conversions')
      .select('variant, event, subject_id')
      .eq('experiment_id', experiment.id);

    // Aggregate guardrail data per variant
    const variantGuardrails = {};
    const variants = experiment.variants || [];

    for (const variant of variants) {
      const variantExposures = (exposures || []).filter(e => e.variant === variant);
      const variantConversions = (conversions || []).filter(c => c.variant === variant);

      variantGuardrails[variant] = {
        exposures: variantExposures.length,
        conversions: variantConversions.length,
        conversionRate: variantExposures.length > 0
          ? ((variantConversions.length / variantExposures.length) * 100).toFixed(2)
          : '0.00',
        guardrails: (experiment.guardrail_metrics || []).map(metric => ({
          metric,
          status: 'ok', // Would compare against thresholds in production
          threshold: getGuardrailThreshold(metric),
        })),
      };
    }

    return {
      data: {
        experimentId: experiment.id,
        experimentKey: experiment.key,
        guardrailMetrics: experiment.guardrail_metrics,
        variantData: variantGuardrails,
      },
    };
  } catch (err) {
    console.error('[ExperimentService] Guardrail error:', err);
    return { data: null };
  }
}

/**
 * Get default threshold for a guardrail metric.
 */
function getGuardrailThreshold(metric) {
  const thresholds = {
    error_rate: { max: 5, unit: '%' },
    failed_submission_rate: { max: 3, unit: '%' },
    moderation_rejection_rate: { max: 10, unit: '%' },
    page_performance: { max: 3000, unit: 'ms' },
    bounce_rate: { max: 80, unit: '%' },
    dismiss_rate: { max: 50, unit: '%' },
    notification_opt_out_rate: { max: 5, unit: '%' },
  };
  return thresholds[metric] || { max: null, unit: 'unknown' };
}

// ── Utility ──────────────────────────────────────────────────

/**
 * Check if an experiment is currently eligible for a subject.
 */
export async function isExperimentEligible(experimentKey, subjectId) {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  const { data: experiment } = await supabase
    .from('experiments')
    .select('*')
    .eq('key', experimentKey)
    .single();

  if (!experiment) return false;
  if (experiment.status !== EXPERIMENT_STATUS.ACTIVE) return false;

  // Check time bounds
  if (experiment.start_at && new Date(experiment.start_at) > new Date()) return false;
  if (experiment.end_at && new Date(experiment.end_at) < new Date()) return false;

  return true;
}

/**
 * Seed default experiments (safe, additive only).
 * Only creates if they don't already exist.
 */
export async function seedDefaultExperiments() {
  const defaults = [
    {
      key: 'homepage_cta',
      name: 'Homepage Primary CTA',
      description: 'Testing different CTA copy for homepage hero',
      variants: ['put_me_on_hot_seat', 'roast_me', 'fire_your_shot'],
      primaryMetric: 'hot_seat_creation_started',
      guardrailMetrics: ['error_rate', 'bounce_rate'],
    },
    {
      key: 'onboarding_flow',
      name: 'Onboarding Sequence',
      description: 'Testing discovery-first vs creation-first onboarding',
      variants: ['explore_first', 'create_first'],
      primaryMetric: 'activation_completed',
      guardrailMetrics: ['dismiss_rate'],
    },
    {
      key: 'share_prompt',
      name: 'Share CTA Copy',
      description: 'Testing different share prompt messaging',
      variants: ['share_your_result', 'challenge_a_friend', 'show_the_world'],
      primaryMetric: 'share_initiated',
      guardrailMetrics: [],
    },
  ];

  const results = [];

  for (const exp of defaults) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('experiments')
      .select('id')
      .eq('key', exp.key)
      .single();

    if (existing) {
      results.push({ key: exp.key, status: 'already_exists' });
      continue;
    }

    const result = await createExperiment(exp);
    results.push({ key: exp.key, status: result.error ? 'error' : 'created', error: result.error });
  }

  return results;
}
