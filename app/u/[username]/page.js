'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Flame, ArrowLeft, Calendar, Loader2, Settings, Users, UserCheck,
  Globe, Pin, BarChart3
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import FollowButton from '@/components/social/FollowButton';
import ShareButton from '@/components/growth/ShareButton';
import { FeedCard } from '@/components/feed';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { getParticipantId } from '@/components/feed/ReactionBar';
import { track } from '@/lib/analytics';
import LevelBadge from '@/components/reputation/LevelBadge';
import BadgeGrid from '@/components/reputation/BadgeGrid';
import StreakDisplay from '@/components/reputation/StreakDisplay';
import ProfileSafetyActions from '@/components/safety/ProfileSafetyActions';

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
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('posts');
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);

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
        const viewerId = getParticipantId();
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

  // Fetch content
  useEffect(() => {
    if (!profile?.id) return;

    const fetchContent = async () => {
      setContentLoading(true);
      try {
        const res = await fetch(`/api/profile/content?user_id=${profile.id}&limit=20`);
        const data = await res.json();
        if (res.ok) {
          setContent(data.items || []);
        }
      } catch (err) {
        console.error('[Profile] Content error:', err);
      } finally {
        setContentLoading(false);
      }
    };

    fetchContent();
  }, [profile?.id]);

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
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back Link */}
        <Link href="/home" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Feed</span>
        </Link>

        {/* Profile Header */}
        <div className="bg-[#111] border border-[#222] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-4">
            <Avatar
              username={profile.username}
              size="xl"
              src={profile.avatarUrl}
              showRing={isOwnProfile}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-black text-white">
                  @{profile.username}
                </h1>
                {profile.level && profile.level !== 'Newbie' && (
                  <Badge variant="burn" size="xs">{profile.level}</Badge>
                )}
              </div>

              {profile.displayName && (
                <p className="text-sm text-zinc-300 mt-1">{profile.displayName}</p>
              )}

              {profile.bio && (
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{profile.bio}</p>
              )}

              {/* Link in bio (real website only) */}
              {profile.websiteUrl && (
                <a
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-[#ff4d00] hover:text-white mt-2 transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {profile.websiteUrl.replace(/^https?:\/\//, '').split('/')[0]}
                </a>
              )}

              {/* Creator Topic identity tags (controlled, public) */}
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
          </div>

          {/* Stats + Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1a1a1a]">
            <div className="flex items-center gap-6">
              {/* Followers */}
              <button
                onClick={() => setShowFollowers(true)}
                className="text-center hover:opacity-80 transition-opacity"
              >
                <p className="text-sm font-black text-white">{formatCount(stats.followerCount)}</p>
                <p className="text-[10px] font-mono text-zinc-500">Followers</p>
              </button>

              {/* Following */}
              <button
                onClick={() => setShowFollowing(true)}
                className="text-center hover:opacity-80 transition-opacity"
              >
                <p className="text-sm font-black text-white">{formatCount(stats.followingCount)}</p>
                <p className="text-[10px] font-mono text-zinc-500">Following</p>
              </button>

              {/* Posts */}
              <div className="text-center">
                <p className="text-sm font-black text-[#ff4d00]">{formatCount(stats.postCount + stats.roastCount)}</p>
                <p className="text-[10px] font-mono text-zinc-500">Posts</p>
              </div>
              {reputation && (
                <div className="text-center">
                  <p className="text-sm font-black text-[#f97316]">🔥 {formatCount(reputation.rep)}</p>
                  <p className="text-[10px] font-mono text-zinc-500">Burn Rep</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <ShareButton
                resourceType="profile"
                resourceId={profile.id}
                url={typeof window !== 'undefined' ? window.location.href : `https://burnboard.app/u/${profile.username}`}
                title={`@${profile.username} on BurnBoard`}
                text={`Follow @${profile.username} on BurnBoard 🔥`}
                variant="ghost"
                label="Share"
                className="px-3 py-2 text-xs"
              />
              {isOwnProfile ? (
                <>
                  <Link
                    href="/creator"
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#ff4d00] text-black text-xs font-mono font-bold rounded-xl transition-all hover:bg-[#ff6622]"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Creator Studio
                  </Link>
                  <Link
                    href="/settings/profile"
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[#ff4d00]/50 text-zinc-300 hover:text-white text-xs font-mono font-bold rounded-xl transition-all"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Edit Profile
                  </Link>
                </>
              ) : (
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <FollowButton
                    targetUserId={profile.id}
                    initialIsFollowing={isFollowing}
                    initialFollowerCount={stats.followerCount}
                    onFollowChange={handleFollowChange}
                  />
                  <ProfileSafetyActions
                    targetUserId={profile.id}
                    targetUsername={profile.username}
                    onBlocked={() => setContent([])}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Level Progress */}
        {reputation && (
          <LevelBadge reputation={reputation.rep} />
        )}

        {/* Streak */}
        {streak && streak.current_streak > 0 && (
          <StreakDisplay userId={profile.id} />
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-3">Badges</h3>
            <BadgeGrid userId={profile.id} isOwnProfile={isOwnProfile} />
          </div>
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

        {/* Content Tabs */}
        <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222]">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'posts'
                ? 'bg-[#ff4d00] text-black'
                : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('roasts')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'roasts'
                ? 'bg-[#ff4d00] text-black'
                : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            🔥 Roasts
          </button>
        </div>

        {/* Content */}
        {contentLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : content.length === 0 ? (
          <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-3">
            <div className="text-3xl">🦗</div>
            <p className="text-sm font-bold text-zinc-400">
              {isOwnProfile ? 'No posts yet' : 'No content yet'}
            </p>
            <p className="text-xs text-zinc-500">
              {isOwnProfile
                ? 'Start sharing your thoughts with the community!'
                : 'This user hasn\'t posted anything yet.'}
            </p>
            {isOwnProfile && (
              <Link
                href="/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl"
              >
                <Flame className="w-4 h-4 fill-black" />
                Create Post
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {content.filter(item => item.id !== featured?.id).map(item => (
              <FeedCard key={item.id} item={item} />
            ))}
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
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const viewerId = getParticipantId();
        const res = await fetch(`/api/follow/list?user_id=${userId}&type=${type}&viewer_id=${encodeURIComponent(viewerId || '')}`);
        const data = await res.json();
        if (res.ok) {
          setUsers(data.users || []);
          setHasMore(data.hasMore);
        }
      } catch {} finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [userId, type]);

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
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a1a] transition-all"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
