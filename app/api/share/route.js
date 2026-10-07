import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { recordSignal, resolveContentContext } from '@/lib/reco/signals';

/**
 * POST /api/share
 *
 * Records a REAL share event. Access is validated before recording:
 *   - the resource must exist and be public/visible (anonymous RLS enforces
 *     moderation-state filtering — removed content returns nothing)
 *   - signed-in actors are recorded via their JWT (RLS rejects impersonation)
 *   - anonymous visitors can record real shares with actor_id NULL
 *
 * Body: { resource_type, resource_id, channel, idempotency_key? }
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

const RESOURCE_TYPES = ['social_post', 'roast', 'profile', 'community', 'challenge', 'battle', 'topic'];
const CHANNELS = ['native', 'copy', 'clipboard', 'x', 'facebook', 'whatsapp', 'telegram', 'sms', 'email', 'link', 'other'];

// Lightweight access validation — the same RLS rules that govern reading the
// resource. A share of private/removed/restricted content is refused.
async function resourceIsShareable(client, type, id) {
  try {
    if (type === 'social_post') {
      const { data } = await client.from('social_posts').select('id').eq('id', id).maybeSingle();
      return !!data; // RLS already requires visibility=public + moderation visible
    }
    if (type === 'roast') {
      const { data } = await client.from('roasts').select('id').eq('id', id).eq('is_hidden', false).maybeSingle();
      return !!data;
    }
    if (type === 'profile') {
      const { data } = await client.from('user_profiles').select('id').eq('id', id).eq('is_banned', false).maybeSingle();
      return !!data;
    }
    if (type === 'community') {
      const { data } = await client.from('communities').select('id').eq('id', id).eq('visibility', 'public').eq('status', 'active').maybeSingle();
      return !!data;
    }
    if (type === 'challenge') {
      const { data } = await client.from('challenges').select('id').eq('id', id).eq('visibility', 'public').eq('status', 'active').maybeSingle();
      return !!data;
    }
    if (type === 'topic') {
      const { data } = await client.from('topics').select('id').eq('id', id).maybeSingle();
      return !!data;
    }
    if (type === 'battle') {
      const { data } = await client.from('battles').select('id').eq('id', id).maybeSingle();
      return !!data;
    }
    return false;
  } catch {
    return false;
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Layered rate limit: per-IP (share-link bursts must not flood the ledger).
    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'share_ip'), RATE_LIMITS.SHARE);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error, retryAfter: ipLimit.retryAfterSeconds }, { status: 429 });
    }

    const body = await req.json();
    const resourceType = body?.resource_type;
    const resourceId = body?.resource_id;
    let channel = body?.channel || 'other';
    const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key.slice(0, 120) : null;

    if (!RESOURCE_TYPES.includes(resourceType) || !resourceId || typeof resourceId !== 'string') {
      return NextResponse.json({ error: 'Invalid resource' }, { status: 400 });
    }
    if (!CHANNELS.includes(channel)) channel = 'other';

    // Resolve the signed-in actor (never trusted from the body).
    const session = await getRequestContext(req);
    const actorId = session?.userId || null;

    // Validate the resource is genuinely public/shareable, using the anon
    // client so RLS gates visibility.
    const shareable = await resourceIsShareable(supabase, resourceType, resourceId);
    if (!shareable) {
      return NextResponse.json(
        { error: 'This content is not shareable (private, removed, or restricted)' },
        { status: 403 }
      );
    }

    const writeClient = session?.client || supabase;
    await writeClient.from('shares').insert({
      actor_id: actorId,
      resource_type: resourceType,
      resource_id: resourceId,
      channel,
      context: { source: 'share_button' },
      idempotency_key: idempotencyKey,
    });

    // Real behavior signal: a signed-in user sharing feed content is a
    // strong positive signal (strength 2.0 per SIGNAL_STRENGTH). One signal
    // per user per item — repeat shares don't inflate affinity. Anonymous
    // shares stay in the ledger only; no behavioral profile is fabricated.
    if (actorId && session?.client && (resourceType === 'social_post' || resourceType === 'roast')) {
      (async () => {
        try {
          const meta = await resolveContentContext(session.client, resourceType, resourceId);
          await recordSignal({
            client: session.client,
            userId: actorId,
            eventType: 'content_shared',
            targetType: resourceType,
            targetId: resourceId,
            context: { ...(meta || {}), channel },
            idempotencyKey: `share-${resourceType}-${resourceId}`,
          });
        } catch {}
      })();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Share] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}