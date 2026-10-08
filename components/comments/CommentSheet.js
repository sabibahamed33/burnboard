'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import CommentThread from './CommentThread';

/**
 * CommentSheet — conversation as a bottom sheet on mobile and a
 * centered dialog on desktop (via BottomSheet's responsive behavior).
 *
 * Lets users join the conversation without leaving the feed. The full
 * detail page stays one tap away for deep threads.
 */
export default function CommentSheet({ open, onClose, targetType, targetId, detailHref }) {
  const title = 'Conversation';

  return (
    <BottomSheet open={open} onClose={onClose} title={title} className="sm:max-w-lg">
      <div className="min-h-[240px]">
        {open && targetId && (
          <CommentThread targetType={targetType} targetId={targetId} />
        )}
      </div>
      {detailHref && (
        <Link
          href={detailHref}
          onClick={onClose}
          className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-[11px] font-mono font-bold text-[#ff4d00] hover:text-white hover:bg-[#1a1a1a] transition-all min-h-[44px]"
        >
          View full conversation
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </BottomSheet>
  );
}
