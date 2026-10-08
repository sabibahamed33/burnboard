import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { relationshipBetween } from '@/lib/safety';

/**
 * GET /api/profile?username=xxx or GET /api/profile?user_id=xxx
 * 
 * Get a user's profile with follow status.
 * 
 * POST /api/profile
 * 
 * Update the current user's profile.
 * 
 * Body:
 *   - display_name: string (optional)
 *   - bio: string (optional, max 200 chars)
 *   - avatar_url: string (optional)
 *   - username: string (optional, for username change)
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const userId = searchParams.get('user_id');
    const viewerIdParam = searchParams.get('viewer_id');

    if (!username && !userId) {
      return NextResponse.json({ error: 'Missing username or user_id' }, { status: 400 });
    }

    // Authoritative viewer: the signed-in session wins over any
    // client-supplied viewer_id (prevents follow/owner spoofing).
    let viewerId = viewerIdParam || null;
    let sessionClient = null;
    try {
      const session = await getRequestContext(req);
      if (session?.userId) {
        viewerId = session.userId;
        sessionClient = session.client;
      }
    } catch {}

    // Fetch profile (explicit public columns only — never prefs/secrets).
    const COLUMNS = 'id, username, display_name, bio, avatar_url, website_url, location_text, karma, level, visibility, featured_post_id, is_banned, follower_count, created_at';
    const COLUMNS_FALLBACK = 'id, username, display_name, bio, avatar_url, website_url, karma, level, visibility, featured_post_id, follower_count, created_at';
    let profile = null;
    try {
      let query = supabase.from('user_profiles').select(COLUMNS);
      if (username) {
        query = query.eq('username', username.toLowerCase());
      } else {
        query = query.eq('id', userId);
      }
      const res = await query.single();
      if (res.error) {
        // No row (or RLS-hidden row) reads as not-found, never as a 500.
        if (res.error.code === 'PGRST116') {
          return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        throw res.error;
      }
      profile = res.data;
    } catch (err) {
      // Older snapshots may lack newer columns — retry the base shape
      // rather than failing every profile load.
      if (!/is_banned|location_text|column/i.test(err?.message || '')) {
        throw err;
      }
      let query = supabase.from('user_profiles').select(COLUMNS_FALLBACK);
      if (username) {
        query = query.eq('username', username.toLowerCase());
      } else {
        query = query.eq('id', userId);
      }
      const res = await query.single();
      if (res.error || !res.data) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      profile = res.data;
    }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isOwnProfile = !!viewerId && viewerId === profile.id;

    // Suspended accounts are not publicly discoverable (owner still sees
    // their own profile with status, plus the appeal path in-app).
    if (profile.is_banned && !isOwnProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Blocked relationships hide the profile both directions (same 404 —
    // never confirm or deny the account through this surface). The check
    // runs on the session client because the relationship RPC only answers
    // for the signed-in viewer.
    if (viewerId && sessionClient && !isOwnProfile) {
      try {
        const rel = await relationshipBetween(sessionClient, viewerId, profile.id);
        if (rel.viewer_blocks_other || rel.other_blocks_viewer) {
          return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
      } catch {}
    }

    // Get follow counts
    const [followersResult, followingResult] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profile.id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id),
    ]);

    // Get post count (social_posts)
    const { count: postCount } = await supabase
      .from('social_posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id);

    // Get roast count (roasts authored by user)
    const { count: roastCount } = await supabase
      .from('roasts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id);

    // Creator Topic identity tags (public, like a bio) — best-effort read so
    // profiles keep loading even before the creator migration is applied.
    let creatorTopics = [];
    try {
      const { data: topicRows } = await supabase
        .from('creator_topics')
        .select('topic_id, topics(name, slug)')
        .eq('user_id', profile.id);
      creatorTopics = (topicRows || [])
        .map((r) => ({
          id: r.topic_id,
          name: r.topics?.name || null,
          slug: r.topics?.slug || null,
        }))
        .filter((t) => t.name);
    } catch {
      creatorTopics = [];
    }

    // Check if viewer follows this user
    let isFollowing = false;
    if (viewerId && viewerId !== profile.id) {
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('following_id', profile.id)
        .single();
      isFollowing = !!data;
    }

    // Social proof: does this user follow the viewer back? (real, single row)
    let followsViewer = false;
    if (viewerId && viewerId !== profile.id) {
      try {
        const { data: back } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', profile.id)
          .eq('following_id', viewerId)
          .maybeSingle();
        followsViewer = !!back;
      } catch {}
    }

    // Check if this is the viewer's own profile (resolved above).
    return NextResponse.json({
      profile: {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        websiteUrl: profile.website_url || '',
        location: profile.location_text || '',
        creatorTopics,
        featuredPostId: profile.featured_post_id || null,
        karma: profile.karma,
        level: profile.level,
        visibility: profile.visibility,
        isBanned: !!profile.is_banned,
        createdAt: profile.created_at,
      },
      stats: {
        followerCount: followersResult.count || 0,
        followingCount: followingResult.count || 0,
        postCount: postCount || 0,
        roastCount: roastCount || 0,
      },
      isFollowing,
      followsViewer,
      isOwnProfile,
    });
  } catch (err) {
    console.error('[Profile] GET Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { display_name, bio, avatar_url, username, website_url, location } = body;

    // Validate fields
    const updates = {};

    if (display_name !== undefined) {
      if (typeof display_name !== 'string' || display_name.length > 50) {
        return NextResponse.json({ error: 'Display name must be 50 characters or less' }, { status: 400 });
      }
      updates.display_name = display_name.trim();
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 200) {
        return NextResponse.json({ error: 'Bio must be 200 characters or less' }, { status: 400 });
      }
      updates.bio = bio.trim();
    }

    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url || null;
    }

    // Website (link-in-bio) — only http(s) links are stored and displayed.
    if (website_url !== undefined) {
      let clean = (typeof website_url === 'string' ? website_url : '').trim();
      if (clean) {
        if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
        if (clean.length > 200 || /\s/.test(clean) || !/^https?:\/\/[^\s]+$/i.test(clean)) {
          return NextResponse.json(
            { error: 'Website must be a valid URL (max 200 characters)' },
            { status: 400 }
          );
        }
        updates.website_url = clean;
      } else {
        updates.website_url = null;
      }
    }

    // Display location — explicit free text only (city/region), max 60.
    // Never GPS, never automatic.
    if (location !== undefined) {
      const cleanLoc = (typeof location === 'string' ? location : '').trim().slice(0, 60);
      updates.location_text = cleanLoc || null;
    }

    // Username change (special validation)
    if (username !== undefined) {
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      
      if (cleanUsername.length < 3 || cleanUsername.length > 20) {
        return NextResponse.json({ error: 'Username must be 3-20 characters (letters, numbers, underscores only)' }, { status: 400 });
      }

      // Reserved usernames
      const reserved = ['admin', 'support', 'help', 'system', 'burnboard', 'mod', 'official'];
      if (reserved.includes(cleanUsername)) {
        return NextResponse.json({ error: 'This username is reserved' }, { status: 400 });
      }

      // Check uniqueness
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('username', cleanUsername)
        .neq('id', user.id)
        .single();

      if (existing) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 400 });
      }

      updates.username = cleanUsername;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Update profile
    const { data: updated, error: updateError } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Profile] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        bio: updated.bio,
        avatarUrl: updated.avatar_url,
        websiteUrl: updated.website_url || '',
      },
    });
  } catch (err) {
    console.error('[Profile] POST Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
