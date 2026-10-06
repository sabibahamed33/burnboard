import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodaysSpark, getSparkStats, recordSparkParticipation } from '@/lib/reputation/dailySpark';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET /api/daily-spark
 * Get today's spark and user participation status
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    const spark = await getTodaysSpark();

    if (!spark) {
      return NextResponse.json({ spark: null, stats: null, has_participated: false });
    }

    const stats = await getSparkStats(spark.id);
    let hasParticipated = false;

    if (userId) {
      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase
          .from('daily_participations')
          .select('id')
          .eq('activity_id', spark.id)
          .eq('user_id', userId)
          .single();
        hasParticipated = !!data;
      }
    }

    return NextResponse.json({ spark, stats, has_participated: hasParticipated });
  } catch (err) {
    console.error('[DailySpark] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/daily-spark
 * Record participation in today's spark
 */
export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const { activity_id, content_id } = body;

    if (!activity_id) {
      return NextResponse.json({ error: 'Missing activity_id' }, { status: 400 });
    }

    const result = await recordSparkParticipation(activity_id, userId, content_id);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[DailySpark] POST Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
