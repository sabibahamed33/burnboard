'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime';
import { Flame, ArrowLeft, ArrowBigUp, Share2, Copy, Check, MessageCircle, Send, ExternalLink, Sparkles, Clock } from 'lucide-react';

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

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function RoastItem({ roast, onUpvote, onReact }) {
  const [upvoting, setUpvoting] = useState(false);
  const [lastReacted, setLastReacted] = useState(null);

  const handleUpvote = () => {
    setUpvoting(true);
    setTimeout(() => setUpvoting(false), 300);
    onUpvote(roast);
  };

  const handleReaction = (type) => {
    setLastReacted(type);
    setTimeout(() => setLastReacted(null), 500);
    onReact(roast, type);
  };

  return (
    <div className="bg-[#0a0a0a] border border-[#222] hover:border-[#333] p-4 rounded-2xl transition-all duration-200 group relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#ff4d00] font-black font-mono flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d00]" />
          {roast.anon_id || 'Anonymous Roast'}
          <span className="text-[10px] text-zinc-600 font-mono ml-2">• {timeAgo(roast.created_at)}</span>
        </span>
      </div>
      <p className="text-sm text-zinc-100 leading-relaxed font-normal select-text mb-3">
        &ldquo;{roast.roast_text}&rdquo;
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#1a1a1a]">
        <button
          onClick={handleUpvote}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-black transition-all duration-150 active:scale-90 ${
            roast.userUpvoted
              ? 'bg-[#ff4d00] text-black border-[#ff4d00] shadow-[0_0_12px_rgba(255,77,0,0.4)]'
              : 'bg-[#141414] text-zinc-400 border-[#262626] hover:text-white hover:border-[#3a3a3a]'
          } ${upvoting ? 'scale-110 -translate-y-0.5' : ''}`}
        >
          <ArrowBigUp className={`w-4 h-4 ${roast.userUpvoted ? 'fill-black text-black' : 'text-zinc-400'}`} />
          <span>{formatCount(roast.upvotes || 0)}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <button onClick={() => handleReaction('haha')} className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${lastReacted === 'haha' ? 'scale-125 border-yellow-500/50 bg-yellow-500/10' : ''}`}>
            <span className="text-sm">😂</span>
            {(roast.reaction_haha || 0) > 0 && <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_haha)}</span>}
          </button>
          <button onClick={() => handleReaction('brutal')} className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${lastReacted === 'brutal' ? 'scale-125 border-[#ff4d00]/50 bg-[#ff4d00]/10' : ''}`}>
            <span className="text-sm">💀</span>
            {(roast.reaction_brutal || 0) > 0 && <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_brutal)}</span>}
          </button>
          <button onClick={() => handleReaction('cry')} className={`flex items-center gap-1 px-2.5 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#222] hover:border-[#333] rounded-xl text-xs transition-all active:scale-90 ${lastReacted === 'cry' ? 'scale-125 border-blue-500/50 bg-blue-500/10' : ''}`}>
            <span className="text-sm">😭</span>
            {(roast.reaction_cry || 0) > 0 && <span className="text-[11px] font-mono text-zinc-300 font-bold">{formatCount(roast.reaction_cry)}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PostClient({ profile, initialRoasts }) {
  const [roasts, setRoasts] = useState(initialRoasts || []);
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://burnboard.app/post/${profile.id}`;
  const shareText = `@${profile.username} is getting roasted on BURNBOARD 🔥`;

  // Realtime subscription (best-effort — failures must never crash the page)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    return subscribeRealtime(
      supabase,
      `post-${profile.id}-realtime`,
      (ch) =>
        ch
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roasts', filter: `profile_id=eq.${profile.id}` }, (payload) => {
            setRoasts(prev => [payload.new, ...prev]);
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roasts' }, (payload) => {
            setRoasts(prev => prev.map(r => r.id === payload.new?.id ? payload.new : r));
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'roasts' }, (payload) => {
            setRoasts(prev => prev.filter(r => r.id !== payload.old?.id));
          })
    );
  }, [profile.id]);

  // Optimistic upvote
  const handleUpvote = async (roast) => {
    setRoasts(prev => prev.map(r => r.id === roast.id ? { ...r, upvotes: (r.upvotes || 0) + 1, userUpvoted: true } : r));
    try {
      await supabase.from('roasts').update({ upvotes: (roast.upvotes || 0) + 1 }).eq('id', roast.id);
    } catch (err) { console.error('[Upvote] Failed:', err); }
  };

  // Optimistic reaction
  const handleReact = async (roast, type) => {
    const field = type === 'haha' ? 'reaction_haha' : type === 'brutal' ? 'reaction_brutal' : 'reaction_cry';
    setRoasts(prev => prev.map(r => r.id === roast.id ? { ...r, [field]: (r[field] || 0) + 1 } : r));
    try {
      await supabase.from('roasts').update({ [field]: (roast[field] || 0) + 1 }).eq('id', roast.id);
    } catch (err) { console.error('[React] Failed:', err); }
  };

  // Share handlers
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Roast me brutally 🔥 ${shareUrl}`)}`, '_blank');
  };

  const handleX = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I'm getting roasted on BURNBOARD 🔥 ${shareUrl}`)}`, '_blank');
  };

  const getPlatformBadge = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'x': case 'x / twitter': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'linkedin': return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      case 'github': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'instagram': return 'bg-pink-500/15 text-pink-400 border-pink-500/30';
      default: return 'bg-[#ff4d00]/15 text-[#ff4d00] border-[#ff4d00]/30';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back nav */}
        <a href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Feed</span>
        </a>

        {/* Profile Header */}
        <div className={`bg-[#111] rounded-2xl p-5 sm:p-6 border ${profile.featured ? 'border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.18)]' : 'border-[#222]'}`}>
          {profile.featured && (
            <div className="absolute -top-3 right-5 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1 relative">
              <Sparkles className="w-3 h-3 fill-black" />
              <span>Featured Target</span>
            </div>
          )}
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black shrink-0 shadow-[0_0_20px_rgba(255,77,0,0.25)] ${profile.avatar_color || 'bg-[#ff4d00] text-black'}`}>
              {profile.avatar_letter}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-white">@{profile.username}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getPlatformBadge(profile.platform)}`}>
                  {profile.tagline || profile.platform}
                </span>
              </div>
              <p className="text-zinc-300 text-sm mt-2 leading-relaxed">{profile.bio}</p>
              <div className="flex items-center gap-4 mt-3 text-xs font-mono text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-[#ff4d00]" />
                  <span className="text-zinc-300 font-bold">{formatCount(profile.roast_count || 0)}</span>
                  <span>roasts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-300 font-bold">▲ {formatCount(profile.total_upvotes || 0)}</span>
                  <span>upvotes</span>
                </div>
              </div>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="mt-5 pt-4 border-t border-[#222]">
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-2">Share this profile</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1f1f1f] border border-[#262626] rounded-xl text-xs font-mono text-zinc-300 hover:text-white transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 rounded-xl text-xs font-mono text-[#25D366] hover:text-[#25D366] transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
              <button
                onClick={handleX}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1d9bf0]/10 hover:bg-[#1d9bf0]/20 border border-[#1d9bf0]/30 rounded-xl text-xs font-mono text-[#1d9bf0] hover:text-[#1d9bf0] transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Post on X</span>
              </button>
              <a
                href={`https://burnboard.app/roast/${profile.platform?.toLowerCase()}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ff4d00]/10 hover:bg-[#ff4d00]/20 border border-[#ff4d00]/30 rounded-xl text-xs font-mono text-[#ff4d00] hover:text-[#ff4d00] transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>More {profile.platform} Roasts</span>
              </a>
            </div>
          </div>
        </div>

        {/* Roasts List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#ff4d00]" />
            Roasts ({roasts.length})
          </h2>

          {roasts.length > 0 ? (
            roasts.map(roast => (
              <RoastItem
                key={roast.id}
                roast={roast}
                onUpvote={handleUpvote}
                onReact={handleReact}
              />
            ))
          ) : (
            <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-3">
              <div className="text-3xl">🔥</div>
              <p className="text-sm text-zinc-400 font-bold">No roasts yet</p>
              <p className="text-xs text-zinc-500">Be the first to roast @{profile.username}! Share the link and invite friends.</p>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ff4d00] text-black font-bold text-xs rounded-xl"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Profile Link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
