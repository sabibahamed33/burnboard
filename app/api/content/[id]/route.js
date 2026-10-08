import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';
import { runDeterministicPolicy } from '@/lib/safety';
import { VISIBILITY, validatePhotoMetadata } from '@/lib/photoPosts';
import { pingMilestones } from '@/lib/creator/milestones';

/**
 * PATCH /api/content/:id — edit own post (caption, photo, metadata,
 * visibility). Publishing a draft happens here (visibility draft →
 * public/followers/only_me). Unpublishing sets visibility back to draft.
 *
 * DELETE /api/content/:id — delete own post everywhere. Associated
 * reactions/comments are removed best-effort; the post row (and its
 * metadata) is gone, so nothing orphaned can surface.
 */

const EDITABLE_VISIBILITIES = [VISIBILITY.PUBLIC, VISIBILITY.FOLLOWERS, VISIBILITY.ONLY_ME, VISIBILITY.DRAFT];

async function loadOwnedPost(client, userId, id) {
  const { data, error } = await client
    .from('social_posts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function PATCH(req, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Missing post id' }, { status: 400 });
    }

    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in to edit posts.' }, { status: 401 });
    }

    const post = await loadOwnedPost(client, userId, id);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const body = await req.json();
    const { text, context, media_url, visibility, photo_meta, scheduled_at } = body || {};
    const updates = {};
    const wasDraft = post.visibility === VISIBILITY.DRAFT || post.visibility === VISIBILITY.SCHEDULED;

    if (text !== undefined) {
      const clean = String(text || '').trim();
      if (!clean && !(post.media_url || media_url)) {
        return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
      }
      if (clean.length > 500) {
        return NextResponse.json({ error: 'Text must be 500 characters or less' }, { status: 400 });
      }
      const policy = runDeterministicPolicy(clean);
      if (policy.blocked) {
        const finding = policy.findings.find((f) => f.action === 'block');
        return NextResponse.json(
          { error: finding?.reason || 'This content violates BurnBoard safety policy' },
          { status: 400 }
        );
      }
      updates.content_text = clean;
    }

    if (media_url !== undefined) {
      if (media_url === null || media_url === '') {
        updates.media_url = null;
      } else {
        const v = String(media_url).trim();
        if (v.length > 2000 || !/^https:\/\/[^\s]+$/i.test(v)) {
          return NextResponse.json({ error: 'Photo URL looks invalid.' }, { status: 400 });
        }
        updates.media_url = v;
      }
    }

    let nextMeta = { ...(post.metadata || {}) };
    if (photo_meta !== undefined || scheduled_at !== undefined) {
      const { meta, errors } = validatePhotoMetadata({
        ...(photo_meta || {}),
        ...(scheduled_at !== undefined ? { scheduled_at } : {}),
      });
      if (errors.length > 0) {
        return NextResponse.json({ error: errors[0] }, { status: 400 });
      }
      // Explicit nulls remove previously published fields.
      for (const [k, v] of Object.entries(photo_meta || {})) {
        if (v === null && k in nextMeta) delete nextMeta[k];
      }
      nextMeta = { ...nextMeta, ...meta };
      // List fields have replace semantics when explicitly provided:
      // an empty list clears the field instead of silently keeping it.
      for (const listKey of ['topics', 'tagged_user_ids']) {
        if (photo_meta && Object.prototype.hasOwnProperty.call(photo_meta, listKey)) {
          if (meta[listKey] && meta[listKey].length) nextMeta[listKey] = meta[listKey];
          else delete nextMeta[listKey];
        }
      }
    }

    if (visibility !== undefined) {
      if (!EDITABLE_VISIBILITIES.includes(visibility)) {
        return NextResponse.json({ error: 'Invalid visibility.' }, { status: 400 });
      }
      if (visibility === VISIBILITY.DRAFT) {
        // Unpublish: hide everywhere, remember the previous target.
        nextMeta = { ...nextMeta, draft: true, target_visibility: post.visibility === VISIBILITY.DRAFT ? (nextMeta.target_visibility || VISIBILITY.PUBLIC) : post.visibility };
        updates.visibility = VISIBILITY.DRAFT;
      } else {
        // Publish (or re-target): explicit user action only.
        if (nextMeta.scheduled_at) delete nextMeta.scheduled_at;
        if (nextMeta.draft) delete nextMeta.draft;
        nextMeta = { ...nextMeta, published_at: new Date().toISOString() };
        updates.visibility = visibility;
      }
    } else if (scheduled_at !== undefined && nextMeta.scheduled_at && post.visibility !== VISIBILITY.SCHEDULED) {
      // Adding a schedule moves a published post back to the rest state.
      updates.visibility = VISIBILITY.SCHEDULED;
    } else if (scheduled_at === null && post.visibility === VISIBILITY.SCHEDULED && visibility === undefined) {
      // Clearing the schedule publishes immediately at the stored target.
      const target = ['public', 'followers', 'only_me'].includes(nextMeta.target_visibility)
        ? nextMeta.target_visibility
        : VISIBILITY.PUBLIC;
      delete nextMeta.scheduled_at;
      nextMeta.published_at = new Date().toISOString();
      updates.visibility = target;
    }

    // Scheduling requires a valid future time (validated above).
    if (updates.visibility === VISIBILITY.SCHEDULED && !nextMeta.scheduled_at) {
      return NextResponse.json({ error: 'Scheduled posts need a future publish time.' }, { status: 400 });
    }

    updates.metadata = nextMeta;
    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await client
      .from('social_posts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
    }

    // Publishing a draft for the first time earns the normal creation
    // side-effects (milestones only — no double reputation).
    if (wasDraft && EDITABLE_VISIBILITIES.includes(updated.visibility) && updated.visibility !== VISIBILITY.DRAFT) {
      pingMilestones(client, userId).catch(() => {});
    }

    return NextResponse.json({ success: true, post: updated });
  } catch (err) {
    console.error('[Content] PATCH Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Missing post id' }, { status: 400 });
    }

    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in to delete posts.' }, { status: 401 });
    }

    const post = await loadOwnedPost(client, userId, id);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Best-effort associated cleanup (policies may deny some deletes —
    // the post row itself is authoritative and always goes).
    try {
      await client.from('comments').delete().eq('target_type', 'social_post').eq('target_id', id);
    } catch {}
    try {
      await client.from('reactions').delete().eq('target_type', 'social_post').eq('target_id', id);
    } catch {}

    const { error } = await client
      .from('social_posts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Content] DELETE Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
