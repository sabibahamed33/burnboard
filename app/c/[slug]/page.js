'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Users, Loader2, Plus, Flame, Shield, BookOpen, UserCog, X,
  Trash2, Check, UserMinus, UserX, Lock, EyeOff, Image as ImageIcon,
  TrendingUp, Info, Flag, BellOff, Bell, Clock, CheckCircle
} from 'lucide-react';
import { FeedCard } from '@/components/feed';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { JoinButton } from '@/components/communities';
import ReportModal from '@/components/safety/ReportModal';
import Avatar from '@/components/ui/Avatar';
import { track } from '@/lib/analytics';
import { isCommunityMuted, setCommunityMuted } from '@/lib/communityMute';

/**
 * /c/:slug — Community Home
 *
 * Discover → See content → Join → Participate → Follow users.
 * Real data only: real membership, real member counts, real community feed
 * (canonical social_posts with the community as context).
 *
 * Privacy: public communities are fully visible; private communities show a
 * preview with request-to-join for outsiders; hidden communities 404 for
 * non-members (the API never reveals their existence).
 */

const COLORS = [
  'bg-[#ff4d00] text-black',
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-purple-600 text-white',
  'bg-pink-600 text-white',
  'bg-amber-500 text-black',
  'bg-cyan-600 text-white',
  'bg-rose-600 text-white',
];

function getColorFromName(name) {
  if (!name) return COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/[\s._-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

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
  return `${d}d ago`;
}

const ROLE_LABELS = { owner: 'Owner', moderator: 'Moderator', member: 'Member', admin: 'Admin' };

export default function CommunityPage() {
  const params = useParams();
  const slug = params.slug;

  const [community, setCommunity] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [topics, setTopics] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Feed state (+ tabs: latest | top | media | about)
  const [tab, setTab] = useState('feed');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);

  // Modals + local preferences
  const [showMembers, setShowMembers] = useState(false);
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [muted, setMuted] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${slug}?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Community not found');
        setLoading(false);
        return;
      }
      setCommunity(data.community);
      setViewer(data.viewer);
      setPermissions(data.permissions);
      setTopics(data.topics || []);
      setRules(data.rules || []);
      setLoading(false);
      setMuted(isCommunityMuted(data.community?.id));
      track('community_viewed', { communityId: data.community.id });
    } catch {
      setError('Failed to load community');
      setLoading(false);
    }
  }, [slug]);

  const fetchFeed = useCallback(async (refresh = false, activeTab = tab) => {
    if (!community?.id) return;
    // About is informational — no feed fetch.
    if (activeTab === 'about') return;
    try {
      if (refresh) {
        setFeedLoading(true);
        setItems([]);
        setCursor(null);
        setHasMore(true);
      } else if (cursor) {
        setFeedLoadingMore(true);
      }

      const paramsObj = new URLSearchParams({ limit: '20' });
      if (cursor && !refresh) paramsObj.set('cursor', cursor);
      if (activeTab === 'top') paramsObj.set('sort', 'top');
      if (activeTab === 'media') paramsObj.set('media', '1');

      const res = await fetch(`/api/communities/${community.id}/feed?${paramsObj}`);
      const data = await res.json();
      if (res.ok) {
        if (refresh || !cursor) {
          setItems(data.items || []);
        } else {
          setItems(prev => [...prev, ...(data.items || [])]);
        }
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }
    } catch (e) {
      console.error('[Community] Feed error:', e);
    } finally {
      setFeedLoading(false);
      setFeedLoadingMore(false);
    }
  }, [community?.id, cursor, tab]);

  // Initial load
  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Load feed once we have the community id
  useEffect(() => {
    if (community?.id && feedLoading) {
      fetchFeed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community?.id]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || feedLoading || feedLoadingMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) fetchFeed(false);
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, feedLoading, feedLoadingMore, fetchFeed]);

  const handleJoinChange = useCallback((isMember, memberCount, pending) => {
    setViewer(prev => ({ ...prev, isMember, membershipStatus: pending ? 'pending' : isMember ? 'active' : null }));
    setCommunity(prev => (prev ? { ...prev, member_count: memberCount } : prev));
    if (isMember) {
      setPermissions(prev => ({ ...prev, canPost: true }));
      // New members land on the live feed.
      fetchFeed(true, 'feed');
      setTab('feed');
    }
  }, [fetchFeed]);

  const switchTab = useCallback((next) => {
    setTab(next);
    if (next !== 'about') {
      setCursor(null);
      fetchFeed(true, next);
    }
  }, [fetchFeed]);

  const toggleMute = useCallback(() => {
    if (!community?.id) return;
    setMuted(prev => {
      const next = !prev;
      setCommunityMuted(community.id, next);
      track(next ? 'community_muted' : 'community_unmuted', { communityId: community.id });
      return next;
    });
  }, [community?.id]);

  const handleRemoveFromCommunity = useCallback(async (item) => {
    if (!community?.id) return;
    if (!window.confirm('Remove this post from the community? The post itself stays live on BurnBoard.')) return;
    try {
      const res = await fetch(`/api/communities/${community.id}/moderation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_post', post_id: item.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        track('community_content_removed', { communityId: community.id, postId: item.id });
      } else {
        alert(data.error || 'Failed to remove post');
      }
    } catch {
      alert('Failed to remove post');
    }
  }, [community?.id]);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-5">
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

  // Error / not found
  if (error || !community) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="text-4xl">🏚️</div>
          <h1 className="text-xl font-bold text-white">Community Not Found</h1>
          <p className="text-xs text-zinc-400 max-w-sm">{error}</p>
          <Link
            href="/c"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse Communities
          </Link>
        </div>
      </div>
    );
  }

  const isMember = viewer?.isMember;
  const isOwner = viewer?.isOwner;
  const isModerator = viewer?.isModerator;
  const isPending = viewer?.membershipStatus === 'pending';
  const visibility = community?.visibility || 'public';
  const isPrivateOutsider = visibility === 'private' && !isMember;
  const communityColor = getColorFromName(community.name);

  const TABS = [
    { key: 'feed', label: 'Feed', icon: Flame },
    { key: 'top', label: 'Top', icon: TrendingUp },
    { key: 'media', label: 'Media', icon: ImageIcon },
    { key: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto flex">
        {/* ═══ Main Column ═══ */}
        <div className="flex-1 min-w-0 max-w-2xl mx-auto lg:mx-0 lg:max-w-none px-4 sm:px-6 py-6 space-y-5">
          {/* Back */}
          <Link
            href="/c"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Communities</span>
          </Link>

          {/* ═══ Community Header ═══ */}
          <header className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden">
            {/* Cover strip */}
            {community.cover_url ? (
              <div className="h-20 sm:h-24 w-full overflow-hidden">
                <img src={community.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ) : (
              <div className="h-14 sm:h-16 w-full bg-gradient-to-r from-[#ff4d00]/20 via-[#1a1a1a] to-[#0a0a0a]" />
            )}

            <div className="p-4 sm:p-5 space-y-4">
              {/* Avatar + name + actions */}
              <div className="flex items-start gap-4">
                {community.avatar_url ? (
                  <img
                    src={community.avatar_url}
                    alt={community.name}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shrink-0 -mt-8 ring-4 ring-[#111]"
                    loading="lazy"
                  />
                ) : (
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 -mt-8 ring-4 ring-[#111] ${communityColor}`}>
                    {getInitials(community.name)}
                  </div>
                )}

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-xl font-black text-white">{community.name}</h1>
                    {topics.length > 0 && (
                      <Link
                        href={`/c?q=${encodeURIComponent(topics[0].name)}`}
                        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-[#ff4d00]/10 border border-[#ff4d00]/30 text-[#ff4d00]"
                      >
                        {topics[0].name}
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-zinc-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="font-bold text-zinc-300">{formatCount(community.member_count || 0)}</span>
                      members
                    </span>
                    <span>·</span>
                    <span>Created {timeAgo(community.created_at)}</span>
                    {community.creator?.username && (
                      <>
                        <span>·</span>
                        <Link href={`/u/${community.creator.username}`} className="hover:text-[#ff4d00] transition-colors">
                          by @{community.creator.username}
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isMember && permissions?.canPost && (
                    <Link
                      href={`/create?community=${community.id}`}
                      className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold text-[11px] sm:text-xs rounded-xl transition-all shadow-[0_0_12px_rgba(255,77,0,0.3)]"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Post</span>
                      <span className="sm:hidden">Post</span>
                    </Link>
                  )}
                  <JoinButton
                    communityId={community.id}
                    visibility={visibility}
                    initialIsMember={isMember}
                    initialPending={isPending}
                    initialMemberCount={community.member_count || 0}
                    isOwner={isOwner}
                    onStateChange={handleJoinChange}
                  />
                </div>
              </div>

              {/* Description */}
              {community.description && (
                <p className="text-sm text-zinc-300 leading-relaxed">{community.description}</p>
              )}

              {/* Pending notice for requested users */}
              {isPending && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-xs text-amber-300">
                  <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Request sent — the owner will review it soon. You can withdraw it anytime.</span>
                </div>
              )}

              {/* Meta chips */}
              <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                    visibility === 'public'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : visibility === 'private'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400'
                  }`}
                  title={
                    visibility === 'public'
                      ? 'Anyone can discover and join'
                      : visibility === 'private'
                        ? 'Joining needs owner approval'
                        : 'Invite-only, hidden from discovery'
                  }
                >
                  {visibility === 'public' ? null : visibility === 'private'
                    ? <Lock className="w-3 h-3" aria-hidden="true" />
                    : <EyeOff className="w-3 h-3" aria-hidden="true" />}
                  {visibility === 'public' ? '🌐 Public' : visibility === 'private' ? 'Private' : 'Hidden'}
                </span>
                {(isOwner || isModerator) && (
                  <button
                    onClick={() => setShowRulesEditor(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-[#333] text-zinc-300 hover:border-[#ff4d00]/40 hover:text-white transition-all"
                  >
                    <BookOpen className="w-3 h-3" aria-hidden="true" />
                    Rules
                  </button>
                )}
                <button
                  onClick={() => setShowMembers(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-[#333] text-zinc-300 hover:border-[#ff4d00]/40 hover:text-white transition-all"
                >
                  <Users className="w-3 h-3" aria-hidden="true" />
                  Members
                </button>
                <button
                  onClick={toggleMute}
                  aria-pressed={muted}
                  title={muted ? 'Unmute this community' : 'Mute this community (hides it from discovery)'}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all ${
                    muted
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                      : 'bg-[#1a1a1a] border-[#333] text-zinc-300 hover:border-[#ff4d00]/40 hover:text-white'
                  }`}
                >
                  {muted ? <BellOff className="w-3 h-3" aria-hidden="true" /> : <Bell className="w-3 h-3" aria-hidden="true" />}
                  {muted ? 'Muted' : 'Mute'}
                </button>
                {!isOwner && (
                  <button
                    onClick={() => setShowReport(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-[#333] text-zinc-300 hover:border-red-500/50 hover:text-red-400 transition-all"
                  >
                    <Flag className="w-3 h-3" aria-hidden="true" />
                    Report
                  </button>
                )}
                {isModerator && !isOwner && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Shield className="w-3 h-3" aria-hidden="true" />
                    Moderator
                  </span>
                )}
                {isOwner && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#ff4d00]/10 border border-[#ff4d00]/30 text-[#ff4d00]">
                    <UserCog className="w-3 h-3" aria-hidden="true" />
                    Owner
                  </span>
                )}
              </div>
            </div>
          </header>

          {/* ═══ Tabs ═══ */}
          {!isPrivateOutsider && (
            <div className="flex items-center gap-1 bg-[#111] p-1 rounded-xl border border-[#222] overflow-x-auto" role="tablist" aria-label="Community sections">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => switchTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-mono font-bold whitespace-nowrap transition-all flex-1 justify-center min-h-[44px] ${
                    tab === key ? 'bg-[#ff4d00] text-black' : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1a]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ═══ Private preview gate ═══ */}
          {isPrivateOutsider ? (
            <div className="bg-[#111] border border-[#222] rounded-2xl p-8 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-400" aria-hidden="true" />
              </div>
              <h2 className="text-base font-black text-white uppercase tracking-wider">Private community</h2>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                {community.member_count || 0} members share posts here. Request to join and the owner will review it.
              </p>
              {rules.length > 0 && (
                <div className="text-left bg-[#0a0a0a] border border-[#222] rounded-xl p-4 max-w-sm mx-auto">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    House rules (read before requesting)
                  </p>
                  <ol className="space-y-1.5">
                    {rules.map((rule, i) => (
                      <li key={rule.id} className="flex gap-2 text-xs text-zinc-300 leading-relaxed">
                        <span className="text-[#ff4d00] font-black font-mono shrink-0">{i + 1}.</span>
                        <span>{rule.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <JoinButton
                communityId={community.id}
                visibility={visibility}
                initialIsMember={false}
                initialPending={isPending}
                initialMemberCount={community.member_count || 0}
                onStateChange={handleJoinChange}
                size="lg"
              />
            </div>
          ) : tab === 'about' ? (
            /* ═══ About ═══ */
            <div className="space-y-4">
              <div className="bg-[#111] border border-[#222] rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-black text-white uppercase tracking-wider">About</h2>
                {community.description ? (
                  <p className="text-sm text-zinc-300 leading-relaxed">{community.description}</p>
                ) : (
                  <p className="text-xs text-zinc-500 font-mono">No description yet.</p>
                )}
                <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-500 flex-wrap pt-1">
                  <span><span className="font-bold text-zinc-300">{formatCount(community.member_count || 0)}</span> members</span>
                  <span>Created {timeAgo(community.created_at)}</span>
                  {community.creator?.username && <span>Founded by @{community.creator.username}</span>}
                </div>
                {topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {topics.map(t => (
                      <Link
                        key={t.slug}
                        href={`/c?q=${encodeURIComponent(t.name)}`}
                        className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-zinc-300 hover:border-[#ff4d00]/40 hover:text-white transition-all"
                      >
                        {t.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#ff4d00]" aria-hidden="true" />
                    Rules
                  </h2>
                  {isModerator && (
                    <button
                      onClick={() => setShowRulesEditor(true)}
                      className="text-[10px] font-mono text-[#ff4d00] hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {rules.length === 0 ? (
                  <p className="text-xs text-zinc-500 font-mono">No rules yet.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {rules.map((rule, i) => (
                      <li key={rule.id} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                        <span className="text-[#ff4d00] font-black font-mono shrink-0">{i + 1}.</span>
                        <span>{rule.text}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ) : /* ═══ Feed / Top / Media ═══ */
          feedLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : items.length === 0 ? (
            /* Honest empty state — never fake starter posts */
            <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-10 text-center space-y-4">
              <div className="text-5xl">{tab === 'media' ? '🖼️' : '🕳️'}</div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider">
                {tab === 'media' ? 'NO PHOTOS YET' : tab === 'top' ? 'NOTHING RANKED YET' : 'THIS SPACE IS NEW'}
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                {tab === 'media'
                  ? 'Photo posts shared here will appear in this gallery.'
                  : isMember
                    ? 'No conversations yet. Start the first one.'
                    : 'This space is new. Join and start the conversation.'}
              </p>
              {isMember && permissions?.canPost ? (
                <Link
                  href={`/create?community=${community.id}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4d00] text-black font-black text-sm rounded-xl hover:bg-[#ff6622] transition-all uppercase tracking-wider"
                >
                  <Flame className="w-4 h-4 fill-black" aria-hidden="true" />
                  Start the conversation
                </Link>
              ) : (
                !isMember && !isPending && (
                  <JoinButton
                    communityId={community.id}
                    visibility={visibility}
                    initialIsMember={false}
                    initialPending={false}
                    initialMemberCount={community.member_count || 0}
                    onStateChange={handleJoinChange}
                    size="lg"
                  />
                )
              )}
            </div>
          ) : (
            <div className={tab === 'media' ? 'grid grid-cols-2 sm:grid-cols-3 gap-2' : 'space-y-4'}>
              {tab === 'media'
                ? items.filter(i => i.mediaUrl).map(item => (
                    <Link key={item.id} href={`/post/${item.id}`} className="group relative rounded-xl overflow-hidden border border-[#222] aspect-square bg-[#111]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.mediaUrl}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </Link>
                  ))
                : items.map(item => (
                    <FeedCard
                      key={item.id}
                      item={item}
                      onRemoveFromCommunity={isModerator ? handleRemoveFromCommunity : null}
                    />
                  ))}
            </div>
          )}

          {/* Load more (chronological tabs only — Top is a snapshot) */}
          {!isPrivateOutsider && tab !== 'about' && tab !== 'top' && hasMore && !feedLoading && (
            <div ref={loadMoreRef} className="py-8 flex justify-center">
              {feedLoadingMore && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-[#ff4d00]" aria-hidden="true" />
                  <span className="text-xs font-mono">Loading more...</span>
                </div>
              )}
            </div>
          )}

          {!isPrivateOutsider && tab !== 'about' && !hasMore && !feedLoading && items.length > 0 && (
            <div className="text-center py-8 border-t border-[#222]">
              <p className="text-xs text-zinc-500 font-mono">
                🔥 You&apos;ve reached the start of this community.
              </p>
            </div>
          )}
        </div>

        {/* ═══ Desktop Sidebar ═══ */}
        <aside className="hidden xl:block w-80 shrink-0 pl-8 pr-4 py-6 space-y-6">
          {/* Rules */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#ff4d00]" aria-hidden="true" />
                Community Rules
              </h3>
              {isModerator && (
                <button
                  onClick={() => setShowRulesEditor(true)}
                  className="text-[10px] font-mono text-[#ff4d00] hover:text-white transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {rules.length === 0 ? (
              <p className="text-xs text-zinc-500 font-mono">
                No rules yet. {isModerator ? 'Add some to set expectations.' : 'Check back soon.'}
              </p>
            ) : (
              <ol className="space-y-2.5">
                {rules.map((rule, i) => (
                  <li key={rule.id} className="flex gap-2.5 text-xs text-zinc-300 leading-relaxed">
                    <span className="text-[#ff4d00] font-black font-mono shrink-0">{i + 1}.</span>
                    <span>{rule.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Members preview */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#ff4d00]" aria-hidden="true" />
                Members
              </h3>
              <button
                onClick={() => setShowMembers(true)}
                className="text-[10px] font-mono text-[#ff4d00] hover:text-white transition-colors"
              >
                View all
              </button>
            </div>
            <p className="text-2xl font-black text-white">
              {formatCount(community.member_count || 0)}
              <span className="text-xs font-mono text-zinc-500 ml-2">members</span>
            </p>
          </div>
        </aside>
      </div>

      {/* ═══ Members Modal ═══ */}
      {showMembers && (
        <MembersModal
          community={community}
          viewer={viewer}
          onClose={() => {
            setShowMembers(false);
          }}
          onOpen={() => track('community_member_viewed', { communityId: community.id })}
        />
      )}

      {/* ═══ Rules Editor Modal ═══ */}
      {showRulesEditor && (
        <RulesEditor
          community={community}
          initialRules={rules}
          onClose={() => setShowRulesEditor(false)}
          onSaved={setRules}
        />
      )}

      {/* ═══ Report Community Modal ═══ */}
      {showReport && (
        <ReportModal
          targetType="community"
          targetId={community.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

/**
 * MembersModal — real paginated member directory with role info.
 * Owners review join requests and manage roles; moderators remove or
 * suspend members (community-scoped). Suspended members are listed
 * separately for moderators so bans can be lifted.
 */
function MembersModal({ community, viewer, onClose, onOpen }) {
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [suspended, setSuspended] = useState([]);
  const [showSuspended, setShowSuspended] = useState(false);
  const PAGE_SIZE = 24;

  const canManage = viewer?.isOwner;
  const canModerate = viewer?.isModerator;

  const loadMembers = useCallback(async (pageNum) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/communities/${community.id}/members?limit=${PAGE_SIZE}&offset=${pageNum * PAGE_SIZE}`
      );
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
        setTotal(data.total || 0);
        if (data.pending) {
          setPending(data.pending.requests || []);
          setPendingTotal(data.pending.total || 0);
        }
      }
    } catch {
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [community.id]);

  const loadSuspended = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${community.id}/members?status=suspended&limit=50`);
      const data = await res.json();
      if (res.ok) setSuspended(data.members || []);
    } catch {}
  }, [community.id]);

  useEffect(() => {
    loadMembers(0);
    if (canModerate) loadSuspended();
    onOpen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMembers]);

  const handleRoleChange = useCallback(async (member, newRole) => {
    setBusyId(member.id);
    setError('');
    try {
      const res = await fetch(`/api/communities/${community.id}/members/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: member.id, role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(prev => prev.map(m => (m.id === member.id ? { ...m, role: newRole } : m)));
      } else {
        setError(data.error || 'Failed to change role');
      }
    } catch {
      setError('Failed to change role');
    } finally {
      setBusyId(null);
    }
  }, [community.id]);

  const handleRemoveMember = useCallback(async (member) => {
    if (!window.confirm(`Remove @${member.username} from ${community.name}?`)) return;
    setBusyId(member.id);
    setError('');
    try {
      const res = await fetch(`/api/communities/${community.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', user_id: member.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== member.id));
        setTotal(t => Math.max(0, t - 1));
      } else {
        setError(data.error || 'Failed to remove member');
      }
    } catch {
      setError('Failed to remove member');
    } finally {
      setBusyId(null);
    }
  }, [community.id, community.name]);

  const handleReview = useCallback(async (request, approve) => {
    setBusyId(request.id);
    setError('');
    try {
      const res = await fetch(`/api/communities/${community.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: approve ? 'approve' : 'deny', user_id: request.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setPending(prev => prev.filter(r => r.id !== request.id));
        setPendingTotal(t => Math.max(0, t - 1));
        if (approve) loadMembers(0);
      } else {
        setError(data.error || 'Failed to review request');
      }
    } catch {
      setError('Failed to review request');
    } finally {
      setBusyId(null);
    }
  }, [community.id, loadMembers]);

  const handleSuspend = useCallback(async (member, suspend) => {
    if (suspend && !window.confirm(`Suspend @${member.username}? They lose access but can be unsuspended later.`)) return;
    setBusyId(member.id);
    setError('');
    try {
      const res = await fetch(`/api/communities/${community.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: suspend ? 'suspend' : 'unsuspend', user_id: member.id }),
      });
      const data = await res.json();
      if (res.ok) {
        if (suspend) {
          setMembers(prev => prev.filter(m => m.id !== member.id));
          setTotal(t => Math.max(0, t - 1));
        }
        loadSuspended();
      } else {
        setError(data.error || 'Failed to update suspension');
      }
    } catch {
      setError('Failed to update suspension');
    } finally {
      setBusyId(null);
    }
  }, [community.id, loadSuspended]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-[#111] border-t sm:border border-[#222] sm:rounded-2xl max-h-[85vh] overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-[#222]">
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Members <span className="text-zinc-500">({total})</span>
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-zinc-400 hover:text-white transition-colors" aria-label="Close members list">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono">
            {error}
          </div>
        )}

        <div className="overflow-y-auto max-h-[60vh] p-2">
          {/* Pending join requests (owners review for private communities) */}
          {canManage && pending.length > 0 && (
            <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2">
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 px-2 py-1">
                Requests ({pendingTotal})
              </p>
              {pending.map(req => (
                <div key={req.id} className="flex items-center gap-3 p-2 rounded-xl">
                  <Link href={`/u/${req.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar username={req.username} size="md" src={req.avatarUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">@{req.username}</p>
                      {req.displayName && (
                        <p className="text-[11px] text-zinc-400 truncate">{req.displayName}</p>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => handleReview(req, true)}
                    disabled={busyId === req.id}
                    aria-label={`Approve @${req.username}`}
                    title="Approve"
                    className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                  >
                    {busyId === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleReview(req, false)}
                    disabled={busyId === req.id}
                    aria-label={`Decline @${req.username}`}
                    title="Decline"
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {loading && page === 0 ? (
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
          ) : members.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <div className="text-3xl">👥</div>
              <p className="text-sm text-zinc-400">No members yet</p>
              <p className="text-xs text-zinc-500">Be the first to join</p>
            </div>
          ) : (
            <div className="space-y-1">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#1a1a1a] transition-all">
                  <Link href={`/u/${member.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar username={member.username} size="md" src={member.avatarUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        @{member.username}
                        {member.isViewer && <span className="text-zinc-500 font-mono text-[10px]"> (you)</span>}
                      </p>
                      {member.displayName && (
                        <p className="text-[11px] text-zinc-400 truncate">{member.displayName}</p>
                      )}
                    </div>
                  </Link>

                  {/* Role badge */}
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                    member.role === 'owner'
                      ? 'bg-[#ff4d00]/15 text-[#ff4d00] border-[#ff4d00]/30'
                      : member.role === 'moderator'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                  }`}>
                    {ROLE_LABELS[member.role] || member.role}
                  </span>

                  {/* Owner controls */}
                  {canManage && member.role !== 'owner' && (
                    <div className="flex items-center gap-1 shrink-0">
                      {member.role === 'moderator' ? (
                        <button
                          onClick={() => handleRoleChange(member, 'member')}
                          disabled={busyId === member.id}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#1a1a1a] transition-colors"
                          aria-label={`Demote @${member.username} to member`}
                          title="Demote to member"
                        >
                          {busyId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRoleChange(member, 'moderator')}
                          disabled={busyId === member.id}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-[#1a1a1a] transition-colors"
                          aria-label={`Promote @${member.username} to moderator`}
                          title="Promote to moderator"
                        >
                          {busyId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Moderator can suspend non-owners */}
                  {canModerate && member.role !== 'owner' && member.id !== viewer?.userId && (
                    <button
                      onClick={() => handleSuspend(member, true)}
                      disabled={busyId === member.id}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                      aria-label={`Suspend @${member.username}`}
                      title="Suspend (temporary ban — reversible)"
                    >
                      {busyId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  {/* Moderator can remove non-owners */}
                  {canModerate && member.role !== 'owner' && member.id !== viewer?.userId && (
                    <button
                      onClick={() => handleRemoveMember(member)}
                      disabled={busyId === member.id}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      aria-label={`Remove @${member.username} from community`}
                      title="Remove from community"
                    >
                      {busyId === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suspended review (moderators+ only) */}
        {canModerate && (
          <div className="border-t border-[#222]">
            <button
              onClick={() => setShowSuspended(v => !v)}
              aria-expanded={showSuspended}
              className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 hover:text-white transition-colors"
            >
              <span>Suspended ({suspended.length})</span>
              <span>{showSuspended ? '−' : '+'}</span>
            </button>
            {showSuspended && (
              <div className="px-2 pb-2">
                {suspended.length === 0 ? (
                  <p className="text-[11px] font-mono text-zinc-600 px-2 py-2">No suspended members.</p>
                ) : (
                  suspended.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#1a1a1a]">
                      <Link href={`/u/${s.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar username={s.username} size="md" src={s.avatarUrl} />
                        <p className="text-sm font-bold text-zinc-300 truncate">@{s.username}</p>
                      </Link>
                      <button
                        onClick={() => handleSuspend(s, false)}
                        disabled={busyId === s.id}
                        className="px-3 py-1.5 text-[10px] font-mono font-bold rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-40"
                      >
                        {busyId === s.id ? '…' : 'Unsuspend'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-[#222]">
            <button
              onClick={() => { setPage(p => Math.max(0, p - 1)); loadMembers(Math.max(0, page - 1)); }}
              disabled={page === 0 || loading}
              className="px-3 py-1.5 text-[10px] font-mono font-bold rounded-lg bg-[#1a1a1a] border border-[#333] text-zinc-300 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-[10px] font-mono text-zinc-500">Page {page + 1} / {totalPages}</span>
            <button
              onClick={() => { setPage(p => p + 1); loadMembers(page + 1); }}
              disabled={page + 1 >= totalPages || loading}
              className="px-3 py-1.5 text-[10px] font-mono font-bold rounded-lg bg-[#1a1a1a] border border-[#333] text-zinc-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * RulesEditor — real, stored community rules managed by authorized roles.
 */
function RulesEditor({ community, initialRules, onClose, onSaved }) {
  const [rules, setRules] = useState(initialRules.map(r => r.text));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`/api/communities/${community.id}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      const data = await res.json();
      if (res.ok) {
        onSaved(data.rules || []);
        setSaved(true);
        setTimeout(onClose, 800);
      } else {
        setError(data.error || 'Failed to save rules');
      }
    } catch {
      setError('Failed to save rules');
    } finally {
      setSaving(false);
    }
  }, [community.id, rules, onSaved, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-[#111] border-t sm:border border-[#222] sm:rounded-2xl max-h-[85vh] overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-[#222]">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#ff4d00]" aria-hidden="true" />
            Community Rules
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-zinc-400 hover:text-white transition-colors" aria-label="Close rules editor">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
          <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
            What belongs here, what doesn&apos;t, and how members should treat each other.
            These are real expectations — platform moderation stays separate and authoritative.
          </p>

          {error && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono">
              {error}
            </div>
          )}

          {rules.map((rule, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-black text-[#ff4d00] font-mono mt-2.5 shrink-0">{i + 1}.</span>
              <textarea
                value={rule}
                onChange={e => {
                  const next = [...rules];
                  next[i] = e.target.value;
                  setRules(next);
                }}
                rows={2}
                maxLength={300}
                placeholder="e.g. No self-promotion or spam"
                className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] resize-none transition-colors"
              />
              <button
                onClick={() => setRules(rules.filter((_, j) => j !== i))}
                className="p-2 mt-1 text-zinc-500 hover:text-red-400 transition-colors"
                aria-label={`Delete rule ${i + 1}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {rules.length < 12 && (
            <button
              onClick={() => setRules([...rules, ''])}
              className="flex items-center gap-1.5 text-xs font-mono text-[#ff4d00] hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add rule
            </button>
          )}
        </div>

        <div className="p-4 border-t border-[#222]">
          {saved ? (
            <div className="flex items-center justify-center gap-2 py-2.5 text-xs font-mono text-emerald-400">
              <Check className="w-4 h-4" aria-hidden="true" />
              Rules saved
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || rules.some(r => r.trim().length > 0 && r.trim().length < 3)}
              className="w-full py-3 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
              Save Rules
            </button>
          )}
        </div>
      </div>
    </div>
  );
}