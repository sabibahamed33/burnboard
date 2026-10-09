'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  Flame, ArrowLeft, Loader2, Users, Clock, Share2, Check, X,
  Trophy, Swords, UserPlus, ChevronDown, Trash2, AlertTriangle,
} from 'lucide-react';
import { FeedCard } from '@/components/feed';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { track } from '@/lib/analytics';

/**
 * /challenges/[slug] — Challenge home.
 * See → understand in seconds → participate → see others → compare → invite → share.
 * Entries are canonical posts; reactions/comments/detail stay unified.
 */

const TYPE_META = {
  opinion: { icon: '💬', label: 'OPINION', color: 'text-blue-400', verb: 'share your opinion' },
  question: { icon: '❓', label: 'QUESTION', color: 'text-purple-400', verb: 'ask your question' },
  poll: { icon: '🗳', label: 'POLL', color: 'text-amber-400', verb: 'create your poll' },
  photo: { icon: '📸', label: 'PHOTO', color: 'text-pink-400', verb: 'share your photo' },
  hot_take: { icon: '🌶', label: 'HOT TAKE', color: 'text-red-400', verb: 'drop your hot take' },
};

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeLeft(endsAt) {
  if (!endsAt) return 'No end date';
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return `${Math.max(1, Math.floor(diff / (1000 * 60)))} minutes left`;
  if (hours < 24) return `${hours}h ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}m left`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
}

export default function ChallengeDetailPage() {
  const { slug } = useParams();
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [authUser, setAuthUser] = useState(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [managing, setManaging] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [myVotePostId, setMyVotePostId] = useState(null);
  const [votingId, setVotingId] = useState(null);

  const challenge = data?.challenge || null;
  const meta = TYPE_META[challenge?.challenge_type] || TYPE_META.hot_take;

  // Auth state for CTA decisions
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => setAuthUser(user));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/challenges/${slug}?invites=true`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Challenge not found');
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      setLoading(false);

      // Load first page of entries in parallel with detail
      const entriesRes = await fetch(`/api/challenges/${slug}/entries?limit=10`);
      if (entriesRes.ok) {
        const entriesJson = await entriesRes.json();
        setEntries(entriesJson.items || []);
        setNextCursor(entriesJson.nextCursor || null);
        setMyVotePostId(entriesJson.viewerVotePostId || null);
      }
      track('challenge_viewed', { slug });
    } catch {
      setError('Failed to load challenge');
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug) load();
  }, [slug, load]);

  const loadMoreEntries = useCallback(async () => {
    if (!nextCursor || loadingEntries) return;
    setLoadingEntries(true);
    try {
      const res = await fetch(`/api/challenges/${slug}/entries?limit=10&cursor=${encodeURIComponent(nextCursor)}`);
      if (res.ok) {
        const json = await res.json();
        setEntries(prev => [...prev, ...(json.items || [])]);
        setNextCursor(json.nextCursor || null);
      }
    } catch {} finally {
      setLoadingEntries(false);
    }
  }, [slug, nextCursor, loadingEntries]);

  const showToast = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(''), 3000);
  }, []);

  // ── Vote for an entry (one active vote per user, switchable) ─
  const handleVote = useCallback(async (postId) => {
    if (votingId || !postId) return;
    if (!authUser) {
      // Remember the destination: after login the voter returns here.
      router.push(`/auth?next=${encodeURIComponent(`/challenges/${slug}`)}`);
      return;
    }
    setVotingId(postId);
    try {
      const res = await fetch(`/api/challenges/${slug}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || 'Vote failed');
        return;
      }
      const previous = myVotePostId;
      setMyVotePostId(postId);
      setEntries(prev => prev.map(e => {
        if (e.id === postId) {
          return {
            ...e,
            voteCount: typeof body.votes === 'number' ? body.votes : (e.voteCount || 0) + (previous === postId ? 0 : 1),
            viewerVoted: true,
          };
        }
        if (e.id === previous) {
          return { ...e, voteCount: Math.max(0, (e.voteCount || 1) - 1), viewerVoted: false };
        }
        return e;
      }));
      track('challenge_voted', { slug, postId, switched: !!previous && previous !== postId });
      showToast(previous && previous !== postId ? 'Vote switched 🔥' : 'Vote counted 🔥');
    } catch {
      showToast('Something went wrong');
    } finally {
      setVotingId(null);
    }
  }, [slug, votingId, authUser, myVotePostId, router, showToast]);

  // ── Share (native + clipboard fallback) ────────────────────
  const handleShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const shareText = `${challenge?.title} — join the ${meta.label.toLowerCase()} challenge on BURNBOARD`;
    track('challenge_shared', { slug: challenge?.slug });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'BURNBOARD Challenge', text: shareText, url });
        return;
      } catch { /* user cancelled — fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${url}`);
      setCopied(true);
      showToast('Challenge link copied — send it to someone 🔥');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Could not copy the link');
    }
  }, [challenge, meta.label, slug, showToast]);

  // ── Participate → /create preselects type + challenge ──────
  const handleParticipate = useCallback(() => {
    if (!challenge) return;
    const params = new URLSearchParams({ type: challenge.challenge_type, challenge: challenge.slug });
    if (challenge.community_id) params.set('community', challenge.community_id);
    track('challenge_participate_started', { slug: challenge.slug, type: challenge.challenge_type });
    router.push(`/create?${params.toString()}`);
  }, [challenge, router]);

  const handleDecline = useCallback(async () => {
    try {
      const res = await fetch(`/api/challenges/${slug}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline' }),
      });
      if (res.ok) {
        showToast('Invitation declined');
        load();
      }
    } catch {}
  }, [slug, load, showToast]);

  // ── Invite a user ──────────────────────────────────────────
  const handleInvite = useCallback(async () => {
    const username = inviteUsername.trim().replace(/^@/, '');
    if (!username || inviteBusy) return;
    setInviteBusy(true);
    try {
      const res = await fetch(`/api/challenges/${slug}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || 'Failed to send invitation');
      } else {
        setInviteUsername('');
        showToast(body.message || 'Invitation sent');
        track('challenge_invite_sent', { slug });
      }
    } catch {
      showToast('Something went wrong');
    } finally {
      setInviteBusy(false);
    }
  }, [inviteUsername, inviteBusy, slug, showToast]);

  // ── Creator management: end / cancel / delete ──────────────
  const handleManage = useCallback(async (action) => {
    if (managing) return;
    setManaging(true);
    try {
      const res = await fetch(`/api/challenges/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || 'Action failed');
      } else {
        showToast(action === 'end' ? 'Challenge ended — results are live' : 'Challenge cancelled');
        load();
      }
    } catch {
      showToast('Something went wrong');
    } finally {
      setManaging(false);
    }
  }, [slug, managing, showToast, load]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this challenge? Entry posts stay on BurnBoard — only the challenge is removed.')) return;
    setManaging(true);
    try {
      const res = await fetch(`/api/challenges/${slug}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/challenges');
      } else {
        const body = await res.json().catch(() => ({}));
        showToast(body.error || 'Failed to delete');
      }
    } catch {
      showToast('Something went wrong');
    } finally {
      setManaging(false);
    }
  }, [slug, router, showToast]);

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-7 h-7 text-[#ff4d00] animate-spin mx-auto" aria-hidden="true" />
          <p className="text-xs font-mono text-zinc-400">Loading challenge...</p>
        </div>
      </div>
    );
  }

  if (error || !challenge) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-5xl" aria-hidden="true">🏃💨</div>
          <h1 className="text-xl font-black text-white uppercase tracking-wider">Challenge not found</h1>
          <p className="text-xs text-zinc-400 font-mono">{error || 'It may have been removed.'}</p>
          <Link href="/challenges" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] text-black font-bold text-xs rounded-xl">
            <ArrowLeft className="w-4 h-4" /> Browse challenges
          </Link>
        </div>
      </div>
    );
  }

  const isActive = challenge.status === 'active';
  const isEnded = challenge.status === 'ended';
  const isCancelled = challenge.status === 'cancelled';
  const viewer = challenge.viewer;
  const canInvite = authUser && viewer && (viewer.isCreator || viewer.isParticipant) && isActive;
  const pendingInvite = viewer?.invitation === 'pending';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#ff4d00] text-black px-4 py-2 rounded-xl text-xs font-mono font-bold shadow-lg animate-bounce" role="status">
          {toast}
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header nav */}
        <div className="flex items-center justify-between border-b border-[#222] pb-4">
          <Link href="/challenges" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Challenges</span>
          </Link>
          <div className="flex items-center gap-2">
            {challenge.community && (
              <Link
                href={`/c/${challenge.community.slug}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#262626] text-[11px] font-mono text-zinc-300 hover:border-[#ff4d00]/50 hover:text-white transition-all"
              >
                <Users className="w-3 h-3 text-[#ff4d00]" aria-hidden="true" />
                {challenge.community.name}
              </Link>
            )}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#262626] text-[11px] font-mono text-zinc-300 hover:border-[#ff4d00]/50 hover:text-white transition-all"
              aria-label="Share this challenge"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Share2 className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>

        {/* Challenge header */}
        <div className={`bg-gradient-to-br from-[#1a0a00] via-[#111] to-[#0a0a0a] border-2 rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_0_40px_rgba(255,77,0,0.12)] ${
          isCancelled ? 'border-[#262626]' : isEnded ? 'border-[#2d2d2d]' : 'border-[#ff4d00]/40'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl" aria-hidden="true">{meta.icon}</span>
              <span className={`text-[11px] font-mono font-black uppercase tracking-wider ${meta.color}`}>{meta.label} challenge</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isCancelled ? (
                <span className="px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#333] text-[10px] font-mono text-zinc-400 flex items-center gap-1.5">
                  <X className="w-3 h-3" /> Cancelled
                </span>
              ) : isEnded ? (
                <span className="px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#333] text-[10px] font-mono text-amber-300 flex items-center gap-1.5">
                  <Trophy className="w-3 h-3" /> Ended
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-[#1a1a1a] border border-[#ff4d00]/40 text-[10px] font-mono text-[#ff4d00] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff4d00] animate-pulse" aria-hidden="true" />
                  Live
                </span>
              )}
            </div>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">{challenge.title}</h1>
            {challenge.description && (
              <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{challenge.description}</p>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-mono text-zinc-500 pt-3 border-t border-[#1f1f1f]">
            {challenge.creator && (
              <Link href={`/u/${challenge.creator.username}`} className="hover:text-[#ff4d00] transition-colors">
                by @{challenge.creator.username}
              </Link>
            )}
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" aria-hidden="true" />
              {formatCount(challenge.participant_count)} {challenge.participant_count === 1 ? 'participant' : 'participants'}
            </span>
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3" aria-hidden="true" />
              {formatCount(challenge.entry_count)} entries
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {isActive ? timeLeft(challenge.ends_at) : `Closed ${formatDate(challenge.ends_at || challenge.updated_at)}`}
            </span>
          </div>

          {/* Status messaging — honest, actionable */}
          {isCancelled ? (
            <div className="bg-[#0f0f0f] border border-[#262626] rounded-xl p-3 text-xs text-zinc-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              This challenge was cancelled by its host. Entries already posted remain live on BurnBoard.
            </div>
          ) : isEnded ? (
            <div className="bg-[#0f0f0f] border border-[#262626] rounded-xl p-3 text-xs text-zinc-400 flex items-start gap-2">
              <Trophy className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
              Voting is closed. Results below rank real votes first, reactions break ties.
            </div>
          ) : (
            <div className="bg-[#0f0f0f] border border-[#262626] rounded-xl p-3 text-xs text-zinc-400 flex items-start gap-2">
              <Swords className="w-4 h-4 text-[#ff4d00] shrink-0 mt-0.5" aria-hidden="true" />
              The challenge: <span className="text-zinc-200 font-mono">{meta.verb}</span>. One entry per person — make it count.
            </div>
          )}

          {/* Pending invitation banner */}
          {pendingInvite && isActive && (
            <div className="bg-gradient-to-r from-[#1a1205] to-[#111] border border-[#ff4d00]/40 rounded-xl p-4 flex flex-wrap items-center gap-3">
              <p className="flex-1 min-w-[200px] text-xs text-zinc-300">
                <span className="font-bold text-[#ff4d00]">@{challenge.creator?.username || 'Someone'}</span> invited you to this challenge.
                Accept by posting your entry.
              </p>
              <button
                onClick={handleDecline}
                className="px-3 py-2 rounded-lg border border-[#333] text-[11px] font-mono text-zinc-400 hover:text-white hover:border-red-500/50 transition-all"
                aria-label="Decline challenge invitation"
              >
                Decline
              </button>
              <button
                onClick={handleParticipate}
                className="px-3 py-2 rounded-lg bg-[#ff4d00] text-black text-[11px] font-mono font-bold hover:bg-[#ff6622] transition-all"
              >
                Accept & enter
              </button>
            </div>
          )}

          {/* Host controls */}
          {viewer?.isCreator && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => setShowManage(!showManage)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#262626] text-[11px] font-mono text-zinc-300 hover:border-[#333] transition-all"
                aria-expanded={showManage}
              >
                Manage <ChevronDown className={`w-3 h-3 transition-transform ${showManage ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {showManage && isActive && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleManage('end')}
                    disabled={managing}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-[11px] font-mono text-amber-300 hover:bg-amber-500/20 transition-all disabled:opacity-50"
                  >
                    End now
                  </button>
                  <button
                    onClick={() => handleManage('cancel')}
                    disabled={managing}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 text-[11px] font-mono text-red-300 hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={managing}
                    className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-[11px] font-mono text-zinc-400 hover:text-red-300 hover:border-red-500/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Primary CTA */}
          {!viewer && isActive && (
            <div className="bg-[#0f0f0f] border border-[#262626] rounded-xl p-3 text-center">
              <Link href={`/auth?next=${encodeURIComponent(`/challenges/${slug}`)}`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all">
                Sign in to join this challenge
              </Link>
            </div>
          )}

          {viewer && isActive && (
            viewer.isParticipant ? (
              <div className="bg-green-950/20 border border-green-500/30 rounded-xl p-3 text-xs text-green-300 font-mono flex items-center justify-between gap-3">
                <span>✓ You&apos;re in this challenge{viewer.postId ? ' — entry posted' : ''}.</span>
                <Link href={viewer.postId ? `/post/${viewer.postId}` : '#'} className="text-[#ff4d00] hover:text-white transition-colors">
                  {viewer.postId ? 'View my entry →' : ''}
                </Link>
              </div>
            ) : (
              !pendingInvite && (
                <button
                  onClick={handleParticipate}
                  className="w-full py-3.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(255,77,0,0.4)] flex items-center justify-center gap-2"
                >
                  <Swords className="w-4 h-4" aria-hidden="true" />
                  Enter — {meta.verb}
                </button>
              )
            )
          )}
        </div>

        {/* Invite (host or participant, while live) */}
        {canInvite && (
          <section className="bg-[#111] border border-[#222] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono font-black text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5 text-[#ff4d00]" aria-hidden="true" />
                Challenge someone
              </h2>
              <button
                onClick={() => setInvitesOpen(!invitesOpen)}
                className="text-[10px] font-mono text-zinc-500 hover:text-[#ff4d00] transition-colors"
              >
                {invitesOpen ? 'Hide' : 'View invites'}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                placeholder="@username"
                maxLength={40}
                aria-label="Username to invite"
                className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-all"
              />
              <button
                onClick={handleInvite}
                disabled={inviteBusy || !inviteUsername.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#ff4d00]/50 text-xs font-mono font-bold text-zinc-200 hover:text-white transition-all flex items-center gap-1.5 disabled:opacity-40"
              >
                {inviteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send />}
                Invite
              </button>
            </div>
            <p className="text-[10px] font-mono text-zinc-600">
              Invited friends accept by posting an entry. No spam — invitations are rate-limited.
            </p>

            {invitesOpen && data?.invitations?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {data.invitations.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-[11px] font-mono text-zinc-400 bg-[#0a0a0a] rounded-lg px-3 py-2">
                    <span>@{inv.invitee?.username || 'unknown'} · {inv.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Results (honest, real data only) */}
        {isEnded && data?.outcome && (
          <section className="space-y-4">
            <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-300" aria-hidden="true" />
              Results
            </h2>
            {data.outcome.has_signal ? (
              <div className="space-y-2">
                {data.outcome.top.map((entry, idx) => (
                  <Link
                    key={entry.post_id}
                    href={`/post/${entry.post_id}`}
                    className="block bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                        idx === 0 ? 'bg-[#ff4d00] text-black' : idx === 1 ? 'bg-zinc-300 text-black' : idx === 2 ? 'bg-amber-600 text-black' : 'bg-[#1a1a1a] text-zinc-400'
                      }`} aria-hidden="true">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-100 leading-snug line-clamp-2">
                          &ldquo;{entry.text}&rdquo;
                        </p>
                        <p className="text-[11px] font-mono text-zinc-500 mt-1">
                          {entry.author ? `@${entry.author.username}` : 'Anonymous'} · 🏆 {entry.votes || 0} votes · 🔥 {entry.reactions} reactions
                        </p>
                      </div>
                      {idx === 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-[#ff4d00]/15 border border-[#ff4d00]/40 text-[10px] font-mono font-black text-[#ff4d00] shrink-0 uppercase">
                          Winner
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
                <p className="text-[10px] font-mono text-zinc-600 px-1">
                  Ranked by real votes, reactions break ties · {formatCount(data.outcome.total_participants)} participants · {formatCount(data.outcome.total_votes || 0)} votes · {formatCount(data.outcome.total_reactions)} reactions
                </p>
              </div>
            ) : (
              <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-6 text-center space-y-2">
                <p className="text-2xl" aria-hidden="true">🤷</p>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Not enough votes yet</p>
                <p className="text-[11px] text-zinc-600 font-mono">
                  {data.outcome.total_participants === 0
                    ? 'Nobody entered this challenge.'
                    : `${data.outcome.total_participants} ${data.outcome.total_participants === 1 ? 'person entered' : 'people entered'} but no entries picked up votes or reactions — no winner to declare.`}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Entries */}
        <section className="space-y-4">
          <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#ff4d00]" aria-hidden="true" />
            Entries
            <span className="text-[10px] font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full border border-[#262626]">
              {formatCount(challenge.entry_count)}
            </span>
          </h2>

          {entries.length > 0 ? (
            <div className="space-y-3">
              {entries.map(item => {
                const isOwn = authUser && item.userId && item.userId === authUser.id;
                const voted = myVotePostId === item.id;
                // Signed-out users can tap to reach sign-in; owners of the
                // entry and closed challenges cannot vote.
                const votable = isActive && !isOwn;
                const busy = votingId === item.id;
                return (
                  <div key={item.id} className="space-y-0">
                    <FeedCard item={item} />
                    <div className="flex items-center gap-2 -mt-2 mb-1 px-1">
                      <button
                        onClick={() => handleVote(item.id)}
                        disabled={!votable || busy}
                        aria-pressed={voted}
                        aria-label={voted ? 'Your voted entry' : isOwn ? 'Your entry (no self-voting)' : isActive ? `Vote for this entry (${item.voteCount || 0} votes)` : 'Voting closed'}
                        title={
                          !authUser ? 'Sign in to vote'
                          : isOwn ? 'You cannot vote for your own entry'
                          : !isActive ? 'Voting is closed'
                          : voted ? 'Your vote is on this entry'
                          : 'Vote for this entry (one vote per challenge — tap another entry to switch)'
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold transition-all min-h-[36px] disabled:cursor-not-allowed ${
                          voted
                            ? 'bg-[#ff4d00] text-black shadow-[0_0_12px_rgba(255,77,0,0.35)]'
                            : votable
                              ? 'bg-[#1a1a1a] border border-[#333] text-zinc-300 hover:border-[#ff4d00]/60 hover:text-white'
                              : 'bg-[#111] border border-[#222] text-zinc-600'
                        } ${busy ? 'opacity-60' : ''}`}
                      >
                        <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                        {voted ? 'Voted' : 'Vote'}
                        <span className="opacity-80">· {item.voteCount || 0}</span>
                      </button>
                      {voted && (
                        <span className="text-[10px] font-mono text-zinc-500">
                          Your vote counts — tap another entry to switch it.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {nextCursor && (
                <button
                  onClick={loadMoreEntries}
                  disabled={loadingEntries}
                  className="w-full py-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-xs font-mono font-bold text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loadingEntries ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load more entries'}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-[#111] border border-dashed border-[#333] rounded-2xl p-8 text-center space-y-3">
              {isCancelled ? (
                <>
                  <p className="text-2xl" aria-hidden="true">🕳️</p>
                  <p className="text-xs text-zinc-500">This challenge was cancelled before anyone entered.</p>
                </>
              ) : isEnded ? (
                <>
                  <p className="text-2xl" aria-hidden="true">📭</p>
                  <p className="text-xs text-zinc-500">The challenge ended with no entries.</p>
                </>
              ) : (
                <>
                  <p className="text-2xl" aria-hidden="true">🌱</p>
                  <p className="text-sm font-bold text-white">This space is new. Start the conversation.</p>
                  <p className="text-[11px] text-zinc-500 font-mono">
                    Be the first to {meta.verb} — real entries only, no filler.
                  </p>
                  {viewer && !viewer.isParticipant && (
                    <button
                      onClick={handleParticipate}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold text-xs rounded-xl transition-all"
                    >
                      Be the first entry
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* Footer nav */}
        <div className="text-center pt-4 pb-8 border-t border-[#222]">
          <Link href="/challenges" className="text-xs text-zinc-500 hover:text-[#ff4d00] font-mono transition-colors">
            ← All challenges
          </Link>
        </div>
      </div>
    </div>
  );
}

function Send() {
  return <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />;
}
