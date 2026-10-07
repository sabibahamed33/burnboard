'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ArrowBigUp, MessageSquare, MoreHorizontal, BarChart3, MinusCircle, EyeOff, Ban, Sparkles, Gift } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { ReactionSummary, getParticipantId } from './ReactionBar';
import PollCard from './PollCard';
import SafetyActions from '@/components/safety/SafetyActions';
import ShareButton from '@/components/growth/ShareButton';
import TipModal from '@/components/monetization/TipModal';

/**
 * FeedCard — Universal content card for BurnBoard's social feed.
 * 
 * Renders different content types with the unified 7-type reaction system.
 */

function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function getPlatformBadge(platform) {
  switch (platform?.toLowerCase()) {
    case 'x': case 'x / twitter': return { variant: 'info', label: 'X' };
    case 'linkedin': return { variant: 'sky', label: 'LinkedIn' };
    case 'github': return { variant: 'emerald', label: 'GitHub' };
    case 'instagram': return { variant: 'pink', label: 'Instagram' };
    default: return { variant: 'burn', label: platform || 'Roast' };
  }
}

const CONTENT_TYPE_CONFIG = {
  roast: { icon: '🔥', label: 'ROAST', color: 'text-[#ff4d00]' },
  opinion: { icon: '💬', label: 'OPINION', color: 'text-blue-400' },
  question: { icon: '❓', label: 'QUESTION', color: 'text-purple-400' },
  poll: { icon: '🗳', label: 'POLL', color: 'text-amber-400' },
  photo: { icon: '📸', label: 'PHOTO', color: 'text-pink-400' },
  hot_take: { icon: '🌶', label: 'HOT TAKE', color: 'text-red-400' },
};

// Shared in-memory cache so scrolling, pagination and rerenders never
// refetch reaction state for an item we already resolved (60s TTL).
// Fail-soft: a cache miss or failed fetch only keeps the server-rendered
// counters the feed API already provided.
const reactionCache = new Map();
const REACTION_CACHE_TTL_MS = 60 * 1000;

function getCachedReactions(key) {
  const entry = reactionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > REACTION_CACHE_TTL_MS) {
    reactionCache.delete(key);
    return null;
  }
  return entry;
}

function getDetailHref(item) {
  if (item.type === 'roast') return `/r/${item.id}`;
  return `/post/${item.id}`;
}

export default function FeedCard({
  item,
  onReaction,
  onUpvote,
  onShare,
  onReport,
  onRemoveFromCommunity,
  onNotInterested,
  onHide,
  className = '',
}) {
  const [upvoted, setUpvoted] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(item.upvotes || 0);
  const [showMenu, setShowMenu] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [reactions, setReactions] = useState(item.reactions || {});
  const [participantReaction, setParticipantReaction] = useState(null);

  const typeConfig = CONTENT_TYPE_CONFIG[item.type] || CONTENT_TYPE_CONFIG.roast;
  const platformBadge = item.author?.platform ? getPlatformBadge(item.author.platform) : null;

  // Fetch reaction state for this item (cached, abortable, never after unmount)
  useEffect(() => {
    const targetType = item.type === 'roast' ? 'roast' : 'social_post';
    const cacheKey = `${targetType}:${item.id}`;
    const cached = getCachedReactions(cacheKey);
    if (cached) {
      if (cached.counts) setReactions(cached.counts);
      if (cached.participantReaction !== undefined) setParticipantReaction(cached.participantReaction);
      return undefined;
    }
    const controller = new AbortController();
    let mounted = true;
    const fetchReactions = async () => {
      try {
        const participantId = getParticipantId();
        const res = await fetch(`/api/reactions?target_type=${targetType}&target_id=${item.id}&participant_id=${encodeURIComponent(participantId)}`, { signal: controller.signal });
        const data = await res.json();
        if (!mounted) return;
        if (data.counts) setReactions(data.counts);
        if (data.participantReaction) setParticipantReaction(data.participantReaction);
        reactionCache.set(cacheKey, {
          counts: data.counts || null,
          participantReaction: data.participantReaction ?? null,
          ts: Date.now(),
        });
      } catch (err) {
        if (err?.name !== 'AbortError') {
          // Non-fatal: keep the counters the feed API already provided.
        }
      }
    };
    fetchReactions();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [item.id, item.type]);

  const handleUpvote = useCallback(async () => {
    if (upvoted) return;
    setUpvoted(true);
    setUpvoteCount(prev => prev + 1);
    onUpvote?.(item);
  }, [upvoted, item, onUpvote]);

  const detailHref = getDetailHref(item);
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${detailHref}`
    : detailHref;

  return (
    <article
      className={`bg-[#111] border border-[#222] hover:border-[#2d2d2d] rounded-2xl transition-all duration-200 ${className}`}
      aria-label={`${typeConfig.label} by ${item.author?.username || 'Anonymous'}`}
    >
      {/* Header: Author + Timestamp */}
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={item.author?.username ? `/u/${item.author.username}` : '#'}>
            <Avatar
              username={item.author?.username || item.author?.displayName || '?'}
              size="md"
              color={item.author?.avatarColor}
            />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={item.author?.username ? `/u/${item.author.username}` : '#'}
                className="text-sm font-bold text-white hover:text-[#ff4d00] transition-colors truncate"
              >
                @{item.author?.username || item.author?.displayName || 'Anonymous'}
              </Link>
              {platformBadge && (
                <Badge variant={platformBadge.variant} size="xs">
                  {platformBadge.label}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mt-0.5">
              <span className={`${typeConfig.color} font-bold`}>{typeConfig.icon} {typeConfig.label}</span>
              <span>·</span>
              <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
            </div>
          </div>
        </div>

        {/* More menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors text-zinc-500 hover:text-white"
            aria-label="More options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-10 overflow-hidden">
              {/* Personalized feed controls — real, affect future ranking */}
              {onNotInterested && (
                <button
                  onClick={() => {
                    onNotInterested(item);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-[#ff4d00]/10 hover:text-[#ff4d00] transition-colors"
                >
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                  Not interested
                </button>
              )}
              {onHide && (
                <button
                  onClick={() => {
                    onHide(item);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-[#1f1f1f] hover:text-white transition-colors"
                >
                  <Ban className="w-3.5 h-3.5 shrink-0" />
                  Hide this post
                </button>
              )}
              {(onNotInterested || onHide) && (
                <div className="my-1 border-t border-[#262626]" />
              )}
              {/* Voluntary creator support — real tips, verified server-side */}
              {item.userId && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowTip(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-300 hover:bg-[#ff4d00]/10 hover:text-[#ff4d00] transition-colors"
                >
                  <Gift className="w-3.5 h-3.5 shrink-0" />
                  Support this creator
                </button>
              )}
              {onRemoveFromCommunity && (
                <button
                  onClick={() => {
                    onRemoveFromCommunity(item);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-amber-400 hover:bg-amber-500/10 transition-colors"
                >
                  <MinusCircle className="w-3.5 h-3.5 shrink-0" />
                  Remove from community
                </button>
              )}
              <SafetyActions
                item={item}
                onReport={onReport}
                onMenuClose={() => setShowMenu(false)}
              />
            </div>
          )}
        </div>
      </div>

      <TipModal
        open={showTip}
        onClose={() => setShowTip(false)}
        creatorId={item.userId}
        creatorName={item.author?.username || item.author?.displayName}
      />

      {/* Product-level explanation for personalized feeds (truthful, no scores) */}
      {item.explanation?.text && (
        <div className="px-4 pt-2">
          <p className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
            <Sparkles className="w-3 h-3 text-zinc-700" aria-hidden="true" />
            {item.explanation.text}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-3">
        <Link href={detailHref}>
          {item.type === 'roast' ? (
            <p className="text-sm text-zinc-100 leading-relaxed select-text hover:text-white transition-colors">
              &ldquo;{item.text}&rdquo;
            </p>
          ) : item.type === 'hot_take' ? (
            <p className="text-base font-bold text-white leading-relaxed select-text hover:text-[#ff4d00] transition-colors">
              {item.text}
            </p>
          ) : (
            <p className="text-sm text-zinc-100 leading-relaxed select-text hover:text-white transition-colors">
              {item.text}
            </p>
          )}
        </Link>

        {/* Context */}
        {item.context && (
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{item.context}</p>
        )}

        {/* Photo */}
        {item.mediaUrl && (
          <div className="mt-3 rounded-xl overflow-hidden">
            <img src={item.mediaUrl} alt="Post image" className="w-full max-h-96 object-cover" loading="lazy" />
          </div>
        )}

        {/* Poll */}
        {item.type === 'poll' && item.poll && (
          <div className="mt-3">
            <PollCard poll={item.poll} />
          </div>
        )}
      </div>

      {/* Interaction Bar */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between pt-3 border-t border-[#1a1a1a]">
          {/* Upvote */}
          <button
            onClick={handleUpvote}
            disabled={upvoted}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-black transition-all duration-150 active:scale-90 ${
              upvoted
                ? 'bg-[#ff4d00] text-black border-[#ff4d00] shadow-[0_0_12px_rgba(255,77,0,0.4)]'
                : 'bg-[#0a0a0a] text-zinc-400 border-[#262626] hover:text-white hover:border-[#3a3a3a]'
            }`}
            aria-label={`Upvote (${upvoteCount})`}
          >
            <ArrowBigUp className={`w-4 h-4 ${upvoted ? 'fill-black text-black' : ''}`} />
            <span>{formatCount(upvoteCount)}</span>
          </button>

          {/* Reactions (7 types, compact) */}
          {item.type !== 'poll' && (
            <ReactionSummary
              itemId={item.id}
              targetType={item.type === 'roast' ? 'roast' : 'social_post'}
              reactions={reactions}
              participantReaction={participantReaction}
              compact
            />
          )}

          {/* Poll vote count */}
          {item.type === 'poll' && item.poll && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{item.poll.total_votes || 0} votes</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Link
              href={detailHref}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono text-zinc-400 hover:text-white hover:bg-[#1a1a1a] transition-all"
              aria-label="View details"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Link>
            <ShareButton
              resourceType={item.type === 'roast' ? 'roast' : 'social_post'}
              resourceId={item.id}
              url={shareUrl}
              title="🔥 BurnBoard"
              text={`"${item.text}" — via BurnBoard`}
              variant="ghost"
              label="Share"
              className="px-2.5 py-1.5 text-xs"
              onShared={() => onShare?.(item)}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
