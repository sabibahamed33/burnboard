import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * GET /api/safety/mine — signed-in USER's own safety overview.
 * Returns: blocks, mutes, restrictions, report history (status only),
 * own appeals (status only). Never exposes other users' private data,
 * moderator identities, or internal logic.
 */
const STATUS_LABEL = { open: 'Submitted', escalated: 'Submitted', in_review: 'Under review', resolved: 'Action taken', dismissed: 'No action', upheld: 'Action taken', reversed: 'No action' };

export async function GET(request) {
  try {
    const auth = await getRequestContext(request);
    if (!auth.client || !auth.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const [blocks, mutes, restrictions, reports, appeals] = await Promise.all([
      auth.client.from('user_blocks').select('blocked_id, created_at').eq('blocker_id', auth.userId).order('created_at', { ascending: false }).limit(100),
      auth.client.from('user_mutes').select('muted_id, created_at').eq('muter_id', auth.userId).order('created_at', { ascending: false }).limit(100),
      auth.client.rpc('safety_my_restrictions').then((r) => r.data).catch(() => []),
      auth.client.from('reports').select('id, target_type, category, status, created_at').eq('reporter_id', auth.userId).order('created_at', { ascending: false }).limit(50),
      auth.client.from('appeals').select('id, enforcement_type, enforcement_target_type, status, created_at').eq('appellant_id', auth.userId).order('created_at', { ascending: false }).limit(50),
    ]);

    const mapStatus = (s) => STATUS_LABEL[s] || 'Submitted';
    return NextResponse.json({
      blocks: (blocks?.data || []).map((b) => ({ userId: b.blocked_id, createdAt: b.created_at })),
      mutes: (mutes?.data || []).map((m) => ({ userId: m.muted_id, createdAt: m.created_at })),
      restrictions: restrictions || [],
      reports: (reports?.data || []).map((r) => ({ id: r.id, targetType: r.target_type, category: r.category, status: mapStatus(r.status), createdAt: r.created_at })),
      appeals: (appeals?.data || []).map((a) => ({ id: a.id, enforcementType: a.enforcement_type, targetType: a.enforcement_target_type, status: a.status, createdAt: a.created_at })),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
