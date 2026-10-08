'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Flame, ArrowLeft, Check, X, ImagePlus, Plus, Trash2,
  MessageCircle, HelpCircle, BarChart3, Camera, Zap, Users, Globe, ChevronDown
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import PhotoComposer from '@/components/create/PhotoComposer';

/**
 * /create — Universal Content Creation Entry Point
 * 
 * Step 1: Choose content type
 * Step 2: Create content
 * Step 3: Post and confirm
 * 
 * Supports: Opinion, Question, Poll, Photo, Hot Take
 * Roast creation redirects to existing /hot-seat flow.
 */

// ── Content Type Definitions ──────────────────────────────
const CONTENT_TYPES = [
  {
    type: 'opinion',
    label: 'Share an Opinion',
    icon: '💬',
    description: 'Share your thoughts with the community',
    color: 'border-blue-500/40 hover:border-blue-500/60',
    activeColor: 'bg-blue-500/10 border-blue-500',
    placeholder: 'What\'s your opinion?',
    maxLength: 500,
    minLength: 10,
  },
  {
    type: 'question',
    label: 'Ask a Question',
    icon: '❓',
    description: 'Get real opinions from real humans',
    color: 'border-purple-500/40 hover:border-purple-500/60',
    activeColor: 'bg-purple-500/10 border-purple-500',
    placeholder: 'What\'s your question?',
    maxLength: 500,
    minLength: 10,
  },
  {
    type: 'poll',
    label: 'Create a Poll',
    icon: '🗳',
    description: 'Let the community decide',
    color: 'border-amber-500/40 hover:border-amber-500/60',
    activeColor: 'bg-amber-500/10 border-amber-500',
    placeholder: 'What do you want to ask?',
    maxLength: 300,
    minLength: 5,
  },
  {
    type: 'photo',
    label: 'Share a Photo',
    icon: '📸',
    description: 'Share an image with the community',
    color: 'border-pink-500/40 hover:border-pink-500/60',
    activeColor: 'bg-pink-500/10 border-pink-500',
    placeholder: 'Add a caption...',
    maxLength: 500,
    minLength: 0,
  },
  {
    type: 'hot_take',
    label: 'Hot Take',
    icon: '🌶',
    description: 'A bold take designed to spark debate',
    color: 'border-red-500/40 hover:border-red-500/60',
    activeColor: 'bg-red-500/10 border-red-500',
    placeholder: 'Drop your hottest take...',
    maxLength: 280,
    minLength: 10,
  },
];

const ROAST_TYPE = {
  type: 'roast',
  label: 'Get Roasted',
  icon: '🔥',
  description: 'Put yourself or someone on the Hot Seat',
  color: 'border-[#ff4d00]/40 hover:border-[#ff4d00]/60',
  activeColor: 'bg-[#ff4d00]/10 border-[#ff4d00]',
  creationMode: 'redirect',
  creationPath: '/hot-seat',
};

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedType, setSelectedType] = useState(null);
  const [step, setStep] = useState(1); // 1=select, 2=create, 3=success
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdPost, setCreatedPost] = useState(null);

  // Post-to target: 'public' (BurnBoard) or a community id
  const [targetCommunityId, setTargetCommunityId] = useState('public');
  const [myCommunities, setMyCommunities] = useState([]);
  const [communityPickerOpen, setCommunityPickerOpen] = useState(false);

  // Challenge entry context (from /challenges/[slug] → /create?challenge=...)
  const [challengeCtx, setChallengeCtx] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);

  // Content state
  const [text, setText] = useState('');
  const [context, setContext] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);

  // Draft protection
  const DRAFT_KEY = 'burnboard_create_draft';

  // Load draft on mount (skipped when composing a challenge entry)
  useEffect(() => {
    if (searchParams.get('challenge')) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.text) setText(draft.text);
        if (draft.context) setContext(draft.context);
        if (draft.options) setOptions(draft.options);
        if (draft.selectedType) {
          setSelectedType(draft.selectedType);
          setStep(2);
        }
      }
    } catch {}
  }, []);

  // Preselect community from ?community=<id> (community page → create flow)
  useEffect(() => {
    const communityParam = searchParams.get('community');
    if (communityParam) {
      setTargetCommunityId(communityParam);
    }
  }, [searchParams]);

  // Challenge participation preselect: /create?type=hot_take&challenge=my-slug
  // The type is locked to the challenge's required format and the post is
  // sent with challenge_id so the server validates + registers participation.
  useEffect(() => {
    const challengeSlug = searchParams.get('challenge');
    if (!challengeSlug) return;

    let cancelled = false;
    setChallengeLoading(true);
    const loadChallenge = async () => {
      try {
        const res = await fetch(`/api/challenges/${encodeURIComponent(challengeSlug)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json.challenge) return;

        const ctx = {
          id: json.challenge.id,
          slug: json.challenge.slug,
          title: json.challenge.title,
          type: json.challenge.challenge_type,
          communityId: json.challenge.community_id || null,
          status: json.challenge.status,
          isParticipant: !!json.challenge.viewer?.isParticipant,
        };
        setChallengeCtx(ctx);

        // Type: query param wins if valid, otherwise the challenge's own type
        const typeParam = searchParams.get('type');
        const wantedType = CONTENT_TYPES.find(t => t.type === (typeParam || ctx.type));
        if (wantedType) {
          setSelectedType(wantedType);
          setStep(2);
        }

        // Community-hosted challenges lock the post target to that community
        if (ctx.communityId) {
          setTargetCommunityId(ctx.communityId);
        }
        track('challenge_composer_opened', { challengeSlug: ctx.slug });
      } catch {
        // Non-fatal: page behaves as a normal create flow
      } finally {
        if (!cancelled) setChallengeLoading(false);
      }
    };
    loadChallenge();
    return () => { cancelled = true; };
  }, [searchParams]);

  // Load the user's communities for the Post-to picker
  useEffect(() => {
    const loadCommunities = async () => {
      try {
        const res = await fetch('/api/communities?mine=true');
        if (res.ok) {
          const data = await res.json();
          setMyCommunities(data.communities || []);
        }
      } catch {}
    };
    loadCommunities();
  }, []);

  // Track community create usage
  useEffect(() => {
    if (targetCommunityId !== 'public') {
      track('community_create_opened', { communityId: targetCommunityId });
    }
  }, [targetCommunityId]);

  // Save draft on change
  useEffect(() => {
    if (step === 2 && selectedType) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          text, context, options, selectedType,
        }));
      } catch {}
    }
  }, [text, context, options, selectedType, step]);

  // Clear draft
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, []);

  // Handle type selection
  const handleTypeSelect = useCallback((type) => {
    if (type.creationMode === 'redirect') {
      router.push(type.creationPath);
      return;
    }
    setSelectedType(type);
    setStep(2);
    track('content_type_selected', { type: type.type });
  }, [router]);

  // Handle back to type selection
  const handleBack = useCallback(() => {
    setStep(1);
    setSelectedType(null);
    setText('');
    setContext('');
    setOptions(['', '']);
    setMediaPreview(null);
    setMediaFile(null);
    setError('');
    clearDraft();
  }, [clearDraft]);

  // Handle publish
  const handlePublish = useCallback(async () => {
    if (!selectedType) return;

    // Validate
    if (selectedType.minLength > 0 && text.trim().length < selectedType.minLength) {
      setError(`Content must be at least ${selectedType.minLength} characters`);
      return;
    }

    if (selectedType.type === 'poll') {
      const validOptions = options.filter(o => o.trim());
      if (validOptions.length < 2) {
        setError('Poll needs at least 2 options');
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        content_type: selectedType.type,
        text: text.trim(),
        context: context.trim() || undefined,
      };

      if (selectedType.type === 'poll') {
        payload.options = options.filter(o => o.trim());
      }

      // Post-to target (community requires server-side membership validation)
      if (targetCommunityId && targetCommunityId !== 'public') {
        payload.community_id = targetCommunityId;
      }

      // Challenge entries are canonical posts tagged with the challenge — the
      // server validates state/type/eligibility and registers participation.
      if (challengeCtx) {
        payload.challenge_id = challengeCtx.id;
      }

      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create post');
        return;
      }

      setCreatedPost(data.post);
      setStep(3);
      clearDraft();
      track('publish_succeeded', { type: selectedType.type });
    } catch (err) {
      setError('Something went wrong. Please try again.');
      track('publish_failed', { type: selectedType.type, error: err.message });
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedType, text, context, options, clearDraft, targetCommunityId, challengeCtx]);

  // Character count
  const charCount = text.length;
  const maxChars = selectedType?.maxLength || 500;
  const charPercentage = (charCount / maxChars) * 100;

  // ── Step 3: Success ──────────────────────────────────────
  if (step === 3 && createdPost) {
    const createdVisibility = createdPost.visibility || 'public';
    const isDraftPost = createdVisibility === 'draft';
    const isScheduledPost = createdVisibility === 'scheduled';
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-lg mx-auto space-y-6 pt-8">
          <div className="text-center space-y-4">
            <div className="text-6xl animate-bounce">✅</div>
            <h1 className="text-2xl font-black text-white uppercase tracking-wider">
              {isDraftPost ? 'DRAFT SAVED!' : isScheduledPost ? 'SCHEDULED!' : 'POSTED!'}
            </h1>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto">
              {isDraftPost
                ? 'Your draft is private — only you can see it until you publish.'
                : isScheduledPost
                  ? 'Your post will go live automatically at the scheduled time.'
                  : `Your ${selectedType.label.toLowerCase()} is now live.`}
            </p>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-2xl p-5 space-y-3">
            {createdPost.media_url && (
              <div className="rounded-xl overflow-hidden">
                <img src={createdPost.media_url} alt="Published post" className="w-full max-h-80 object-cover" />
              </div>
            )}
            {(text || createdPost.content_text) && (
              <p className="text-sm text-zinc-100 leading-relaxed">
                &ldquo;{text || createdPost.content_text}&rdquo;
              </p>
            )}
            <p className="text-[11px] font-mono text-zinc-500">
              {selectedType.icon} {selectedType.label} ·{' '}
              {challengeCtx
                ? `entry in challenge "${challengeCtx.title}"`
                : targetCommunityId !== 'public'
                  ? myCommunities.find(c => c.id === targetCommunityId)?.name || 'community'
                  : 'BurnBoard'}{' '}
              · just now
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href={challengeCtx
                ? `/challenges/${challengeCtx.slug}`
                : targetCommunityId !== 'public'
                  ? `/c/${myCommunities.find(c => c.id === targetCommunityId)?.slug || ''}`
                  : '/home'}
              className="flex-1 py-3 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold rounded-xl text-center text-xs uppercase tracking-wider transition-all"
            >
              {challengeCtx ? 'View Challenge' : 'View Post'}
            </Link>
            <button
              onClick={handleBack}
              className="flex-1 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#333] text-zinc-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Create Content ──────────────────────────────
  if (step === 2 && selectedType) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
        <div className="max-w-lg mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#222] pb-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="flex items-center gap-2" style={{ color: selectedType.color.replace('border-', '').replace('/40', '').replace('/60', '') }}>
              <span>{selectedType.icon}</span>
              <span className="font-mono font-black text-sm uppercase">{selectedType.label}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono flex items-center gap-2">
              <X className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Challenge entry banner (locked type/community, server-validated) */}
          {challengeCtx && (
            <div className="bg-gradient-to-r from-[#1a1205] to-[#111] border border-[#ff4d00]/40 rounded-xl p-4 space-y-1.5">
              <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[#ff4d00]">
                {challengeCtx.isParticipant ? '⚔️ Update entry' : '⚔️ Challenge entry'}
              </p>
              <p className="text-xs text-zinc-200">
                Posting as your entry to <span className="font-bold text-white">&ldquo;{challengeCtx.title}&rdquo;</span>
              </p>
              <p className="text-[10px] font-mono text-zinc-500">
                {challengeCtx.communityId ? 'Goes to the hosting community — members only.' : 'Posted to Public BurnBoard.'} One entry per person.
              </p>
            </div>
          )}

          {/* Content Input */}
          <div className="space-y-4">
            {/* Main text */}
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={selectedType.placeholder}
                rows={selectedType.type === 'hot_take' ? 3 : 5}
                maxLength={selectedType.maxLength}
                autoFocus
                className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30 resize-none transition-all"
              />
              {/* Character count */}
              <div className="flex items-center justify-between mt-1.5">
                <div className="h-1 flex-1 bg-[#1a1a1a] rounded-full overflow-hidden mr-3">
                  <div
                    className="h-full transition-all duration-200 rounded-full"
                    style={{
                      width: `${Math.min(charPercentage, 100)}%`,
                      backgroundColor: charPercentage > 90 ? '#ef4444' : charPercentage > 70 ? '#f59e0b' : '#ff4d00',
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                  {maxChars - charCount} left
                </span>
              </div>
            </div>

            {/* Context field (for opinion, question) */}
            {selectedType.supportsContext !== false && selectedType.type !== 'poll' && selectedType.type !== 'photo' && (
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Context <span className="text-zinc-600">(optional)</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Add more context..."
                  rows={2}
                  maxLength={500}
                  className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] resize-none transition-all"
                />
              </div>
            )}

            {/* Poll options */}
            {selectedType.type === 'poll' && (
              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Options
                </label>
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-500 w-5 shrink-0">{i + 1}.</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...options];
                        newOpts[i] = e.target.value;
                        setOptions(newOpts);
                      }}
                      placeholder={`Option ${i + 1}`}
                      maxLength={100}
                      className="flex-1 bg-[#111] border border-[#222] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-all"
                    />
                    {options.length > 2 && (
                      <button
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {options.length < 6 && (
                  <button
                    onClick={() => setOptions([...options, ''])}
                    className="flex items-center gap-2 text-xs font-mono text-[#ff4d00] hover:text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add option
                  </button>
                )}
              </div>
            )}

            {/* Rich photo composer (upload + optional metadata + privacy) */}
            {selectedType.type === 'photo' && (
              <PhotoComposer
                communityId={targetCommunityId}
                challengeCtx={challengeCtx}
                onBack={handleBack}
                onPublished={(post) => {
                  setCreatedPost(post);
                  setStep(3);
                  clearDraft();
                  track('publish_succeeded', { type: 'photo', visibility: post?.visibility || 'public' });
                }}
              />
            )}
          </div>

          {/* Post-to selector: Public BurnBoard or a community you belong to */}
          {!challengeCtx && (
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Post to
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCommunityPickerOpen(!communityPickerOpen)}
                className="w-full flex items-center gap-3 bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white hover:border-[#ff4d00]/50 transition-all"
                aria-haspopup="listbox"
                aria-expanded={communityPickerOpen}
              >
                {targetCommunityId === 'public' ? (
                  <>
                    <Globe className="w-4 h-4 text-[#ff4d00] shrink-0" aria-hidden="true" />
                    <span className="font-bold">Public BurnBoard</span>
                    <span className="text-[10px] font-mono text-zinc-500">Everyone</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 text-[#ff4d00] shrink-0" aria-hidden="true" />
                    <span className="font-bold truncate">
                      {myCommunities.find(c => c.id === targetCommunityId)?.name || 'Community'}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">Members only</span>
                  </>
                )}
                <ChevronDown className={`w-4 h-4 text-zinc-500 ml-auto transition-transform ${communityPickerOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              {communityPickerOpen && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { setTargetCommunityId('public'); setCommunityPickerOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      targetCommunityId === 'public' ? 'bg-[#ff4d00]/10' : 'hover:bg-[#222]'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-[#ff4d00]" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">Public BurnBoard</p>
                      <p className="text-[10px] font-mono text-zinc-500">Reach everyone</p>
                    </div>
                    {targetCommunityId === 'public' && <Check className="w-4 h-4 text-[#ff4d00]" aria-hidden="true" />}
                  </button>

                  {myCommunities.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setTargetCommunityId(c.id); setCommunityPickerOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        targetCommunityId === c.id ? 'bg-[#ff4d00]/10' : 'hover:bg-[#222]'
                      }`}
                    >
                      <Users className="w-4 h-4 text-[#ff4d00] shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{c.name}</p>
                        <p className="text-[10px] font-mono text-zinc-500 truncate">/c/{c.slug}</p>
                      </div>
                      {targetCommunityId === c.id && <Check className="w-4 h-4 text-[#ff4d00]" aria-hidden="true" />}
                    </button>
                  ))}

                  {myCommunities.length === 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[11px] text-zinc-500 font-mono">
                        You haven&apos;t joined any communities yet.{' '}
                        <Link href="/c" className="text-[#ff4d00] hover:text-white transition-colors">Browse communities →</Link>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Publish Button (photo uses its own composer actions) */}
          {selectedType.type !== 'photo' && (
          <button
            onClick={handlePublish}
            disabled={isSubmitting || text.trim().length < selectedType.minLength}
            aria-busy={isSubmitting}
            className="btn-burn tactile w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span className="spinner w-4 h-4" aria-hidden />
            ) : (
              <>
                <Flame className="w-4 h-4 fill-black" />
                Post {selectedType.label}
              </>
            )}
          </button>
          )}
        </div>
      </div>
    );
  }

  // ── Step 1: Choose Content Type ──────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222] pb-4">
          <Link href="/home" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <div className="flex items-center gap-2 text-[#ff4d00] font-mono font-black text-sm">
            <Flame className="w-4 h-4 fill-[#ff4d00]" />
            <span>CREATE</span>
          </div>
        </div>

        {/* Question */}
        <div className="text-center space-y-2">
          <h1 className="text-xl font-black text-white uppercase tracking-wider">
            What&apos;s happening?
          </h1>
          <p className="text-xs text-zinc-400">
            Choose what you want to share with the community
          </p>
        </div>

        {/* Content Type Grid */}
        <div className="space-y-3">
          {/* Roast (featured) */}
          <button
            onClick={() => handleTypeSelect(ROAST_TYPE)}
            className={`w-full text-left p-4 sm:p-5 rounded-2xl border-2 transition-all active:scale-[0.98] ${
              ROAST_TYPE.activeColor || ROAST_TYPE.color
            }`}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">{ROAST_TYPE.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-white">{ROAST_TYPE.label}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{ROAST_TYPE.description}</p>
              </div>
              <div className="text-[#ff4d00] shrink-0">
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </div>
            </div>
          </button>

          {/* Other types */}
          {CONTENT_TYPES.map((type) => (
            <button
              key={type.type}
              onClick={() => handleTypeSelect(type)}
              className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.98] ${type.color}`}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">{type.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{type.label}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{type.description}</p>
                </div>
                <div className="text-zinc-500 shrink-0">
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
