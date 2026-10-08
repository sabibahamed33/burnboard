import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { relationshipBetween } from '@/lib/safety';
import { notifyDmMessage } from '@/lib/notifications';
import { checkRateLimit, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { sortPair, otherParticipant, decideThreadStatus, validateShareRef, shapeThread } from '@/lib/dm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 500;

/**
 * GET /api/dm/threads?status=active|requested|all&limit=
 *
 * The signed-in user's conversations, newest first. Each entry carries the
 * other participant's public profile, the last message, and the unread
 * count. Requested threads (message requests) are excluded by default and
 * listed with ?status=requested.
 */
export async function GET(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in to view messages' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'active';
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10) || 30, 50);

    let query = client
      .from('dm_threads')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (status === 'active' || status === 'requested') {
      query = query.eq('status', status);
    }

    const { data: threads, error } = await query;
    if (error) {
      console.error('[DM] Threads list error:', error);
      return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
    }

    const rows = threads || [];
    if (rows.length === 0) {
      return NextResponse.json({ threads: [], totalUnread: 0 });
    }

    const threadIds = rows.map((t) => t.id);
    const otherIds = [...new Set(rows.map((t) => otherParticipant(t, userId)).filter(Boolean))];

    const [{ data: profiles }, { data: unreadRows }] = await Promise.all([
      otherIds.length > 0
        ? client.from('user_profiles').select('id, username, display_name, avatar_url').in('id', otherIds)
        : Promise.resolve({ data: [] }),
      client
        .from('dm_messages')
        .select('thread_id')
        .in('thread_id', threadIds)
        .neq('sender_id', userId)
        .eq('is_read', false)
        .limit(500),
    ]);

    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    const unreadByThread = {};
    for (const m of unreadRows || []) {
      unreadByThread[m.thread_id] = (unreadByThread[m.thread_id] || 0) + 1;
    }

    const shaped = rows.map((t) =>
      shapeThread({ ...t, viewerId: userId }, byId.get(otherParticipant(t, userId)) || null, unreadByThread[t.id] || 0)
    );
    const totalUnread = Object.values(unreadByThread).reduce((a, b) => a + b, 0);

    return NextResponse.json({ threads: shaped, totalUnread });
  } catch (err) {
    console.error('[DM] Threads GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/dm/threads
 *   Body: { user_id, text?, attachment_url?, shared_kind?, shared_id?, reply_to_id? }
 *
 * Get-or-create a 1:1 conversation, optionally with the first message.
 * Enforcement (all server-side):
 *   - recipient exists, not yourself
 *   - blocks either direction refuse (403, no existence leak beyond 404s)
 *   - recipient dm_privacy: none → 403; follows → request unless followed
 *   - rate-limited thread creation (10/hour)
 * A message request notifies the recipient once; active threads notify
 * per message via the messages route.
 */
export async function POST(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in to message users' }, { status: 401 });
    }

    const body = await req.json();
    const { user_id: targetId, text, attachment_url, shared_kind, shared_id, reply_to_id } = body;

    if (!targetId || !UUID_RE.test(String(targetId))) {
      return NextResponse.json({ error: 'A valid user is required' }, { status: 400 });
    }
    if (targetId === userId) {
      return NextResponse.json({ error: 'You cannot message yourself' }, { status: 400 });
    }

    const cleanText = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '';
    let sharedRef = null;
    if (shared_kind || shared_id) {
      const check = await validateShareRef(client, shared_kind, shared_id, userId);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      sharedRef = check.ref;
    }
    if (!cleanText && !attachment_url && !sharedRef) {
      return NextResponse.json({ error: 'Write a message or attach something to share' }, { status: 400 });
    }

    // Recipient must exist
    const { data: recipient } = await client
      .from('user_profiles')
      .select('id, username, display_name, dm_privacy')
      .eq('id', targetId)
      .maybeSingle();
    if (!recipient) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Blocks are mutual: either direction refuses new conversations.
    try {
      const rel = await relationshipBetween(client, userId, targetId);
      if (rel.viewer_blocks_other || rel.other_blocks_viewer) {
        return NextResponse.json({ error: 'You cannot message this user' }, { status: 403 });
      }
    } catch {}

    // Existing thread wins (idempotent — never duplicates).
    const [u1, u2] = sortPair(userId, targetId);
    const { data: existing } = await client
      .from('dm_threads')
      .select('*')
      .eq('user1_id', u1)
      .eq('user2_id', u2)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        thread: shapeThread({ ...existing, viewerId: userId }, null, 0),
        created: false,
      });
    }

    // Rate limit new conversations (unsolicited-contact protection).
    const rl = checkRateLimit(ipKey(userId, 'dm_thread_create'), RATE_LIMITS.DM_THREAD_CREATE);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Starting too many conversations — slow down' }, { status: 429 });
    }

    // Recipient privacy decides active vs request vs denied.
    let recipientFollowsRequester = false;
    if ((recipient.dm_privacy || 'everyone') === 'follows') {
      const { data: follow } = await client
        .from('follows')
        .select('id')
        .eq('follower_id', targetId)
        .eq('following_id', userId)
        .maybeSingle();
      recipientFollowsRequester = !!follow;
    }
    const fate = decideThreadStatus({
      recipientPrivacy: recipient.dm_privacy,
      recipientFollowsRequester,
    });
    if (fate === 'denied') {
      return NextResponse.json({ error: 'This user is not accepting new messages' }, { status: 403 });
    }

    const { data: thread, error: threadError } = await client
      .from('dm_threads')
      .insert({
        user1_id: u1,
        user2_id: u2,
        status: fate,
        requested_by: fate === 'requested' ? userId : null,
        last_message: cleanText || (sharedRef ? 'Shared something with you' : ''),
      })
      .select('*')
      .single();

    if (threadError) {
      // Race: someone created it first — return the winner's thread.
      if (threadError.code === '23505') {
        const { data: winner } = await client
          .from('dm_threads')
          .select('*')
          .eq('user1_id', u1)
          .eq('user2_id', u2)
          .maybeSingle();
        if (winner) {
          return NextResponse.json({
            success: true,
            thread: shapeThread({ ...winner, viewerId: userId }, null, 0),
            created: false,
          });
        }
      }
      console.error('[DM] Thread create error:', threadError);
      return NextResponse.json({ error: 'Failed to start conversation' }, { status: 500 });
    }

    // First message rides with the thread (one round trip for the sender).
    let message = null;
    if (thread) {
      const { data: inserted } = await client
        .from('dm_messages')
        .insert({
          thread_id: thread.id,
          sender_id: userId,
          message: cleanText,
          attachment_url: attachment_url || null,
          attachment_type: attachment_url ? 'photo' : null,
          shared_ref: sharedRef,
          reply_to_id: reply_to_id || null,
        })
        .select('*')
        .single();
      message = inserted || null;
      if (message) {
        await client
          .from('dm_threads')
          .update({
            last_message: cleanText || (sharedRef ? 'Shared something with you' : ''),
            updated_at: new Date().toISOString(),
            last_message_at: new Date().toISOString(),
          })
          .eq('id', thread.id);
      }
    }

    // Notify the recipient (request vs message copy).
    notifyDmMessage({
      threadId: thread.id,
      recipientId: targetId,
      senderId: userId,
      senderUsername: null,
      isRequest: fate === 'requested',
      preview: cleanText,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      thread: shapeThread({ ...thread, viewerId: userId }, null, 0),
      message,
      created: true,
      requested: fate === 'requested',
    });
  } catch (err) {
    console.error('[DM] Threads POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
