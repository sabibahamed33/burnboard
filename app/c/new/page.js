'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Flame, Loader2, Check, X, Users, ChevronRight, Tag
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { track } from '@/lib/analytics';

/**
 * /c/new — Create a Community
 *
 * NAME → DESCRIPTION → TOPIC → VISIBILITY → CREATE
 * Every user can create communities. The founding user becomes the Owner
 * (a management role on a normal USER account — no Creator identity).
 */

export default function CreateCommunityPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [topicSlug, setTopicSlug] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [topics, setTopics] = useState([]);
  const [slugPreview, setSlugPreview] = useState('');
  const [slugAvailable, setSlugAvailable] = useState(null); // null | true | false
  const [checkingSlug, setCheckingSlug] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load topics
  useEffect(() => {
    fetch('/api/communities/topics')
      .then(r => r.json())
      .then(d => setTopics(d.topics || []))
      .catch(() => {});
  }, []);

  // Check auth on mount
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) router.push('/auth');
      });
    }
  }, [router]);

  // Live slug preview + availability
  const slugify = (value) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

  useEffect(() => {
    const s = slugify(name);
    setSlugPreview(s);
    if (s.length < 3) {
      setSlugAvailable(null);
      setCheckingSlug(false);
      return;
    }
    setCheckingSlug(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/communities?slug=${encodeURIComponent(s)}`);
        setSlugAvailable(res.status === 404);
      } catch {
        setSlugAvailable(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [name]);

  const handleCreate = useCallback(async () => {
    if (submitting) return;

    if (name.trim().length < 3) {
      setError('Community name must be at least 3 characters');
      return;
    }
    if (slugAvailable === false) {
      setError('A community with that name already exists');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          topic_slug: topicSlug || undefined,
          visibility,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create community');
        return;
      }

      track('community_created', { communityId: data.community.id, slug: data.community.slug });
      router.push(`/c/${data.community.slug}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, name, description, topicSlug, visibility, slugAvailable, router]);

  const nameValid = name.trim().length >= 3;
  const canSubmit = nameValid && slugAvailable !== false && !submitting;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222] pb-4">
          <Link href="/c" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Communities</span>
          </Link>
          <div className="flex items-center gap-2 text-[#ff4d00] font-mono font-black text-sm">
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>NEW COMMUNITY</span>
          </div>
        </div>

        {/* Intro */}
        <div className="text-center space-y-2">
          <h1 className="text-xl font-black text-white uppercase tracking-wider">
            Create a space
          </h1>
          <p className="text-xs text-zinc-400">
            A place where people who care about the same thing can burn together.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono flex items-center gap-2">
            <X className="w-4 h-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Form */}
        <div className="space-y-5">
          {/* NAME */}
          <div>
            <label htmlFor="community-name" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              1. Name
            </label>
            <input
              id="community-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Tech Roasts"
              maxLength={60}
              autoFocus
              className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] focus:ring-1 focus:ring-[#ff4d00]/30 transition-all"
            />
            {slugPreview && (
              <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono">
                <span className="text-zinc-500">burnboard.app/c/<span className="text-zinc-300">{slugPreview}</span></span>
                {checkingSlug ? (
                  <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" aria-hidden="true" />
                ) : slugAvailable === true ? (
                  <span className="flex items-center gap-0.5 text-green-400"><Check className="w-3 h-3" aria-hidden="true" /> available</span>
                ) : slugAvailable === false ? (
                  <span className="flex items-center gap-0.5 text-red-400"><X className="w-3 h-3" aria-hidden="true" /> taken</span>
                ) : null}
              </div>
            )}
          </div>

          {/* DESCRIPTION */}
          <div>
            <label htmlFor="community-description" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              2. Description <span className="text-zinc-600">(optional)</span>
            </label>
            <textarea
              id="community-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this space about? Who is it for?"
              rows={3}
              maxLength={300}
              className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] resize-none transition-all"
            />
            <div className="text-right text-[10px] font-mono text-zinc-600 mt-1">
              {description.length}/300
            </div>
          </div>

          {/* TOPIC */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              3. Topic <span className="text-zinc-600">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {topics.map(topic => (
                <button
                  key={topic.slug}
                  type="button"
                  onClick={() => setTopicSlug(topicSlug === topic.slug ? '' : topic.slug)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold border transition-all ${
                    topicSlug === topic.slug
                      ? 'bg-[#ff4d00]/10 border-[#ff4d00] text-[#ff4d00]'
                      : 'bg-[#111] border-[#262626] text-zinc-400 hover:text-white hover:border-[#3a3a3a]'
                  }`}
                  aria-pressed={topicSlug === topic.slug}
                >
                  {topic.name}
                </button>
              ))}
            </div>
            {topics.length === 0 && (
              <p className="text-[11px] text-zinc-600 font-mono">Loading topics...</p>
            )}
          </div>

          {/* VISIBILITY — who can find and join this space */}
          <div className="bg-[#111] border border-[#222] rounded-xl p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
              <Tag className="w-3.5 h-3.5" aria-hidden="true" />
              4. Visibility
            </div>
            <div className="space-y-2" role="radiogroup" aria-label="Community visibility">
              {[
                { key: 'public', icon: '🌐', label: 'Public', desc: 'Anyone can discover, view, join, and participate.' },
                { key: 'private', icon: '🔒', label: 'Private', desc: 'Viewable with the link. Joining needs your approval.' },
                { key: 'hidden', icon: '🫥', label: 'Hidden', desc: 'Invisible in search and discovery. Members only.' },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={visibility === opt.key}
                  onClick={() => setVisibility(opt.key)}
                  className={`w-full flex items-start gap-3 text-left px-3 py-2.5 rounded-xl border transition-all min-h-[52px] ${
                    visibility === opt.key
                      ? 'bg-[#ff4d00]/10 border-[#ff4d00]/50'
                      : 'bg-[#0a0a0a] border-[#222] hover:border-[#333]'
                  }`}
                >
                  <span className="text-base shrink-0" aria-hidden="true">{opt.icon}</span>
                  <span className="min-w-0">
                    <span className={`block text-xs font-bold ${visibility === opt.key ? 'text-white' : 'text-zinc-300'}`}>
                      {opt.label}
                    </span>
                    <span className="block text-[10px] font-mono text-zinc-500 mt-0.5">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CREATE */}
        <button
          onClick={handleCreate}
          disabled={!canSubmit}
          className="w-full py-3.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(255,77,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <>
              <Flame className="w-4 h-4 fill-black" aria-hidden="true" />
              Create Community
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </>
          )}
        </button>

        <p className="text-[10px] text-zinc-600 text-center font-mono leading-relaxed">
          You&apos;ll become the Owner. Owners can add moderators, set rules, and remove content from their space.
        </p>
      </div>
    </div>
  );
}