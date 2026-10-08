/**
 * BURNBOARD Personalization — Feed Item Transforms
 *
 * Shared transforms so every feed surface (generic feed, personalized For
 * You, Following, community feeds) produces identical FeedCard-ready items.
 * Shapes are kept exactly compatible with the pre-existing /api/feed
 * transforms — cards, reactions, and navigation keep working unchanged.
 */

/**
 * Transform a roast row into a feed item.
 * Raw shape: roast + profiles!inner(...)
 */
export function transformRoastItem(roast) {
  const profile = roast.profiles;
  return {
    id: roast.id,
    type: 'roast',
    text: roast.roast_text,
    author: {
      id: profile?.id,
      username: profile?.username,
      platform: profile?.platform,
      avatarLetter: profile?.avatar_letter,
      avatarColor: profile?.avatar_color,
      tagline: profile?.tagline,
    },
    reactions: {
      funny: roast.reaction_haha || 0,
      savage: roast.reaction_brutal || 0,
      fatal: roast.reaction_cry || 0,
    },
    totalReactions: (roast.reaction_haha || 0) + (roast.reaction_brutal || 0) + (roast.reaction_cry || 0),
    upvotes: roast.upvotes || 0,
    anonId: roast.anon_id,
    userId: roast.user_id,
    profileId: roast.profile_id,
    createdAt: roast.created_at,
    _raw: roast,
  };
}

/**
 * Transform a social_posts row into a feed item.
 * Raw shape: post + user_profiles!inner(...) (+ polls(*) optional)
 */
export function transformSocialPostItem(post) {
  const profile = post.user_profiles;
  return {
    id: post.id,
    type: post.content_type,
    text: post.content_text,
    mediaUrl: post.media_url,
    context: post.metadata?.context || null,
    author: {
      id: profile?.id,
      username: profile?.username,
      displayName: profile?.display_name,
      avatarLetter: profile?.username?.[0]?.toUpperCase() || '?',
      avatarColor: null,
      tagline: profile?.bio,
    },
    reactions: {
      funny: 0,
      savage: 0,
      fatal: 0,
    },
    totalReactions: 0,
    upvotes: post.upvote_count || 0,
    commentCount: post.comment_count || 0,
    userId: post.user_id,
    visibility: post.visibility || 'public',
    metadata: post.metadata || {},
    createdAt: post.created_at,
    poll: post.polls?.[0] || null,
    _raw: post,
  };
}

/**
 * Generic transform for either raw content type.
 */
export function transformItem(row) {
  if (!row) return null;
  return row.content_type === 'roast' || row.roast_text ? transformRoastItem(row) : transformSocialPostItem(row);
}

/**
 * Coarse engagement signal used for ranking. Mirrors the counters the
 * pre-existing feed used (roasts: the reaction and upvote count columns;
 * social posts: the upvote/comment/reaction count columns) so the
 * personalized ranking never invents engagement numbers.
 */
export function engagementOf(row) {
  if (!row) return 0;
  if (row.roast_text) {
    return (row.upvotes || 0)
      + (row.reaction_haha || 0) * 3
      + (row.reaction_brutal || 0) * 2
      + (row.reaction_cry || 0) * 4;
  }
  return (row.upvote_count || 0)
    + (row.comment_count || 0) * 2
    + (row.reaction_count || 0) * 3;
}
