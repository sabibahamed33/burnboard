import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { relationshipBetween, hiddenAuthorIds } from '@/lib/safety';
import { notifyDmMessage } from '@/lib/notifications';
import { checkRateLimit, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { otherParticipant, validateShareRef } from '@/lib/dm';

const MAX_TEXT = 500;
const PAGE_SIZE = 30;

/**
 * GET /api/dm/threads/[id]/messages?cursor=&limit=
 *
 * Message history, newest page first (client reverses for display).
 * Participant-only (RLS + explicit check). Cursor = created_at of the
 * oldest loaded message.
 */
export async function GET(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in to view messages' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10) || PAGE_SIZE, 50);
    const cursor = searchParams.get('cursor');

    const { data: thread } = await client
      .from('dm_threads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!thread || (thread.user1_id !== userId && thread.user2_id !== userId)) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    let query = client
      .from('dm_messages')
      .select('*')
      .eq('thread_id', id)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt('created_at', cursor);

    const { data, error } = await query;
    if (error) {
      console.error('[DM] Messages list error:', error);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    const rows = data || [];
    const hasMore = rows.length > limit;
    const messages = (hasMore ? rows.slice(0, limit) : rows).reverse();
    const nextCursor = hasMore && messages.length > 0 ? messages[0].created_at : null;

    return NextResponse.json({ messages, nextCursor, hasMore });
  } catch (err) {
    console.error('[DM] Messages GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/dm/threads/[id]/messages
 *   Body: { text?, attachment_url?, shared_kind?, shared_id?, reply_to_id? }
 *
 * Send a message. Enforcement (all server-side):
 *   - participant-only; requested threads refuse new sends until accepted
 *     (the request itself carried the first message)
 *   - blocks either direction refuse at send time (checked fresh — a block
 *     placed after thread creation still stops messages)
 *   - rate-limited (20/min) + identical-message dedupe (60s window)
 *   - share refs re-validated so private content can't leak
 */
export async function POST(req, { params }) {
  try {
    const { id } = params;
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in to send messages' }, { status: 401 });
    }

    const { data: thread } = await client
      .from('dm_threads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!thread || (thread.user1_id !== userId && thread.user2_id !== userId)) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if ((thread.status || 'active') !== 'active') {
      return NextResponse.json(
        { error: 'This request is still pending — messages unlock once it is accepted' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { text, attachment_url, shared_kind, shared_id, reply_to_id } = body;

    const cleanText = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '';
    let sharedRef = null;
    if (shared_kind || shared_id) {
      const check = await validateShareRef(client, shared_kind, shared_id, userId);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      sharedRef = check.ref;
    }
    if (reply_to_id) {
      const { data: replied } = await client
        .from('dm_messages')
        .select('id')
        .eq('id', reply_to_id)
        .eq('thread_id', id)
        .maybeSingle();
      if (!replied) {
        return NextResponse.json({ error: 'Replied message not found' }, { status: 400 });
      }
    }
    if (!cleanText && !attachment_url && !sharedRef) {
      return NextResponse.json({ error: 'Write a message or attach something to share' }, { status: 400 });
    }

    // Fresh block check at send time (either direction).
    const otherId = otherParticipant(thread, userId);
    try {
      const rel = await relationshipBetween(client, userId, otherId);
      if (rel.viewer_blocks_other || rel.other_blocks_viewer) {
        return NextResponse.json({ error: 'You cannot message this user' }, { status: 403 });
      }
    } catch {}

    // Rate limit sends (flood protection).
    const rl = checkRateLimit(ipKey(userId, 'dm_send'), RATE_LIMITS.DM_SEND);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Sending too fast — slow down' }, { status: 429 });
    }

    // Identical-message dedupe (double-tap / retry storms send once).
    if (cleanText) {
      const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: dup } = await client
        .from('dm_messages')
        .select('*')
        .eq('thread_id', id)
        .eq('sender_id', userId)
        .eq('message', cleanText)
        .gte('created_at', minuteAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dup) {
        return NextResponse.json({ success: true, message: dup, deduped: true });
      }
    }

    const { data: message, error } = await client
      .from('dm_messages')
      .insert({
        thread_id: id,
        sender_id: userId,
        message: cleanText,
        attachment_url: attachment_url || null,
        attachment_type: attachment_url ? 'photo' : null,
        shared_ref: sharedRef,
        reply_to_id: reply_to_id || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[DM] Send error:', error);
      return NextResponse.json({ error: 'Message could not send. Retry.' }, { status: 500 });
    }

    await client
      .from('dm_threads')
      .update({
        last_message: cleanText || (sharedRef ? 'Shared something with you' : ''),
        updated_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Notify the other participant (grouped per thread, safety-gated).
    if (otherId) {
      notifyDmMessage({
        threadId: id,
        recipientId: otherId,
        senderId: userId,
        isRequest: false,
        preview: cleanText,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, message });
  } catch (err) {
    console.error('[DM] Messages POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
