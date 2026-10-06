import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getLevelInfo } from '@/lib/reputation/config';
import { getUserBadges } from '@/lib/reputation/badges';
import { getUserStreak } from '@/lib/reputation/streaks';
import { getLeaderboard } from '@/lib/reputation/leaderboard';
import { getTodaysSpark, getSparkStats } from '@/lib/reputation/dailySpark';

/**
 * GET /api/reputation
 * 
 * Get reputation data for a user or leaderboard.
 * 
 * Query params:
 *   - type: 'user' | 'leaderboard' | 'streak' | 'badges' | 'daily'
 *   - user_id: string (for user/streak/badges)
 *   - period: 'all_time' | 'weekly' | 'monthly' (for leaderboard)
 *   - limit: number (for leaderboard)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'user';
    const userId = searchParams.get('user_id');
    const period = searchParams.get('period') || 'all_time';
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    switch (type) {
      case 'leaderboard': {
        const leaderboard = await getLeaderboard({ period, limit, offset });
        return NextResponse.json({ leaderboard });
      }

      case 'user': {
        if (!userId) {
          return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
        }

        const supabase = getSupabase();
        if (!supabase) {
          return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
        }

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id, username, display_name, avatar_url, reputation, level, follower_count, following_count, created_at')
          .eq('user_id', userId)
          .single();

        if (!profile) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const levelInfo = getLevelInfo(profile.reputation || 0);
        const streak = await getUserStreak(userId);
        const badges = await getUserBadges(userId);

        return NextResponse.json({
          profile,
          reputation: {
            rep: profile.reputation || 0,
            level: levelInfo,
          },
          streak,
          badges,
        });
      }

      case 'streak': {
        if (!userId) {
          return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
        }
        const streak = await getUserStreak(userId);
        return NextResponse.json({ streak });
      }

      case 'badges': {
        if (!userId) {
          return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
        }
        const badges = await getUserBadges(userId);
        return NextResponse.json({ badges });
      }

      case 'daily': {
        const spark = await getTodaysSpark();
        let stats = null;
        let hasParticipated = false;

        if (spark) {
          stats = await getSparkStats(spark.id);

          if (userId) {
            const supabase = getSupabase();
            if (supabase) {
              const { data: participation } = await supabase
                .from('daily_participations')
                .select('id')
                .eq('activity_id', spark.id)
                .eq('user_id', userId)
                .single();
              hasParticipated = !!participation;
            }
          }
        }

        return NextResponse.json({ spark, stats, has_participated: hasParticipated });
      }

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err) {
    console.error('[Reputation] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
