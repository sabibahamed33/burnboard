import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Get today's Spark (daily activity)
 */
export async function getTodaysSpark() {
  const supabase = getSupabase();
  if (!supabase) return null;
  
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('daily_activities')
    .select('*')
    .eq('status', 'active')
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Create a daily spark (admin/automated)
 */
export async function createDailySpark({ title, prompt, activity_type = 'spark', category = 'general' }) {
  const supabase = getSupabase();
  if (!supabase) return null;
  
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_activities')
    .insert({
      activity_type,
      title,
      prompt,
      category,
      start_date: today,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Record participation in today's spark
 */
export async function recordSparkParticipation(activityId, userId, contentId) {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Not configured' };

  // Check if already participated
  const { data: existing } = await supabase
    .from('daily_participations')
    .select('id')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return { already_participated: true };
  }

  const { data, error } = await supabase
    .from('daily_participations')
    .insert({
      activity_id: activityId,
      user_id: userId,
      content_type: 'spark',
      content_id: contentId || null,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return { already_participated: true };
    }
    throw error;
  }

  return { data, already_participated: false };
}

/**
 * Get participation stats for today's spark
 */
export async function getSparkStats(activityId) {
  const supabase = getSupabase();
  if (!supabase) return { participation_count: 0 };

  const { count } = await supabase
    .from('daily_participations')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', activityId);

  return { participation_count: count || 0 };
}
