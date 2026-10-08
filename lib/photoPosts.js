/**
 * BURNBOARD — Rich photo post metadata + privacy helpers.
 *
 * All optional metadata lives in social_posts.metadata (no schema churn).
 * Nothing is ever auto-filled from the account: every published field was
 * explicitly added by the creator. Server routes validate with
 * validatePhotoMetadata(); read paths gate with canViewPost().
 */

// Visibility values stored on social_posts.visibility. 'draft' and
// 'scheduled' are rest states — never publicly readable (RLS only
// exposes visibility='public'; the owner/follower policies in
// 2026_10_08_photo_posts_privacy.sql open exactly the intended reads).
export const VISIBILITY = {
  PUBLIC: 'public',
  FOLLOWERS: 'followers',
  ONLY_ME: 'only_me',
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
};

export const PUBLISHED_VISIBILITIES = [VISIBILITY.PUBLIC, VISIBILITY.FOLLOWERS, VISIBILITY.ONLY_ME];

const MAX_LEN = {
  caption: 500,
  location: 120,
  email: 160,
  url: 300,
  contactLabel: 60,
  contactValue: 160,
  business: 120,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let v = raw.trim().slice(0, MAX_LEN.url);
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  if (v.length > MAX_LEN.url || /\s/.test(v) || !/^https?:\/\/[^\s]+$/i.test(v)) return null;
  return v;
}

function cleanText(raw, max) {
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim().slice(0, max);
  return v || null;
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Validate + normalize creator-supplied optional metadata.
 * Returns { meta, errors }. Unknown fields are dropped (never trusted).
 * `meta` contains ONLY explicitly provided, valid fields.
 */
export function validatePhotoMetadata(input = {}) {
  const errors = [];
  const meta = {};

  const location = cleanText(input.location, MAX_LEN.location);
  if (input.location !== undefined && input.location !== null && String(input.location).trim() && !location) {
    errors.push('Location is too long.');
  } else if (location) {
    meta.location = location;
  }

  if (input.email !== undefined && input.email !== null && String(input.email).trim()) {
    const email = String(input.email).trim().slice(0, MAX_LEN.email);
    if (!EMAIL_RE.test(email)) errors.push('Email address looks invalid.');
    else meta.email = email;
  }

  if (input.website !== undefined && input.website !== null && String(input.website).trim()) {
    const url = cleanUrl(input.website);
    if (!url) errors.push('Website must be a valid URL.');
    else meta.website = url;
  }

  const contactLabel = cleanText(input.contact_label ?? input.contactLabel, MAX_LEN.contactLabel);
  const contactValue = cleanText(input.contact_value ?? input.contactValue, MAX_LEN.contactValue);
  if (contactValue) {
    meta.contact = { label: contactLabel || 'Contact', value: contactValue };
  }

  const business = cleanText(input.business, MAX_LEN.business);
  if (business) meta.business = business;

  if (input.topics !== undefined) {
    if (!Array.isArray(input.topics)) {
      errors.push('Topics must be a list.');
    } else {
      // Accept topic ids or { id, name } objects (names render chips
      // without extra lookups; ids are validated against the taxonomy
      // server-side where a client is available — here we bound shape).
      const seen = new Set();
      const clean = [];
      for (const t of input.topics) {
        const id = String(t?.id ?? t ?? '').slice(0, 60);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const name = cleanText(t?.name, 60);
        clean.push(name && name !== id ? { id, name } : id);
        if (clean.length >= 8) break;
      }
      if (clean.length) meta.topics = clean;
    }
  }

  if (input.tagged_user_ids !== undefined) {
    if (!Array.isArray(input.tagged_user_ids)) {
      errors.push('Tagged people must be a list.');
    } else {
      const ids = [...new Set(input.tagged_user_ids.filter(isUuid))].slice(0, 10);
      if (ids.length) meta.tagged_user_ids = ids;
    }
  }

  const perms = input.permissions || {};
  const perm = (v) => (v === 'off' ? 'off' : 'on');
  const permissions = {
    comments: perm(perms.comments),
    reactions: perm(perms.reactions),
    sharing: perm(perms.sharing),
    saving: perm(perms.saving),
  };
  if (JSON.stringify(permissions) !== JSON.stringify({ comments: 'on', reactions: 'on', sharing: 'on', saving: 'on' })) {
    meta.permissions = permissions;
  }

  if (input.scheduled_at !== undefined && input.scheduled_at !== null && input.scheduled_at !== '') {
    const t = new Date(input.scheduled_at).getTime();
    if (!Number.isFinite(t)) {
      errors.push('Scheduled time looks invalid.');
    } else if (t <= Date.now() + 60 * 1000) {
      errors.push('Scheduled time must be in the future.');
    } else if (t > Date.now() + 90 * 24 * 3600 * 1000) {
      errors.push('Scheduled time must be within 90 days.');
    } else {
      meta.scheduled_at = new Date(t).toISOString();
    }
  }

  return { meta, errors };
}

/**
 * Whether a viewer may see a post row.
 * @param {object} post social_posts row (visibility, user_id, metadata)
 * @param {string|null} viewerId signed-in viewer (null = anonymous)
 * @param {boolean} isFollower viewer follows the author
 */
export function canViewPost(post, viewerId, isFollower = false) {
  if (!post) return false;
  const vis = post.visibility || VISIBILITY.PUBLIC;
  const owner = !!viewerId && viewerId === post.user_id;
  if (vis === VISIBILITY.PUBLIC) return true;
  if (owner) return true;
  if (vis === VISIBILITY.FOLLOWERS) return !!viewerId && isFollower;
  // only_me / draft / scheduled (and anything unknown): owner only.
  return false;
}

/** Published = user-facing visibility (draft/scheduled excluded). */
export function isPublishedVisibility(post) {
  return PUBLISHED_VISIBILITIES.includes(post?.visibility);
}

/** Discovery surfaces (feed/explore/search/trending) show public only. */
export function isDiscoverable(post) {
  if (!post || post.visibility !== VISIBILITY.PUBLIC) return false;
  if (post.moderation_state && post.moderation_state !== 'visible') return false;
  if (post.metadata?.scheduled_at && new Date(post.metadata.scheduled_at).getTime() > Date.now()) return false;
  return true;
}

/**
 * Merge validated photo metadata into an existing metadata object,
 * preserving unrelated keys (context, community_id, challenge_id...).
 * Passing { __clear: true }... not supported — callers set explicit nulls.
 */
export function mergeMetadata(existing = {}, photoMeta = {}) {
  return { ...(existing || {}), ...photoMeta };
}

export const PERMISSIONS_ON = { comments: 'on', reactions: 'on', sharing: 'on', saving: 'on' };

/**
 * Load a social post's access state for interaction gating.
 * Works with any client: RLS hides unauthorized rows first, then
 * canViewPost() applies the same rule in-app (defense in depth, and
 * correct once the owner/follower read policies are applied).
 *
 * @returns {Promise<{ post, canView: boolean, isOwner: boolean, permissions }>}
 */
export async function fetchSocialPostAccess(db, postId, viewerId) {
  const fallback = { post: null, canView: false, isOwner: false, permissions: { ...PERMISSIONS_ON } };
  if (!db || !postId) return fallback;
  try {
    const { data: post } = await db
      .from('social_posts')
      .select('id, user_id, visibility, metadata')
      .eq('id', postId)
      .maybeSingle();
    if (!post) return fallback;
    const isOwner = !!viewerId && viewerId === post.user_id;
    let isFollower = false;
    if (!isOwner && viewerId && post.visibility === VISIBILITY.FOLLOWERS) {
      const { data: follow } = await db
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('following_id', post.user_id)
        .maybeSingle();
      isFollower = !!follow;
    }
    return {
      post,
      canView: canViewPost(post, viewerId, isFollower),
      isOwner,
      permissions: { ...PERMISSIONS_ON, ...(post.metadata?.permissions || {}) },
    };
  } catch {
    return fallback;
  }
}

/** Privacy notices shown in the composer before publishing. */
export function publishNotices({ visibility, meta = {} }) {
  const notices = [];
  if (meta.location) notices.push('Location will be visible on this post.');
  if (meta.email) notices.push('Email will be visible to people who can view this post.');
  if (meta.website) notices.push('Website link will be visible on this post.');
  if (meta.contact) notices.push('Contact info will be visible on this post.');
  if (visibility === VISIBILITY.PUBLIC) notices.push('Anyone on BurnBoard will be able to see this post.');
  else if (visibility === VISIBILITY.FOLLOWERS) notices.push('Only your followers will be able to see this post.');
  else if (visibility === VISIBILITY.ONLY_ME) notices.push('Only you will be able to see this post.');
  return notices;
}
