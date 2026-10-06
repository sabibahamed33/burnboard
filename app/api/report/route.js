import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createReport } from '@/lib/moderationService';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';

export async function POST(req) {
  try {
    // Rate limit reports
    const clientIp = getClientIp(req);
    const rlResult = rateLimitMiddleware(
      ipKey(clientIp, 'report'),
      RATE_LIMITS.REPORT
    );

    if (rlResult.blocked) {
      return NextResponse.json(rlResult.response, { status: 429 });
    }

    const body = await req.json();
    const { roast_id, reason, category, context } = body;

    if (!roast_id) {
      return NextResponse.json({ error: 'roast_id required' }, { status: 400 });
    }

    // Use enhanced moderation service
    const result = await createReport({
      targetType: 'roast',
      targetId: roast_id,
      category: category || 'other',
      context,
      reporterIp: clientIp,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.duplicate ? 'Already reported' : 'Reported - Admin will check',
      duplicate: result.duplicate || false,
    });
  } catch (err) {
    console.error('[Report] Error:', err?.message || err);
    return NextResponse.json({ error: 'Unable to submit your report right now. Please try again.' }, { status: 500 });
  }
}
