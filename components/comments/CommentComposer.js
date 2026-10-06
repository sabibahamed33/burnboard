'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { getParticipantId } from '@/components/feed/ReactionBar';

/**
 * CommentComposer — Input for creating new comments or replies.
 * 
 * Props:
 *   - targetType: 'roast' | 'social_post'
 *   - targetId: string
 *   - parentId: string (optional, for replies)
 *   - parentAuthor: string (optional, @username to reply to)
 *   - onComment: callback when comment is posted
 *   - onCancel: callback when reply is cancelled
 *   - autoFocus: boolean
 *   - placeholder: string
 */
export default function CommentComposer({
  targetType,
  targetId,
  parentId = null,
  parentAuthor = null,
  onComment,
  onCancel,
  autoFocus = false,
  placeholder = 'Write a comment...',
}) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  // Auto-focus
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [text]);

  const handleSubmit = useCallback(async () => {
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          text: text.trim(),
          parent_id: parentId,
          participant_id: getParticipantId(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to post comment');
        return;
      }

      setText('');
      setError('');
      onComment?.(data.comment);
      onCancel?.();
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [text, isSubmitting, targetType, targetId, parentId, onComment, onCancel]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  }, [handleSubmit, onCancel]);

  return (
    <div className="space-y-2">
      {/* Reply indicator */}
      {parentAuthor && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
          <span>Replying to</span>
          <span className="text-[#ff4d00] font-bold">@{parentAuthor}</span>
          {onCancel && (
            <button onClick={onCancel} className="text-zinc-600 hover:text-white transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-start gap-3">
        <Avatar username="you" size="sm" className="mt-1" />
        <div className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden focus-within:border-[#ff4d00]/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            maxLength={500}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-600">
                {500 - text.length}
              </span>
              {error && (
                <span className="text-[10px] font-mono text-red-400">{error}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="text-[11px] font-mono text-zinc-500 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || isSubmitting}
                aria-busy={isSubmitting}
                className="btn-burn tactile flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="spinner w-3 h-3" aria-hidden />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                {isSubmitting ? 'Posting' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
