'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { Reply, MoreHorizontal, Trash2, Flag } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { ReactionSummary, getParticipantId } from '@/components/feed/ReactionBar';
import { track } from '@/lib/analytics';

/**
 * CommentItem — Individual comment display with reactions and reply button.
 */

function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  if (diff < 60) return 'just now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function CommentItem({
  comment,
  onReply,
  onDelete,
  isReply = false,
  className = '',
  currentUserId = null,
}) {
  const canDelete = Boolean(comment.user_id && currentUserId && comment.user_id === currentUserId);
  const [deleteError, setDeleteError] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [reactionCounts, setReactionCounts] = useState(comment.reactionCounts || {});
  const [participantReaction, setParticipantReaction] = useState(null);

  const author = comment.author;
  const authorName = author?.username || author?.display_name || 'Anonymous';

  const handleReaction = useCallback(async (type) => {
    try {
      const res = await fetch('/api/comments/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_id: comment.id,
          reaction_type: type,
          participant_id: getParticipantId(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setReactionCounts(data.counts);
        setParticipantReaction(data.action === 'removed' ? null : data.reaction_type);
      }
    } catch {}
  }, [comment.id]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this comment?')) return;

    setDeleteError('');
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: getParticipantId() }),
      });

      if (res.ok) {
        onDelete?.(comment.id);
        track('comment_deleted', { commentId: comment.id });
      } else {
        setDeleteError('Could not delete. Please try again.');
      }
    } catch {
      setDeleteError('Could not delete. Please try again.');
    }
    setShowMenu(false);
  }, [comment.id, onDelete]);

  return (
    <div className={`group ${className}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Link href={author?.username ? `/u/${author.username}` : '#'}>
          <Avatar
            username={authorName}
            size={isReply ? 'xs' : 'sm'}
            color={null}
          />
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={author?.username ? `/u/${author.username}` : '#'}
              className="text-xs font-bold text-white hover:text-[#ff4d00] transition-colors"
            >
              @{authorName}
            </Link>
            <span className="text-[10px] font-mono text-zinc-600">
              {timeAgo(comment.created_at)}
            </span>
            {comment.updated_at !== comment.created_at && (
              <span className="text-[10px] font-mono text-zinc-600">(edited)</span>
            )}
          </div>

          {/* Text */}
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {comment.text}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-2">
            {/* Reactions */}
            <ReactionSummary
              itemId={comment.id}
              targetType="comment"
              reactions={reactionCounts}
              participantReaction={participantReaction}
              onReact={handleReaction}
              compact
            />

            {/* Reply button */}
            {!isReply && onReply && (
              <button
                onClick={() => onReply(comment)}
                className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors"
              >
                <Reply className="w-3 h-3" />
                Reply
              </button>
            )}

            {/* Reply count */}
            {!isReply && comment.replyCount > 0 && (
              <span className="text-[10px] font-mono text-zinc-600">
                {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </div>
        </div>

        {/* Menu — owners only (verified server-side too) */}
        {canDelete && (
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#1a1a1a] transition-all text-zinc-500 hover:text-white"
            aria-label="More options"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-10 overflow-hidden">
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </div>
          )}
          {deleteError && (
            <p role="alert" className="text-[10px] font-mono text-red-400 mt-1">{deleteError}</p>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
