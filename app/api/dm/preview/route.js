import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/routeAuth';

/**
 * GET /api/dm/preview?kind=social_post|profile|community|challenge|battle&id=
 *
 * Minimal public-safe preview for content shared in DMs. Re-validates
 * visibility at render time, so deleted, moderated, or newly-private
 * content returns { available: false } instead of a stale snapshot.
 * Never exposes more than the corresponding public surface already shows.
 */
export async function GET(req) {
  try {
    const { client, userId } = await getRequestContext(req);
    if (!client || !userId) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind');
    const id = searchParams.get('id');
    if (!kind || !id) {
      return NextResponse.json({ error: 'kind and id are required' }, { status: 400 });
    }

    if (kind === 'social_post') {
      const { data: post } = await client
        .from('social_posts')
        .select('id, content_text, media_url, user_id, visibility, moderation_state')
        .eq('id', id)
        .maybeSingle();
      if (!post || post.moderation_state === 'hidden') {
        return NextResponse.json({ kind, id, available: false });
      }
      const vis = post.visibility || 'public';
      let visible = vis === 'public' || post.user_id === userId;
      if (!visible && vis === 'followers') {
        const { data: follow } = await client
          .from('follows')
          .select('id')
          .eq('follower_id', userId)
          .eq('following_id', post.user_id)
          .maybeSingle();
        visible = !!follow;
      }
      if (!visible) {
        return NextResponse.json({ kind, id, available: false });
      }
      const { data: author } = await client
        .from('user_profiles')
        .select('username')
        .eq('id', post.user_id)
        .maybeSingle();
      return NextResponse.json({
        kind,
        id,
        available: true,
        label: 'Post',
        title: author?.username ? `@${author.username}` : 'Post',
        subtitle: (post.content_text || '').slice(0, 120),
        image: post.media_url || null,
        url: `/post/${post.id}`,
      });
    }

    if (kind === 'profile') {
      const { data: profile } = await client
        .from('user_profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', id)
        .maybeSingle();
      if (!profile) {
        return NextResponse.json({ kind, id, available: false });
      }
      return NextResponse.json({
        kind,
        id,
        available: true,
        label: 'Profile',
        title: profile.display_name || `@${profile.username}`,
        subtitle: `@${profile.username}`,
        image: profile.avatar_url || null,
        url: `/u/${profile.username}`,
      });
    }

    if (kind === 'community') {
      const { data: community } = await client
        .from('communities')
        .select('id, name, slug, avatar_url, visibility, status')
        .eq('id', id)
        .maybeSingle();
      if (!community || community.status !== 'active') {
        return NextResponse.json({ kind, id, available: false });
      }
      if (community.visibility !== 'public') {
        const { data: membership } = await client
          .from('community_members')
          .select('id')
          .eq('community_id', id)
          .eq('user_id', userId)
          .eq('membership_status', 'active')
          .maybeSingle();
        if (!membership) {
          return NextResponse.json({ kind, id, available: false });
        }
      }
      return NextResponse.json({
        kind,
        id,
        available: true,
        label: 'Community',
        title: community.name,
        subtitle: `/c/${community.slug}`,
        image: community.avatar_url || null,
        url: `/c/${community.slug}`,
      });
    }

    if (kind === 'challenge') {
      const { data: challenge } = await client
        .from('challenges')
        .select('id, slug, title, status')
        .eq('id', id)
        .maybeSingle();
      if (!challenge || challenge.status === 'cancelled') {
        return NextResponse.json({ kind, id, available: false });
      }
      return NextResponse.json({
        kind,
        id,
        available: true,
        label: 'Challenge',
        title: challenge.title,
        subtitle: challenge.status === 'active' ? 'Live challenge' : 'Ended challenge',
        image: null,
        url: `/challenges/${challenge.slug}`,
      });
    }

    if (kind === 'battle') {
      const { data: battle } = await client
        .from('battles')
        .select('id, profile1_id, profile2_id')
        .eq('id', id)
        .maybeSingle();
      if (!battle) {
        return NextResponse.json({ kind, id, available: false });
      }
      const { data: fighters } = await client
        .from('profiles')
        .select('id, username')
        .in('id', [battle.profile1_id, battle.profile2_id].filter(Boolean));
      const names = (fighters || []).map((f) => `@${f.username}`).join(' vs ');
      return NextResponse.json({
        kind,
        id,
        available: true,
        label: 'Battle',
        title: names || 'Arena battle',
        subtitle: 'Head-to-head roast battle',
        image: null,
        url: `/battle/${battle.id}`,
      });
    }

    return NextResponse.json({ error: 'Unsupported share type' }, { status: 400 });
  } catch (err) {
    console.error('[DM] Preview error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
