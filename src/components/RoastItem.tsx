import React, { useState } from 'react';
import { Flame, Share2, Flag, ArrowBigUp, Download, Copy, Check, Sparkles } from 'lucide-react';
import { Roast } from '../types';
import { timeAgo } from '../lib/badWords';
import { calculateKarmaLevel } from '../lib/karma';
import { useAuth } from '../lib/auth';
import confetti from 'canvas-confetti';
import { downloadOgImage } from '../lib/ogGenerator';

interface RoastItemProps {
  roast: Roast;
  targetUsername: string;
  targetPlatform: string;
  onUpvote: (roastId: string) => void;
  onReact: (roastId: string, type: 'haha' | 'brutal' | 'cry') => void;
  onShare: (roast: Roast) => void;
  onReport: (roastId: string) => void;
  onShowToast?: (text: string, subtext?: string) => void;
}

export const RoastItem: React.FC<RoastItemProps> = ({
  roast,
  targetUsername,
  targetPlatform,
  onUpvote,
  onReact,
  onShare,
  onReport,
  onShowToast
}) => {
  const [upvoting, setUpvoting] = useState(false);
  const [reported, setReported] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastReacted, setLastReacted] = useState<string | null>(null);

  const handleUpvote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUpvoting(true);
    setTimeout(() => setUpvoting(false), 300);

    // Trigger fire confetti
    confetti({
      particleCount: 24,
      spread: 50,
      origin: { y: 0.8 },
      colors: ['#ff4d00', '#ff8533', '#ffffff']
    });

    onUpvote(roast.id);
  };

  const handleReactionClick = (type: 'haha' | 'brutal' | 'cry') => {
    setLastReacted(type);
    setTimeout(() => setLastReacted(null), 500);
    onReact(roast.id, type);
  };

  const handleDownloadImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExporting(true);
    try {
      await downloadOgImage({
        template: 'roast',
        username: targetUsername,
        text: roast.roast_text,
        platform: targetPlatform,
        anonId: roast.anon_id || 'Anonymous Burner'
      }, `burnboard-${targetUsername}-${roast.id}.png`);

      if (onShowToast) {
        onShowToast('1080x1080 Roast Card Downloaded! 🔥', 'High-res image ready for X, Instagram, or Discord');
      }
    } catch (err) {
      console.error(err);
      if (onShowToast) {
        onShowToast('Download failed', 'Please try again');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyText = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`"${roast.roast_text}" — on @${targetUsername} via Burnboard`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onShowToast) {
      onShowToast('Roast Copied to Clipboard!', `Target: @${targetUsername}`);
    }
  };

  const handleReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReported(true);
    onReport(roast.id);
    if (onShowToast) {
      onShowToast('Burn Reported', 'Thank you for keeping Burnboard clean and fun.');
    }
  };

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <div
      id={`roast-item-${roast.id}`}
      className="glass glass-interactive bb-card group relative p-4"
    >
      {/* Top Header: Anon ID & Timestamp */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#ff4d00] font-black font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d00]" />
            {roast.anon_id || 'Anonymous Roast'}
            {(() => {
              const karma = calculateKarmaLevel(roast.upvotes || 0);
              if (karma.level !== 'Newbie') {
                return (
                  <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-md ml-1">
                    {karma.badge}
                  </span>
                );
              }
              return null;
            })()}
          </span>
          {roast.user_id && (
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md ml-1">
              ✓ Verified Human
            </span>
          )}
          <span className="text-[10px] text-zinc-600 font-mono">•</span>
          <span className="text-[11px] text-zinc-500 font-mono">
            {timeAgo(roast.created_at)}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
          {/* Direct Copy Button */}
          <button
            id={`btn-copy-${roast.id}`}
            onClick={handleCopyText}
            title="Copy roast text"
            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-[#1a1a1a] transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Share / Download 1080x1080 Image */}
          <button
            id={`btn-share-img-${roast.id}`}
            onClick={handleDownloadImage}
            disabled={isExporting}
            title="Download 1080x1080 Viral Card"
            className="flex items-center gap-1 px-2 py-1 bg-[#141414] hover:bg-[#1f1f1f] text-zinc-400 hover:text-white rounded-lg border border-[#262626] text-[11px] font-mono transition-colors"
          >
            <Download className="w-3 h-3 text-[#ff4d00]" />
            <span className="hidden sm:inline">{isExporting ? 'Saving...' : 'Card'}</span>
          </button>

          {/* Report Button */}
          <button
            id={`btn-report-${roast.id}`}
            onClick={handleReport}
            title={reported ? 'Reported to mods' : 'Report inappropriate content'}
            disabled={reported}
            className={`p-1.5 rounded-lg transition-colors ${
              reported ? 'text-red-400' : 'text-zinc-600 hover:text-zinc-400 hover:bg-[#1a1a1a]'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Roast Content */}
      <p className="text-sm text-zinc-100 leading-relaxed font-normal select-text mb-3">
        "{roast.roast_text}"
      </p>

      {/* Actions & Reactions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#1a1a1a]">
        {/* Reddit-style Upvote Button with Haptic Feel */}
        <button
          id={`btn-upvote-${roast.id}`}
          onClick={handleUpvote}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-black transition-all duration-150 active:scale-90 ${
            roast.userUpvoted
              ? 'bg-[#ff4d00] text-black border-[#ff4d00] shadow-[0_0_12px_rgba(255,77,0,0.4)]'
              : 'bg-[#141414] text-zinc-400 border-[#262626] hover:text-white hover:border-[#3a3a3a]'
          } ${upvoting ? 'scale-110 -translate-y-0.5' : ''}`}
        >
          <ArrowBigUp className={`w-4 h-4 ${roast.userUpvoted ? 'fill-black text-black' : 'text-zinc-400'}`} />
          <span>{formatCount(roast.upvotes)}</span>
        </button>

        {/* Reaction Buttons: 😂 💀 😭 with animated pop */}
        <div className="flex items-center gap-1.5">
          {/* Haha */}
          <button
            id={`react-haha-${roast.id}`}
            onClick={(e) => {
              e.stopPropagation();
              handleReactionClick('haha');
            }}
            title="React: Haha 😂"
            className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${
              lastReacted === 'haha' ? 'scale-125 border-yellow-500/50 bg-yellow-500/10' : ''
            }`}
          >
            <span className="text-sm">😂</span>
            {roast.reaction_haha > 0 && (
              <span className="text-[11px] font-mono text-zinc-300 font-bold">
                {formatCount(roast.reaction_haha)}
              </span>
            )}
          </button>

          {/* Brutal */}
          <button
            id={`react-brutal-${roast.id}`}
            onClick={(e) => {
              e.stopPropagation();
              handleReactionClick('brutal');
            }}
            title="React: Brutal 💀"
            className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${
              lastReacted === 'brutal' ? 'scale-125 border-[#ff4d00]/50 bg-[#ff4d00]/10' : ''
            }`}
          >
            <span className="text-sm">💀</span>
            {roast.reaction_brutal > 0 && (
              <span className="text-[11px] font-mono text-zinc-300 font-bold">
                {formatCount(roast.reaction_brutal)}
              </span>
            )}
          </button>

          {/* Cry */}
          <button
            id={`react-cry-${roast.id}`}
            onClick={(e) => {
              e.stopPropagation();
              handleReactionClick('cry');
            }}
            title="React: Emotional Damage 😭"
            className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${
              lastReacted === 'cry' ? 'scale-125 border-blue-500/50 bg-blue-500/10' : ''
            }`}
          >
            <span className="text-sm">😭</span>
            {roast.reaction_cry > 0 && (
              <span className="text-[11px] font-mono text-zinc-300 font-bold">
                {formatCount(roast.reaction_cry)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

