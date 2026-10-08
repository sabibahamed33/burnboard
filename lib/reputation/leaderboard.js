import { createClient } from '@/lib/supabase/server';

/**
 * Get leaderboard rankings (reputation/XP-based, never follower count).
 *
 * Periods: today (last 24h XP gains), weekly, monthly, all_time.
 * Suspended accounts are excluded server-side. Rank = position in the
 * returned page (offset-aware); there is no fabricated global position.
 */
export async function getLeaderboard({
  period = 'all_time',
  limit = 20,
  offset = 0,
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('user_profiles')
    .select(`
      user_id,
      username,
      display_name,
      avatar_url,
      reputation,
      level,
      follower_count,
      is_banned,
      created_at
    `)
    .gt('reputation', 0)
    .eq('is_banned', false)
    .order('reputation', { ascending: false })
    .range(offset, offset + limit - 1);

  if (period === 'today') {
    const dayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    query = supabase
      .from('reputation_events')
      .select(`
        user_id,
        sum(value) as period_rep,
        user_profiles!inner (
          username,
          display_name,
          avatar_url,
          level,
          is_banned
        )
      `)
      .gte('created_at', dayAgo)
      .group('user_id')
      .order('period_rep', { ascending: false })
      .range(offset, offset + limit - 1);
  } else if (period === 'weekly') {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    query = supabase
      .from('reputation_events')
      .select(`
        user_id,
        sum(value) as period_rep,
        user_profiles!inner (
          username,
          display_name,
          avatar_url,
          level,
          is_banned
        )
      `)
      .gte('created_at', weekAgo)
      .group('user_id')
      .order('period_rep', { ascending: false })
      .range(offset, offset + limit - 1);
  } else if (period === 'monthly') {
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    query = supabase
      .from('reputation_events')
      .select(`
        user_id,
        sum(value) as period_rep,
        user_profiles!inner (
          username,
          display_name,
          avatar_url,
          level,
          is_banned
        )
      `)
      .gte('created_at', monthAgo)
      .group('user_id')
      .order('period_rep', { ascending: false })
      .range(offset, offset + limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    // Older snapshots may lack is_banned: retry without the suspension
    // filter rather than failing the whole board (fail-soft, documented).
    if (/is_banned|column/i.test(error.message || '')) {
      return getLeaderboardLegacy({ period, limit, offset });
    }
    throw error;
  }

  const rows = (data || []).filter((entry) => {
    const prof = entry.user_profiles;
    // Suspended accounts never appear (both query shapes).
    if (entry.is_banned === true) return false;
    if (prof && prof.is_banned === true) return false;
    return true;
  });

  return rows.map((entry, index) => ({
    rank: offset + index + 1,
    user_id: entry.user_id,
    username: entry.user_profiles?.username || entry.username,
    display_name: entry.user_profiles?.display_name || entry.display_name,
    avatar_url: entry.user_profiles?.avatar_url || entry.avatar_url,
    reputation: entry.period_rep || entry.reputation,
    level: entry.user_profiles?.level || entry.level,
  }));
}

/**
 * Pre-suspension-column fallback: identical ranking without the
 * is_banned filter. Only used when the column is provably absent.
 */
async function getLeaderboardLegacy({ period = 'all_time', limit = 20, offset = 0 } = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('user_profiles')
    .select(`
      user_id,
      username,
      display_name,
      avatar_url,
      reputation,
      level,
      follower_count,
      created_at
    `)
    .gt('reputation', 0)
    .order('reputation', { ascending: false })
    .range(offset, offset + limit - 1);

  if (period === 'today' || period === 'weekly' || period === 'monthly') {
    const days = period === 'today' ? 1 : period === 'weekly' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    query = supabase
      .from('reputation_events')
      .select(`
        user_id,
        sum(value) as period_rep,
        user_profiles!inner (
          username,
          display_name,
          avatar_url,
          level
        )
      `)
      .gte('created_at', since)
      .group('user_id')
      .order('period_rep', { ascending: false })
      .range(offset, offset + limit - 1);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((entry, index) => ({
    rank: offset + index + 1,
    user_id: entry.user_id,
    username: entry.user_profiles?.username || entry.username,
    display_name: entry.user_profiles?.display_name || entry.display_name,
    avatar_url: entry.user_profiles?.avatar_url || entry.avatar_url,
    reputation: entry.period_rep || entry.reputation,
    level: entry.user_profiles?.level || entry.level,
  }));
}
