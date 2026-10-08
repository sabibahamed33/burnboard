'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Flame, ArrowLeft, Calendar, Loader2, Settings, Users, UserCheck,
  Globe, Pin, BarChart3, MessageCircle
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import FollowButton from '@/components/social/FollowButton';
import ShareButton from '@/components/growth/ShareButton';
import { FeedCard } from '@/components/feed';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { getViewerId } from '@/lib/identity';
import { track } from '@/lib/analytics';
import LevelBadge from '@/components/reputation/LevelBadge';
import BadgeGrid from '@/components/reputation/BadgeGrid';
import StreakDisplay from '@/components/reputation/StreakDisplay';
import ProfileSafetyActions from '@/components/safety/ProfileSafetyActions';
import DraftsShelf from '@/components/profile/DraftsShelf';
import { getUserCommunities } from '@/lib/communities';
import { getLevelInfo } from '@/lib/reputation/config';
import { formatCompact } from '@/lib/format';

/**
 * /u/:username — Enhanced Social Profile Page
 * 
 * Full profile with:
 *   - Identity (avatar, name, bio)
 *   - Social counts (followers, following)
 *   - Follow/Unfollow action
 *   - User content (posts + roasts)
 *   - Followers/Following lists
 */

function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function UserProfilePage() {
  const params = useParams();
  const { username } = params;

  const [profile, setProfile] = useState(null);
  const [featured, setFeatured] = useState(null);
  const [stats, setStats] = useState({ followerCount: 0, followingCount: 0, postCount: 0, roastCount: 0 });
  const [reputation, setReputation] = useState(null);
  const [badges, setBadges] = useState([]);
  const [streak, setStreak] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsViewer, setFollowsViewer] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [content, setContent] = useState([]);
  const [roasts, setRoasts] = useState([]);
  const [contentCursor, setContentCursor] = useState(null);
  const [contentHasMore, setContentHasMore] = useState(false);
  const [contentLoadingMore, setContentLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('posts');
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [communities, setCommunities] = useState([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(true);

  // Fetch profile
  useEffect(() => {
    if (!username) return;

    const fetchProfile = async () => {
      if (!isSupabaseConfigured || !supabase) {
        console.error('[Profile] Backend not configured');
        setError('Profile service is temporarily unavailable. Please try again later.');
        setLoading(false);
        return;
      }

      try {
        // Prefer the auth user id so isFollowing/isOwnProfile resolve
        // correctly for signed-in viewers (anon participant ids never match).
        const { viewerId } = await getViewerId();
        const res = await fetch(`/api/profile?username=${encodeURIComponent(username)}&viewer_id=${encodeURIComponent(viewerId || '')}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Profile not found');
          setLoading(false);
          return;
        }

        setProfile(data.profile);
        setStats(data.stats);
        setIsFollowing(data.isFollowing);
        setFollowsViewer(!!data.followsViewer);
        setIsOwnProfile(data.isOwnProfile);
        
        // Fetch reputation data
        const repRes = await fetch(`/api/reputation?type=user&user_id=${data.profile.id}`);
        if (repRes.ok) {
          const repData = await repRes.json();
          setReputation(repData.reputation);
          setBadges(repData.badges || []);
          setStreak(repData.streak);
        }
        
        track('profile_viewed', { username, userId: data.profile.id });
      } catch (err) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  // Fetch content (published posts + authored roasts, cursor-paged)
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    const fetchContent = async () => {
      setContentLoading(true);
      try {
        const [postsRes, roastsRes] = await Promise.all([
          fetch(`/api/profile/content?user_id=${profile.id}&limit=20`),
          fetch(`/api/profile/content?user_id=${profile.id}&limit=20&filter=roasts`),
        ]);
        if (cancelled) return;
        const postsData = await postsRes.json().catch(() => ({}));
        const roastsData = await roastsRes.json().catch(() => ({}));
        if (postsRes.ok) {
          setContent(postsData.items || []);
          setContentCursor(postsData.nextCursor || null);
          setContentHasMore(!!postsData.hasMore);
        }
        if (roastsRes.ok) {
          setRoasts(roastsData.items || []);
        }
      } catch (err) {
        console.error('[Profile] Content error:', err);
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    };

    fetchContent();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const loadMoreContent = useCallback(async () => {
    if (contentLoadingMore || !contentCursor || !profile?.id) return;
    setContentLoadingMore(true);
    try {
      const res = await fetch(`/api/profile/content?user_id=${profile.id}&limit=20&cursor=${encodeURIComponent(contentCursor)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const seen = new Set(content.map((c) => c.id));
        setContent((prev) => [...prev, ...((data.items || []).filter((i) => i && !seen.has(i.id)))]);
        setContentCursor(data.nextCursor || null);
        setContentHasMore(!!data.hasMore);
      }
    } catch (err) {
      console.error('[Profile] Content error:', err);
    } finally {
      setContentLoadingMore(false);
    }
  }, [contentCursor, contentLoadingMore, content, profile?.id]);

  // Tab-visible items: Posts (non-photo), Photos, Roasts (authored).
  const tabItems = activeTab === 'photos'
    ? content.filter((i) => i.type === 'photo' || i.contentType === 'photo')
    : activeTab === 'roasts'
      ? roasts
      : content.filter((i) => (i.type || i.contentType) !== 'photo');

  // Public communities (private/hidden memberships stay invisible to
  // other viewers; the owner sees their own full list).
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      setCommunitiesLoading(true);
      try {
        const list = await getUserCommunities(profile.id);
        if (cancelled) return;
        const visible = isOwnProfile
          ? (list || [])
          : (list || []).filter((c) => c.visibility === 'public');
        setCommunities(visible.slice(0, 6));
      } catch {
        if (!cancelled) setCommunities([]);
      } finally {
        if (!cancelled) setCommunitiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, isOwnProfile]);

  // Fetch pinned/featured content (public read; validated server-side)
  useEffect(() => {
    if (!profile?.featuredPostId || !username) {
      setFeatured(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/profile/featured?username=${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setFeatured(d.item || null); })
      .catch(() => { if (!cancelled) setFeatured(null); });
    return () => { cancelled = true; };
  }, [profile?.featuredPostId, username]);

  // Handle follow change
  const handleFollowChange = useCallback((newIsFollowing, newCount) => {
    setIsFollowing(newIsFollowing);
    setStats(prev => ({ ...prev, followerCount: newCount }));
  }, []);

  // Owner post controls: drop deleted/unpublished rows, merge edits.
  const handleDeletedContent = useCallback((item) => {
    setContent(prev => prev.filter(x => !(x.id === item.id)));
    setRoasts(prev => prev.filter(x => !(x.id === item.id)));
  }, []);
  const handleUpdatedContent = useCallback((updated) => {
    setContent(prev => prev.map(x => (x.id === updated.id ? updated : x)));
    setRoasts(prev => prev.map(x => (x.id === updated.id ? updated : x)));
  }, []);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-2 text-zinc-400 font-mono text-xs">
            <ArrowLeft className="w-4 h-4" />
            <span>BACK</span>
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  // Error
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="text-4xl">👤</div>
          <h1 className="text-xl font-bold text-white">Profile Not Found</h1>
          <p className="text-xs text-zinc-400 max-w-sm">
            {error || `No user found with username @${username}`}
          </p>
          <Link
            href="/home"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-4 sm:px-6 pt-4 sm:pt-6 pb-28 sm:pb-16 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back Link */}
        <Link href="/home" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Feed</span>
        </Link>

        {/* Profile Hero — cover, avatar, identity, actions, stats */}
        <section aria-label="Profile" className="overflow-hidden rounded-3xl border border-white/10 bg-[#101012]">
          {/* Cover: ambient gradient (no fabricated imagery) */}
          <div
            className="h-28 bg-gradient-to-br from-[#2a1200] via-[#140a06] to-[#0a0a0a] sm:h-36"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,rgba(255,77,0,0.22),transparent_65%)]" />
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="-mt-14 flex items-end justify-between gap-3 sm:-mt-16">
              <div className="rounded-full ring-4 ring-[#101012]">
                <Avatar
                  username={profile.username}
                  size="xl"
                  src={profile.avatarUrl}
                  showRing={isOwnProfile}
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <ShareButton
                  resourceType="profile"
                  resourceId={profile.id}
                  url={typeof window !== 'undefined' ? window.location.href : `https://burnboard.app/u/${profile.username}`}
                  title={`@${profile.username} on BurnBoard`}
                  text={`Follow @${profile.username} on BurnBoard 🔥`}
                  variant="ghost"
                  label="Share"
                  className="px-3 py-2 text-xs min-h-[44px]"
                />
                {isOwnProfile ? (
                  <Link
                    href="/settings/profile"
                    className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-bold text-zinc-200 transition-all hover:border-[#ff4d00]/50 hover:text-white"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Edit Profile
                  </Link>
                ) : (
                  <ProfileSafetyActions
                    targetUserId={profile.id}
                    targetUsername={profile.username}
                    onBlocked={() => { setContent([]); setRoasts([]); }}
                  />
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black tracking-tight text-white break-all">
                  {profile.displayName || `@${profile.username}`}
                </h1>
                {profile.level && profile.level !== 'Newbie' && (
                  <Badge variant="burn" size="xs">{profile.level}</Badge>
                )}
                {followsViewer && !isOwnProfile && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                    Follows you
                  </span>
                )}
              </div>
              <p className="font-mono text-[13px] text-zinc-500">@{profile.username}</p>

              {profile.bio && (
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{profile.bio}</p>
              )}

              {/* Link in bio (real website only) */}
              {profile.websiteUrl && (
                <a
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#ff4d00] hover:text-white mt-2 transition-colors break-all"
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  {profile.websiteUrl.replace(/^https?:\/\//, '').split('/')[0]}
                </a>
              )}

              {/* Explicit display location (user-entered only, never GPS) */}
              {profile.location && (
                <p className="text-xs font-mono text-zinc-500 mt-1.5 truncate">
                  📍 {profile.location}
                </p>
              )}

              {/* Suspended-owner notice with appeal path */}
              {isOwnProfile && profile.isBanned && (
                <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                  Your account is currently suspended and hidden from others.{' '}
                  <Link href="/settings/safety" className="font-bold underline underline-offset-2">
                    Review or appeal
                  </Link>
                </div>
              )}

              {/* Topic identity tags (controlled, public) */}
              {profile.creatorTopics && profile.creatorTopics.length > 0 && (
                <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                  {profile.creatorTopics.map((topic) => (
                    <span
                      key={topic.id}
                      className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-zinc-300"
                    >
                      {topic.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 mt-3 text-[11px] font-mono text-zinc-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Joined {timeAgo(profile.createdAt)}
                </span>
                {reputation && (
                  <LevelBadge reputation={reputation.rep} compact />
                )}
                {streak && streak.current_streak > 0 && (
                  <StreakDisplay userId={profile.id} compact />
                )}
              </div>
            </div>

          {/* Follow / Message (other users) */}
          {!isOwnProfile && (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <FollowButton
                  targetUserId={profile.id}
                  initialIsFollowing={isFollowing}
                  initialFollowerCount={stats.followerCount}
                  onFollowChange={handleFollowChange}
                />
              </div>
              <Link
                href={`/messages?user=${profile.id}`}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-zinc-200 transition-all hover:border-[#ff4d00]/50 hover:text-white"
                aria-label={`Message @${profile.username}`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Message
              </Link>
            </div>
          )}

          {/* Owner insights shortcut */}
          {isOwnProfile && (
            <Link
              href="/insights"
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#ff4d00] text-xs font-black uppercase tracking-wider text-black transition-all hover:bg-[#ff6622] active:scale-[0.99]"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              My Insights
            </Link>
          )}

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
            <button
              onClick={() => setShowFollowers(true)}
              className="min-h-[52px] rounded-xl text-center transition-colors hover:bg-white/5"
            >
              <p className="text-[15px] font-black text-white">{formatCount(stats.followerCount)}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Followers</p>
            </button>
            <button
              onClick={() => setShowFollowing(true)}
              className="min-h-[52px] rounded-xl text-center transition-colors hover:bg-white/5"
            >
              <p className="text-[15px] font-black text-white">{formatCount(stats.followingCount)}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Following</p>
            </button>
            <div className="flex min-h-[52px] flex-col items-center justify-center text-center">
              <p className="text-[15px] font-black text-[#ff4d00]">{formatCount(stats.postCount + stats.roastCount)}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Posts</p>
            </div>
            <div className="flex min-h-[52px] flex-col items-center justify-center text-center">
              <p className="text-[15px] font-black text-[#ff4d00]">
                {reputation ? `🔥 ${formatCount(reputation.rep)}` : '—'}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Burn Rep</p>
            </div>
          </div>
          </div>
        </section>

        {/* Level / XP card (same engine as Rank) */}
        {reputation && (() => {
          const info = getLevelInfo(reputation.rep || 0);
          return (
            <section aria-label="Level progress" className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-extrabold tracking-tight text-white">
                  LEVEL {info.level} · {info.name} {info.emoji}
                </p>
                <p className="font-mono text-[11px] text-zinc-400">
                  {formatCompact(reputation.rep || 0)} XP
                </p>
              </div>
              <div
                className="mt-2.5 h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/60"
                role="progressbar"
                aria-valuenow={Math.round(info.progress || 0)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="XP progress to next level"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-600 to-[#ff4d00] transition-all duration-500"
                  style={{ width: `${Math.min(100, info.progress || 0)}%` }}
                />
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-zinc-500">
                {info.nextLevel
                  ? `${formatCompact(info.progressToNext)} XP to ${info.nextLevel.name}`
                  : 'Max level reached'}
              </p>
            </section>
          );
        })()}

        {/* Streak */}
        {streak && streak.current_streak > 0 && (
          <StreakDisplay userId={profile.id} />
        )}

        {/* Achievements */}
        {badges.length > 0 && (
          <section aria-label="Achievements" className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <h3 className="mb-3 text-[13px] font-extrabold tracking-tight text-white">Achievements</h3>
            <BadgeGrid userId={profile.id} isOwnProfile={isOwnProfile} />
          </section>
        )}

        {/* Communities (public only for other viewers) */}
        {!communitiesLoading && communities.length > 0 && (
          <section aria-label="Communities" className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <h3 className="mb-2 text-[13px] font-extrabold tracking-tight text-white">Communities</h3>
            <div className="space-y-1">
              {communities.map((c) => (
                <Link
                  key={c.id}
                  href={`/c/${c.slug}`}
                  className="flex min-h-[44px] items-center justify-between rounded-xl px-2 py-2 transition-colors hover:bg-white/5"
                >
                  <span className="truncate text-[13px] font-semibold text-zinc-200">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {isOwnProfile && ['owner', 'admin', 'moderator'].includes(c.role) && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] capitalize text-zinc-400">
                        {c.role}
                      </span>
                    )}
                    <span aria-hidden="true" className="text-zinc-600">›</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured / pinned content */}
        {featured && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
              <Pin className="w-3 h-3" />
              Featured by {isOwnProfile ? 'you' : `@${profile.username}`}
            </div>
            <FeedCard item={featured} />
          </div>
        )}

        {/* Owner-only private drafts shelf (invisible to other viewers) */}
        <DraftsShelf userId={profile.id} enabled={isOwnProfile} />

        {/* Content Tabs */}
        <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto no-scrollbar" role="tablist" aria-label="Profile content">
          {[
            { key: 'posts', label: 'Posts' },
            { key: 'photos', label: 'Photos' },
            { key: 'roasts', label: '🔥 Roasts' },
          ].map((tabItem) => (
            <button
              key={tabItem.key}
              role="tab"
              aria-selected={activeTab === tabItem.key}
              onClick={() => setActiveTab(tabItem.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap min-h-[44px] ${
                activeTab === tabItem.key
                  ? 'bg-[#ff4d00] text-black'
                  : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {contentLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : tabItems.length === 0 ? (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-3">
            <div className="text-3xl">🦗</div>
            <p className="text-sm font-bold text-zinc-400">
              {isOwnProfile
                ? (activeTab === 'photos' ? 'No photos yet' : activeTab === 'roasts' ? 'No roasts yet' : 'No posts yet')
                : 'No content yet'}
            </p>
            <p className="text-xs text-zinc-500">
              {isOwnProfile
                ? 'Start sharing your thoughts with the community!'
                : 'This user hasn\'t posted anything yet.'}
            </p>
            {isOwnProfile && (
              <Link
                href="/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl min-h-[44px]"
              >
                <Flame className="w-4 h-4 fill-black" />
                Create Post
              </Link>
            )}
          </div>
        ) : activeTab === 'photos' ? (
          <div>
            <div className="grid grid-cols-3 gap-1.5" role="list" aria-label="Photos">
              {tabItems.filter(item => item.id !== featured?.id).map(item => (
                <Link
                  key={item.id}
                  href={`/post/${item.id}`}
                  role="listitem"
                  aria-label="Open photo post"
                  className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-[#141416]"
                >
                  {item.mediaUrl ? (
                    <img
                      src={item.mediaUrl}
                      alt="User photo"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] leading-snug text-zinc-400">
                      {item.text ? (item.text.length > 80 ? `${item.text.slice(0, 80)}…` : item.text) : 'Post'}
                    </span>
                  )}
                  {(item.upvotes > 0 || item.commentCount > 0) && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 font-mono text-[10px] text-white backdrop-blur-md">
                      ▲ {formatCount(item.upvotes || 0)}{item.commentCount > 0 ? ` · 💬 ${formatCount(item.commentCount)}` : ''}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            {contentHasMore && (
              <button
                onClick={loadMoreContent}
                disabled={contentLoadingMore}
                className="mt-3 w-full min-h-[44px] rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:text-white hover:border-white/25 transition-all disabled:opacity-50"
              >
                {contentLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {tabItems.filter(item => item.id !== featured?.id).map(item => (
              <FeedCard key={item.id} item={item} onDeleted={handleDeletedContent} onUpdated={handleUpdatedContent} />
            ))}
            {activeTab !== 'roasts' && contentHasMore && (
              <button
                onClick={loadMoreContent}
                disabled={contentLoadingMore}
                className="w-full min-h-[44px] rounded-2xl border border-[#222] bg-[#111] text-xs font-mono font-bold text-zinc-300 hover:text-white hover:border-[#333] transition-all disabled:opacity-50"
              >
                {contentLoadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}

        {/* Followers Modal */}
        {showFollowers && (
          <FollowListModal
            userId={profile.id}
            type="followers"
            onClose={() => setShowFollowers(false)}
          />
        )}

        {/* Following Modal */}
        {showFollowing && (
          <FollowListModal
            userId={profile.id}
            type="following"
            onClose={() => setShowFollowing(false)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * FollowListModal — Shows followers or following list
 */
function FollowListModal({ userId, type, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchUsers = async () => {
      try {
        const { viewerId } = await getViewerId();
        const res = await fetch(`/api/follow/list?user_id=${userId}&type=${type}&viewer_id=${encodeURIComponent(viewerId || '')}&limit=20`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setUsers(data.users || []);
          setCursor(data.nextCursor || null);
          setHasMore(!!data.hasMore);
        }
      } catch {} finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchUsers();
    return () => { cancelled = true; };
  }, [userId, type]);

  const loadMore = async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const { viewerId } = await getViewerId();
      const res = await fetch(`/api/follow/list?user_id=${userId}&type=${type}&viewer_id=${encodeURIComponent(viewerId || '')}&limit=20&cursor=${encodeURIComponent(cursor)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const seen = new Set(users.map((u) => u.id));
        setUsers((prev) => [...prev, ...((data.users || []).filter((u) => u && !seen.has(u.id)))]);
        setCursor(data.nextCursor || null);
        setHasMore(!!data.hasMore);
      }
    } catch {} finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#111] border-t sm:border border-[#222] sm:rounded-2xl max-h-[80vh] overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#222]">
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            {type === 'followers' ? 'Followers' : 'Following'}
          </h3>
          <button onClick={onClose} className="text-xs font-mono text-zinc-400 hover:text-white">
            Close
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[60vh] p-2">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-[#222]" />
                  <div className="space-y-2 flex-1">
                    <div className="w-24 h-3 bg-[#222] rounded" />
                    <div className="w-16 h-2 bg-[#1a1a1a] rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <div className="text-2xl">{type === 'followers' ? '👥' : '🔍'}</div>
              <p className="text-sm text-zinc-400">
                {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {users.map(user => (
                <Link
                  key={user.id}
                  href={`/u/${user.username}`}
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a1a] transition-all min-h-[56px]"
                >
                  <Avatar username={user.username} size="md" src={user.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      @{user.username}
                    </p>
                    {user.display_name && (
                      <p className="text-[11px] text-zinc-400 truncate">{user.display_name}</p>
                    )}
                  </div>
                </Link>
              ))}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full min-h-[44px] rounded-xl border border-[#222] text-[11px] font-mono font-bold text-zinc-300 hover:text-white transition-all disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
