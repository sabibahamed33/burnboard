'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Loader2, ChevronDown } from 'lucide-react';
import CommentItem from './CommentItem';
import CommentComposer from './CommentComposer';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * CommentThread — Full comment section for content detail pages.
 * 
 * Features:
 *   - Load comments with pagination
 *   - Sort by top or newest
 *   - Reply to comments (one level deep)
 *   - Delete own comments
 *   - Comment reactions
 *   - Empty state
 *   - Loading state
 *   - Error state
 */

export default function CommentThread({
  targetType,
  targetId,
  className = '',
}) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [sort, setSort] = useState('top');
  const [replyingTo, setReplyingTo] = useState(null);
  const [showReplies, setShowReplies] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);

  // Viewer identity for owner-only actions (delete menu).
  // Server re-verifies ownership — this only controls UI visibility.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id || null);
    }).catch(() => {});
  }, []);

  // Fetch comments
  const fetchComments = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setLoading(true);
        setComments([]);
      } else if (nextCursor) {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({
        target_type: targetType,
        target_id: targetId,
        sort,
        limit: '20',
      });

      if (nextCursor && !isRefresh) {
        params.set('cursor', nextCursor);
      }

      const res = await fetch(`/api/comments?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to load comments');

      if (isRefresh || !nextCursor) {
        setComments(data.comments || []);
      } else {
        setComments(prev => [...prev, ...(data.comments || [])]);
      }

      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      setError(null);
    } catch (err) {
      console.error('[Comments] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [targetType, targetId, sort, nextCursor]);

  // Initial load and sort change
  useEffect(() => {
    fetchComments(true);
  }, [targetType, targetId, sort]);

  // Handle new comment
  const handleNewComment = useCallback((comment) => {
    setComments(prev => [comment, ...prev]);
  }, []);

  // Handle delete
  const handleDelete = useCallback((commentId) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  // Handle reply
  const handleReply = useCallback((comment) => {
    setReplyingTo(comment);
  }, []);

  // Handle reply posted
  const handleReplyPosted = useCallback((reply) => {
    // Add reply to parent's local state
    setComments(prev => prev.map(c => {
      if (c.id === replyingTo?.id) {
        return { ...c, replyCount: (c.replyCount || 0) + 1 };
      }
      return c;
    }));
    setReplyingTo(null);
    // Refresh to get the reply
    fetchComments(true);
  }, [replyingTo, fetchComments]);

  // Toggle reply loading
  const toggleReplies = useCallback(async (commentId) => {
    if (showReplies[commentId]) {
      setShowReplies(prev => ({ ...prev, [commentId]: null }));
    } else {
      // Fetch replies
      try {
        const res = await fetch(`/api/comments/${commentId}/replies?limit=10`);
        const data = await res.json();
        if (res.ok) {
          setShowReplies(prev => ({ ...prev, [commentId]: data.replies || [] }));
        }
      } catch {}
    }
  }, [showReplies]);

  const totalComments = comments.length;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#ff4d00]" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Comments
          </h3>
          {totalComments > 0 && (
            <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
              {totalComments}
            </span>
          )}
        </div>

        {/* Sort tabs */}
        {totalComments > 1 && (
          <div className="flex items-center gap-1 bg-[#111] p-0.5 rounded-lg border border-[#262626]">
            <button
              onClick={() => setSort('top')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                sort === 'top' ? 'bg-[#1a1a1a] text-white' : 'text-zinc-500 hover:text-white'
              }`}
            >
              Top
            </button>
            <button
              onClick={() => setSort('newest')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                sort === 'newest' ? 'bg-[#1a1a1a] text-white' : 'text-zinc-500 hover:text-white'
              }`}
            >
              Newest
            </button>
          </div>
        )}
      </div>

      {/* Comment Composer */}
      <CommentComposer
        targetType={targetType}
        targetId={targetId}
        onComment={handleNewComment}
        placeholder="Join the conversation..."
      />

      {/* Loading State */}
      {loading && (
        <ListSkeleton count={3} />
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-xs text-red-400 font-mono">{error}</p>
          <button
            onClick={() => fetchComments(true)}
            className="text-[11px] font-mono text-[#ff4d00] hover:text-white mt-2 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && comments.length === 0 && (
        <div className="bg-[#111] border border-dashed border-[#333] rounded-xl p-6 text-center space-y-2">
          <div className="text-2xl">🔥</div>
          <p className="text-sm font-bold text-zinc-400">
            First one into the fire?
          </p>
          <p className="text-[11px] text-zinc-500">
            Be the first to comment on this post.
          </p>
        </div>
      )}

      {/* Comments List */}
      {!loading && comments.length > 0 && (
        <div className="space-y-1">
          {comments.map(comment => (
            <div key={comment.id} className="space-y-2">
              {/* Main comment */}
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 hover:border-[#262626] transition-colors">
                <CommentItem
                  comment={comment}
                  onReply={handleReply}
                  onDelete={handleDelete}
                  currentUserId={currentUserId}
                />

                {/* Reply button for showing replies */}
                {comment.replyCount > 0 && !showReplies[comment.id] && (
                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="ml-10 mt-2 flex items-center gap-1 text-[11px] font-mono text-[#ff4d00] hover:text-white transition-colors"
                  >
                    <ChevronDown className="w-3 h-3" />
                    View {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
                  </button>
                )}

                {/* Replies */}
                {showReplies[comment.id] && (
                  <div className="ml-8 mt-3 space-y-2 border-l-2 border-[#222] pl-3">
                    {showReplies[comment.id].map(reply => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        isReply
                        onDelete={handleDelete}
                        currentUserId={currentUserId}
                      />
                    ))}
                    <button
                      onClick={() => toggleReplies(comment.id)}
                      className="text-[10px] font-mono text-zinc-500 hover:text-white transition-colors"
                    >
                      Hide replies
                    </button>
                  </div>
                )}

                {/* Reply composer */}
                {replyingTo?.id === comment.id && (
                  <div className="ml-10 mt-3">
                    <CommentComposer
                      targetType={targetType}
                      targetId={targetId}
                      parentId={comment.id}
                      parentAuthor={comment.author?.username}
                      onComment={handleReplyPosted}
                      onCancel={() => setReplyingTo(null)}
                      autoFocus
                      placeholder={`Reply to @${comment.author?.username || 'Anonymous'}...`}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && (
        <button
          onClick={() => fetchComments(false)}
          disabled={loadingMore}
          className="w-full py-3 text-xs font-mono text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          {loadingMore ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#ff4d00]" />
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Load more comments
            </>
          )}
        </button>
      )}

      {/* End of comments */}
      {!hasMore && !loading && comments.length > 0 && (
        <div className="text-center py-2">
          <p className="text-[10px] text-zinc-600 font-mono">
            {totalComments} {totalComments === 1 ? 'comment' : 'comments'}
          </p>
        </div>
      )}
    </div>
  );
}
