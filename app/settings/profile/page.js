'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check, Camera, X } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import Avatar from '@/components/ui/Avatar';
import { getParticipantId } from '@/components/feed/ReactionBar';
import { track } from '@/lib/analytics';

/**
 * /settings/profile — Edit Profile Page
 * 
 * Allows users to update their profile information.
 */

const RESERVED_USERNAMES = ['admin', 'support', 'help', 'system', 'burnboard', 'mod', 'official'];

export default function EditProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userId, setUserId] = useState(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Interest topic tags (shown on your profile)
  const [topicCatalog, setTopicCatalog] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [topicsReady, setTopicsReady] = useState(false);
  const [topicsSaving, setTopicsSaving] = useState(false);
  const MAX_TOPICS = 8;

  // Fetch current profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/auth');
          return;
        }

        setUserId(user.id);

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profile) {
          setDisplayName(profile.display_name || '');
          setBio(profile.bio || '');
          setUsername(profile.username || '');
          setAvatarUrl(profile.avatar_url || '');
          setWebsite(profile.website_url || '');
          setLocation(profile.location_text || '');
        }

        // Topic associations (identity tags shown on your profile)
        try {
          const res = await fetch('/api/creator/topics', { cache: 'no-store' });
          const topicsData = await res.json();
          if (res.ok && topicsData.topics) {
            setTopicCatalog(topicsData.topics);
            setSelectedTopics(topicsData.selected || []);
          }
        } catch (e) {
          // Topics stay hidden — profile still fully editable.
        } finally {
          setTopicsReady(true);
        }
      } catch (err) {
        console.error('[Edit Profile] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router]);

  // Check username availability
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(true);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await fetch(`/api/profile?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        // If profile exists and it's not the current user's, username is taken
        setUsernameAvailable(!data.profile || data.profile.id === userId);
      } catch {
        setUsernameAvailable(true);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, userId]);

  const handleSave = useCallback(async () => {
    if (!userId || saving) return;

    // Validate
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (RESERVED_USERNAMES.includes(cleanUsername)) {
      setError('This username is reserved');
      return;
    }
    if (!usernameAvailable) {
      setError('Username is already taken');
      return;
    }
    if (bio.length > 200) {
      setError('Bio must be 200 characters or less');
      return;
    }
    if (website && website.length > 200) {
      setError('Website must be 200 characters or less');
      return;
    }
    if (location && location.length > 60) {
      setError('Location must be 60 characters or less');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          bio: bio.trim(),
          username: cleanUsername,
          avatar_url: avatarUrl || undefined,
          website_url: website.trim() || undefined,
          location: location.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update profile');
        return;
      }

      setSuccess('Profile updated!');
      track('profile_updated', { userId });

      // Navigate to profile if username changed
      if (cleanUsername !== username) {
        router.push(`/u/${cleanUsername}`);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [userId, displayName, bio, username, avatarUrl, usernameAvailable, saving, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#ff4d00]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 font-sans">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222] pb-4">
          <Link href="/home" className="flex items-center gap-2 text-zinc-400 hover:text-white font-mono text-xs transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <h1 className="text-sm font-black text-white uppercase tracking-wider">Edit Profile</h1>
          <div className="w-16" />
        </div>

        {/* Error/Success */}
        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono flex items-center gap-2">
            <X className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-950/40 border border-green-500/30 rounded-xl p-3 text-xs text-green-400 font-mono flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Avatar Preview */}
        <div className="flex justify-center">
          <div className="relative">
            <Avatar username={username || 'user'} size="2xl" src={avatarUrl} />
            <div className="absolute bottom-0 right-0 w-8 h-8 bg-[#ff4d00] rounded-full flex items-center justify-center border-2 border-[#0a0a0a]">
              <Camera className="w-4 h-4 text-black" />
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Username */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={20}
                className="w-full bg-[#111] border border-[#222] rounded-xl pl-8 pr-10 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingUsername ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                ) : username.length >= 3 ? (
                  usernameAvailable ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <X className="w-4 h-4 text-red-400" />
                  )
                ) : null}
              </div>
            </div>
            {username.length > 0 && username.length < 3 && (
              <p className="text-[10px] text-zinc-500 mt-1 font-mono">Must be at least 3 characters</p>
            )}
            {username.length > 0 && !usernameAvailable && (
              <p className="text-[10px] text-red-400 mt-1 font-mono">Username is already taken</p>
            )}
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              maxLength={50}
              className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-all"
            />
            <p className="text-[10px] text-zinc-600 mt-1 font-mono">{50 - displayName.length} characters left</p>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about yourself..."
              rows={3}
              maxLength={200}
              className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] resize-none transition-all"
            />
            <p className="text-[10px] text-zinc-600 mt-1 font-mono">{200 - bio.length} characters left</p>
          </div>

          {/* Website (link in bio) */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Website
            </label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="your-site.com"
              maxLength={200}
              className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-all"
            />
            <p className="text-[10px] text-zinc-600 mt-1 font-mono">Shown on your profile. https:// is added automatically.</p>
          </div>

          {/* Location (explicit only — never GPS) */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City or region, e.g. Dhaka"
              maxLength={60}
              className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] transition-all"
            />
            <p className="text-[10px] text-zinc-600 mt-1 font-mono">Optional. Only what you type here is shown — nothing automatic.</p>
          </div>
        </div>

        {/* Topics — what you post about (identity tags) */}
        <div className="bg-[#111] border border-[#222] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              What you post about
            </label>
            {topicsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ff4d00]" />}
          </div>
          <p className="text-[10px] text-zinc-600 mt-0.5 mb-3">
            Pick up to {MAX_TOPICS} topics that describe your content — they appear on your profile and help people understand you.
          </p>
          {topicsReady ? (
            topicCatalog.length === 0 ? (
              <p className="text-[11px] text-zinc-600 font-mono">Topics are not available yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {topicCatalog.map((topic) => {
                  const active = selectedTopics.includes(topic.id);
                  const disabled = topicsSaving || (!active && selectedTopics.length >= MAX_TOPICS);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      disabled={disabled}
                      onClick={async () => {
                        const next = active
                          ? selectedTopics.filter((id) => id !== topic.id)
                          : [...selectedTopics, topic.id];
                        setTopicsSaving(true);
                        setError('');
                        try {
                          const res = await fetch('/api/creator/topics', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ topic_ids: next }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            setError(data.error || 'Failed to save topics');
                          } else {
                            setSelectedTopics(data.selected || next);
                          }
                        } catch (err) {
                          setError('Failed to save topics');
                        } finally {
                          setTopicsSaving(false);
                        }
                      }}
                      className={`text-[11px] font-mono px-3 py-1.5 rounded-full border transition-all ${
                        active
                          ? 'bg-[#ff4d00] text-black border-[#ff4d00] font-bold'
                          : 'bg-[#1a1a1a] border-[#2a2a2a] text-zinc-400 hover:text-white hover:border-[#444]'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                      aria-pressed={active}
                    >
                      {topic.name}
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <div className="flex items-center gap-2 text-zinc-600 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading topics…
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !usernameAvailable || username.length < 3}
          className="w-full py-3.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(255,77,0,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Profile
            </>
          )}
        </button>

        {/* My Insights link — available to every user */}
        <Link
          href="/insights"
          className="block bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-colors"
        >
          <p className="text-sm font-bold text-white">My Insights</p>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Your private dashboard — content performance, audience growth, and milestones from real activity.
          </p>
          <p className="text-[11px] font-mono text-[#ff4d00] mt-2">Open dashboard →</p>
        </Link>

        {/* Personalization settings link */}
        <Link
          href="/settings/personalization"
          className="block bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-colors"
        >
          <p className="text-sm font-bold text-white">Personalization &amp; recommendations</p>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Tune For You, pick interests, or reset what BurnBoard has learned.
          </p>
          <p className="text-[11px] font-mono text-[#ff4d00] mt-2">Open settings →</p>
        </Link>

        {/* Billing & subscriptions link */}
        <Link
          href="/settings/billing"
          className="block bg-[#111] border border-[#222] hover:border-[#ff4d00]/40 rounded-2xl p-4 transition-colors"
        >
          <p className="text-sm font-bold text-white">Billing &amp; subscriptions</p>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Manage memberships, view payment history, or cancel a subscription — clearly and without pressure.
          </p>
          <p className="text-[11px] font-mono text-[#ff4d00] mt-2">Manage billing →</p>
        </Link>

        {/* Preview */}
        <div className="bg-[#111] border border-[#222] rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">Preview</p>
          <div className="flex items-center gap-3">
            <Avatar username={username || 'user'} size="md" src={avatarUrl} />
            <div>
              <p className="text-sm font-bold text-white">@{username || 'username'}</p>
              {displayName && <p className="text-[11px] text-zinc-400">{displayName}</p>}
            </div>
          </div>
          {bio && (
            <p className="text-xs text-zinc-400 leading-relaxed">{bio}</p>
          )}
        </div>
      </div>
    </div>
  );
}
