'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera, X, MapPin, Mail, Globe, Phone, Briefcase, Users, Eye,
  CalendarClock, Save, Flame, ChevronDown, Check, Loader2,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { t } from '@/lib/lang';
import { useDebouncedValue } from '@/lib/motion';
import Avatar from '@/components/ui/Avatar';
import BottomSheet from '@/components/ui/BottomSheet';
import { publishNotices } from '@/lib/photoPosts';

/**
 * PhotoComposer — rich photo posts with optional metadata + privacy.
 *
 * Publishing boundary: selecting a photo NEVER creates a post. Only an
 * explicit Publish / Save Draft / Schedule tap uploads (EXIF-stripped,
 * resized) and creates the record. Nothing is auto-filled from the
 * account — location, email, website and contact stay empty unless the
 * user types them, and every sensitive field carries a visibility
 * notice with one-tap removal before publishing.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DIM = 1600;

const VISIBILITY_OPTIONS = [
  { key: 'public', label: 'Public', desc: 'Anyone on BurnBoard can see it', icon: Globe },
  { key: 'followers', label: 'Followers', desc: 'Only people who follow you', icon: Users },
  { key: 'only_me', label: 'Only me', desc: 'Private — just for you', icon: Eye },
];

/** Downscale + JPEG re-encode: strips EXIF/GPS and keeps uploads light. */
function processImage(file) {
  return new Promise((resolve, reject) => {
    // Data-saver / low-memory devices get a lighter encode (still sharp on
    // phone screens). Respects the OS data-saving signal where available.
    let quality = 0.85;
    let maxDim = MAX_DIM;
    try {
      if (navigator?.connection?.saveData) {
        quality = 0.7;
        maxDim = 1200;
      }
    } catch {}
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error('Could not process that image.'));
              return;
            }
            resolve({ blob, previewUrl: URL.createObjectURL(blob), width: w, height: h });
          },
          'image/jpeg',
          quality
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function SectionLabel({ children, hint }) {
  return (
    <p className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
      {children} {hint && <span className="text-zinc-600 normal-case font-mono">({hint})</span>}
    </p>
  );
}

function Toggle({ on, onChange, label, desc }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="w-full flex items-center gap-3 py-2.5 text-left min-h-[48px]"
    >
      <span
        aria-hidden
        className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-[#ff4d00]' : 'bg-[#2a2a2a]'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-zinc-200">{label}</span>
        {desc && <span className="block text-[10px] font-mono text-zinc-500">{desc}</span>}
      </span>
    </button>
  );
}

export default function PhotoComposer({
  communityId = 'public',
  challengeCtx = null,
  onPublished,
  onBack,
  // Edit mode: initialPost is a social_posts row (or feed item with
  // metadata). Submits PATCH instead of POST; photo optional (keeps the
  // existing image unless replaced). onSaved receives the updated row.
  initialPost = null,
  onSaved = null,
}) {
  const editing = !!initialPost;
  const [userId, setUserId] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState(initialPost?.media_url || initialPost?.mediaUrl || null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [fileError, setFileError] = useState('');
  const [processing, setProcessing] = useState(false);
  // Snapshot of initially-published scalar fields to detect removals
  // (cleared fields are sent as explicit nulls so the server deletes them).
  const initialMetaRef = useRef(initialPost?.metadata || {});

  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [contactLabel, setContactLabel] = useState('');
  const [contactValue, setContactValue] = useState('');
  const [business, setBusiness] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [topicCatalog, setTopicCatalog] = useState([]);
  const [topics, setTopics] = useState([]);

  const [tagQuery, setTagQuery] = useState('');
  const debouncedTagQuery = useDebouncedValue(tagQuery, 300);
  const [tagResults, setTagResults] = useState([]);
  const [tagged, setTagged] = useState([]);

  const [visibility, setVisibility] = useState('public');
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [perms, setPerms] = useState({ comments: true, reactions: true, sharing: true, saving: true });
  const [permsOpen, setPermsOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const [stage, setStage] = useState('edit'); // edit | preview
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState(null); // publish | draft | schedule
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // Local draft backup: leaving mid-compose never silently publishes and
  // never loses typed metadata (the photo file itself can't persist, so
  // re-attach it on return). Cleared on successful submit. Edit mode
  // prefills from the published post instead — never from the draft.
  const PHOTO_DRAFT_KEY = 'burnboard_photo_draft';
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    if (editing && initialPost) {
      const m = initialPost.metadata || {};
      setCaption(initialPost.content_text || initialPost.text || '');
      if (m.location) setLocation(m.location);
      if (m.email) setEmail(m.email);
      if (m.website) setWebsite(m.website);
      if (m.contact?.value) {
        setContactLabel(m.contact.label === 'Contact' ? '' : m.contact.label || '');
        setContactValue(m.contact.value);
      }
      if (m.business) setBusiness(m.business);
      if (Array.isArray(m.topics)) {
        setTopics(m.topics.map((t) => (typeof t === 'string' ? { id: t, name: t } : t)).slice(0, 8));
      }
      if (Array.isArray(initialPost.taggedUsers)) {
        setTagged(initialPost.taggedUsers.map((u) => ({ id: u.id, username: u.username })).slice(0, 10));
      }
      if (['public', 'followers', 'only_me'].includes(initialPost.visibility)) {
        setVisibility(initialPost.visibility);
      }
      if (m.permissions) {
        setPerms({
          comments: m.permissions.comments !== 'off',
          reactions: m.permissions.reactions !== 'off',
          sharing: m.permissions.sharing !== 'off',
          saving: m.permissions.saving !== 'off',
        });
      }
      if (m.scheduled_at) {
        try {
          setScheduledAt(new Date(m.scheduled_at).toISOString().slice(0, 16));
        } catch {}
      }
      return;
    }
    try {
      const raw = localStorage.getItem(PHOTO_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d.caption === 'string') setCaption(d.caption);
      if (typeof d.location === 'string') setLocation(d.location);
      if (typeof d.email === 'string') setEmail(d.email);
      if (typeof d.website === 'string') setWebsite(d.website);
      if (typeof d.contactLabel === 'string') setContactLabel(d.contactLabel);
      if (typeof d.contactValue === 'string') setContactValue(d.contactValue);
      if (typeof d.business === 'string') setBusiness(d.business);
      if (Array.isArray(d.topics)) setTopics(d.topics.slice(0, 8));
      if (Array.isArray(d.tagged)) setTagged(d.tagged.slice(0, 10));
      if (typeof d.visibility === 'string' && ['public', 'followers', 'only_me'].includes(d.visibility)) {
        setVisibility(d.visibility);
      }
      if (d.perms && typeof d.perms === 'object') {
        setPerms((p) => ({
          comments: d.perms.comments !== false,
          reactions: d.perms.reactions !== false,
          sharing: d.perms.sharing !== false,
          saving: d.perms.saving !== false,
        }));
      }
      if (typeof d.scheduledAt === 'string') setScheduledAt(d.scheduledAt);
    } catch {}
  }, []);
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    try {
      localStorage.setItem(PHOTO_DRAFT_KEY, JSON.stringify({
        caption, location, email, website, contactLabel, contactValue,
        business, topics, tagged, visibility, perms, scheduledAt,
      }));
    } catch {}
  }, [caption, location, email, website, contactLabel, contactValue, business, topics, tagged, visibility, perms, scheduledAt]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null)).catch(() => {});
  }, []);

  // Topic catalog (shared taxonomy — real rows only).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/communities/topics')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.topics)) setTopicCatalog(data.topics.slice(0, 24));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // People tagging search (excludes self).
  useEffect(() => {
    const q = debouncedTagQuery.trim();
    if (q.length < 2) {
      setTagResults([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/search?scope=people&q=${encodeURIComponent(q)}&limit=6`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = (data?.people || []).filter((p) => p.id !== userId && !tagged.some((t) => t.id === p.id));
        setTagResults(rows.slice(0, 6));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedTagQuery, userId, tagged]);

  const pickFile = useCallback(async (f) => {
    setFileError('');
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setFileError('Please choose an image file.');
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError('Images must be under 10MB.');
      return;
    }
    setProcessing(true);
    try {
      const { blob, previewUrl: url } = await processImage(f);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      setPreviewUrl(url);
    } catch {
      setFileError('Could not process that image. Try another one.');
    } finally {
      setProcessing(false);
    }
  }, [previewUrl]);

  const photoMeta = {
    ...(location.trim() ? { location: location.trim() } : {}),
    ...(email.trim() ? { email: email.trim() } : {}),
    ...(website.trim() ? { website: website.trim() } : {}),
    ...(contactValue.trim() ? { contact_label: contactLabel.trim() || 'Contact', contact_value: contactValue.trim() } : {}),
    ...(business.trim() ? { business: business.trim() } : {}),
    ...(topics.length ? { topics } : {}),
    ...(tagged.length ? { tagged_user_ids: tagged.map((t) => t.id) } : {}),
    permissions: {
      comments: perms.comments ? 'on' : 'off',
      reactions: perms.reactions ? 'on' : 'off',
      sharing: perms.sharing ? 'on' : 'off',
      saving: perms.saving ? 'on' : 'off',
    },
  };

  const notices = publishNotices({ visibility, meta: photoMeta });
  const scheduled = !!scheduledAt;
  const primaryLabel = scheduled ? 'Schedule Post' : 'Publish Photo';

  const editSubmit = useCallback(async () => {
    if (!initialPost?.id) return;
    if (!caption.trim() && !file && !existingMediaUrl) {
      setError('Add a caption or keep the photo.');
      return;
    }
    setSubmitting(true);
    setSubmitMode('publish');
    setError('');
    try {
      const body = { text: caption.trim() };
      // Replacement photo uploads only on explicit save.
      if (file) {
        const path = `${userId}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('post-media').upload(path, file, {
          contentType: 'image/jpeg',
          upsert: false,
        });
        if (uploadError) throw new Error('Photo upload failed. Please try again.');
        const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(path);
        if (!urlData?.publicUrl) throw new Error('Photo upload failed. Please try again.');
        body.media_url = urlData.publicUrl;
      } else if (removePhoto) {
        body.media_url = null;
      }

      // Explicit nulls remove previously published scalar fields.
      const init = initialMetaRef.current || {};
      const photo_meta = {};
      const scalar = (key, value) => {
        const v = String(value || '').trim();
        if (v) photo_meta[key] = key === 'website' ? value.trim() : v;
        else if (init[key]) photo_meta[key] = null;
      };
      scalar('location', location);
      scalar('email', email);
      scalar('website', website);
      scalar('business', business);
      if (contactValue.trim()) {
        photo_meta.contact_label = contactLabel.trim() || 'Contact';
        photo_meta.contact_value = contactValue.trim();
      } else if (init.contact) {
        photo_meta.contact_value = null;
      }
      // Lists replace wholesale (empty clears).
      photo_meta.topics = topics.map((t) => ({ id: String(t.id ?? t), name: t.name || String(t.id ?? t) }));
      photo_meta.tagged_user_ids = tagged.map((t) => t.id);
      if (scheduledAt) photo_meta.scheduled_at = new Date(scheduledAt).toISOString();
      else if (init.scheduled_at) photo_meta.scheduled_at = null;
      body.photo_meta = photo_meta;
      body.visibility = visibility;

      const res = await fetch(`/api/content/${initialPost.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save changes.');
      onSaved?.(data.post);
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
      setSubmitMode(null);
    }
  }, [initialPost, caption, file, existingMediaUrl, removePhoto, userId, location, email, website, business, contactLabel, contactValue, topics, tagged, scheduledAt, visibility, onSaved]);

  const submit = useCallback(async (mode) => {
    // mode: 'publish' | 'draft'
    if (editing) {
      await editSubmit();
      return;
    }
    if (!file) {
      setError('Choose a photo first.');
      return;
    }
    if (!userId) {
      setError('Sign in to share photos.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator && 'onLine' in navigator && !navigator.onLine) {
      // Offline: keep everything (file stays in memory, meta in the draft).
      // Never claim an upload happened.
      setError(t('create_offline_photo'));
      return;
    }
    setSubmitting(true);
    setSubmitMode(mode);
    setError('');
    // Tracks the uploaded object so a failed publish can clean up after
    // itself instead of orphaning media (best-effort).
    let uploadedPath = null;
    try {
      // Upload happens ONLY on explicit action — never on file select.
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('post-media').upload(path, file, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (uploadError) throw new Error('Photo upload failed. Please try again.');
      uploadedPath = path;
      const { data: urlData } = supabase.storage.from('post-media').getPublicUrl(path);
      const mediaUrl = urlData?.publicUrl;
      if (!mediaUrl) throw new Error('Photo upload failed. Please try again.');

      const payload = {
        content_type: 'photo',
        text: caption.trim(),
        media_url: mediaUrl,
        visibility,
        photo_meta: photoMeta,
      };
      if (communityId && communityId !== 'public') payload.community_id = communityId;
      if (challengeCtx) payload.challenge_id = challengeCtx.id;
      if (mode === 'draft') {
        payload.is_draft = true;
      } else if (scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString();
        payload.target_visibility = visibility;
      }

      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create post.');
      try {
        localStorage.removeItem(PHOTO_DRAFT_KEY);
      } catch {}
      onPublished?.(data.post);
    } catch (e) {
      // Publish failed after upload: remove the orphaned object so a retry
      // starts clean. The composer state (file + details) is preserved.
      if (uploadedPath) {
        try {
          await supabase.storage.from('post-media').remove([uploadedPath]);
        } catch {}
      }
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
      setSubmitMode(null);
    }
  }, [file, userId, caption, visibility, photoMeta, communityId, challengeCtx, scheduledAt, onPublished]);

  const toggleTopic = (t) => {
    const id = String(t.id ?? t);
    setTopics((prev) => {
      const has = prev.some((x) => String(x.id ?? x) === id);
      if (has) return prev.filter((x) => String(x.id ?? x) !== id);
      if (prev.length >= 8) return prev;
      return [...prev, { id, name: t.name || id }];
    });
  };

  if (!userId) {
    return (
      <div className="bg-[#111] border border-dashed border-[#333] rounded-xl p-8 text-center space-y-3">
        <Camera className="w-8 h-8 text-zinc-500 mx-auto" />
        <p className="text-xs text-zinc-300 font-bold">Sign in to share photos</p>
        <p className="text-[11px] text-zinc-500">Photo posts need an account so you own what you publish.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 font-mono flex items-center gap-2" role="alert">
          <X className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Photo picker */}
      {!previewUrl && !(editing && existingMediaUrl && !removePhoto) ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          className="w-full bg-[#111] border border-dashed border-[#333] hover:border-[#ff4d00]/50 rounded-xl p-8 text-center space-y-3 transition-all min-h-[180px] disabled:opacity-60"
        >
          {processing ? (
            <Loader2 className="w-8 h-8 text-[#ff4d00] mx-auto animate-spin" />
          ) : (
            <Camera className="w-8 h-8 text-zinc-500 mx-auto" />
          )}
          <p className="text-xs text-zinc-300 font-bold">{processing ? 'Processing…' : editing ? 'Tap to replace the photo' : 'Tap to choose a photo'}</p>
          <p className="text-[10px] font-mono text-zinc-500">JPG/PNG · under 10MB · device details are stripped automatically</p>
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-[#222]">
          <img
            src={previewUrl || existingMediaUrl}
            alt={previewUrl ? 'Photo preview' : 'Current photo'}
            className="w-full max-h-96 object-cover"
          />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Replace photo"
              className="p-2 rounded-xl bg-black/70 border border-white/10 text-white hover:text-[#ff4d00] transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setFile(null);
                } else {
                  setRemovePhoto(true);
                  setExistingMediaUrl(null);
                }
              }}
              aria-label="Remove photo"
              className="p-2 rounded-xl bg-black/70 border border-white/10 text-white hover:text-red-400 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a photo"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />
      {fileError && <p className="text-[11px] font-mono text-red-400">{fileError}</p>}

      {/* Caption */}
      <div>
        <SectionLabel hint="optional">Caption</SectionLabel>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption... (hashtags welcome: #gaming)"
          rows={3}
          maxLength={500}
          className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] resize-none transition-all"
        />
      </div>

      {/* Optional details */}
      <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
          className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
        >
          <span className="text-xs font-bold text-white">Details <span className="text-zinc-500 font-mono font-normal">— location, contact, business</span></span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
        </button>
        {detailsOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-[#222] pt-3">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300 mb-1">
                <MapPin className="w-3.5 h-3.5 text-[#ff4d00]" /> Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Venice Beach Boardwalk"
                maxLength={120}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
              />
              <p className="text-[10px] font-mono text-zinc-500 mt-1">Only what you type here is shared — never your device location.</p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300 mb-1">
                <Mail className="w-3.5 h-3.5 text-sky-400" /> Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                inputMode="email"
                maxLength={160}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
              />
              <p className="text-[10px] font-mono text-zinc-500 mt-1">Your account email is never attached — only this field, if you fill it.</p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300 mb-1">
                <Globe className="w-3.5 h-3.5 text-emerald-400" /> Website
              </label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="your-site.com"
                inputMode="url"
                maxLength={300}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300 mb-1">
                  <Phone className="w-3.5 h-3.5 text-purple-400" /> Contact
                </label>
                <input
                  value={contactLabel}
                  onChange={(e) => setContactLabel(e.target.value)}
                  placeholder="Label (e.g. Studio)"
                  maxLength={60}
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
                />
              </div>
              <div className="pt-0 sm:pt-[22px]">
                <input
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  placeholder="Number or handle"
                  maxLength={160}
                  aria-label="Contact value"
                  className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300 mb-1">
                <Briefcase className="w-3.5 h-3.5 text-amber-400" /> Business / brand
              </label>
              <input
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                placeholder="e.g. Sunset Roast Co."
                maxLength={120}
                className="w-full bg-[#0a0a0a] border border-[#222] rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Topics */}
      {topicCatalog.length > 0 && (
        <div>
          <SectionLabel hint="optional, up to 8">Topics</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {topicCatalog.map((t) => {
              const id = String(t.id ?? t);
              const active = topics.some((x) => String(x.id ?? x) === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleTopic(t)}
                  aria-pressed={active}
                  className={`px-3 py-2 rounded-xl text-[11px] font-mono transition-all min-h-[40px] ${
                    active
                      ? 'bg-[#ff4d00]/15 border border-[#ff4d00]/50 text-[#ff4d00]'
                      : 'bg-[#111] border border-[#222] text-zinc-400 hover:text-white hover:border-[#333]'
                  }`}
                >
                  {t.name || id}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tag people */}
      <div>
        <SectionLabel hint="optional, up to 10">Tag people</SectionLabel>
        {tagged.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {tagged.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-[#111] border border-[#333] text-xs text-white">
                <Avatar username={t.username} size="xs" />
                @{t.username}
                <button
                  type="button"
                  onClick={() => setTagged((prev) => prev.filter((x) => x.id !== t.id))}
                  aria-label={`Remove ${t.username}`}
                  className="p-1 text-zinc-500 hover:text-red-400 min-h-[28px] min-w-[28px] flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Search people to tag..."
          aria-label="Search people to tag"
          className="w-full bg-[#111] border border-[#222] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
        />
        {tagResults.length > 0 && (
          <div className="mt-1 bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden">
            {tagResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setTagged((prev) => (prev.length >= 10 ? prev : [...prev, p]));
                  setTagQuery('');
                  setTagResults([]);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#222] transition-colors text-left min-h-[48px]"
              >
                <Avatar username={p.username} size="sm" />
                <span className="text-xs font-bold text-white">@{p.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Visibility */}
      <div>
        <SectionLabel>Who can see this?</SectionLabel>
        <div className="relative">
          <button
            type="button"
            onClick={() => setVisibilityOpen(!visibilityOpen)}
            aria-haspopup="listbox"
            aria-expanded={visibilityOpen}
            className="w-full flex items-center gap-3 bg-[#111] border border-[#222] rounded-xl px-4 py-3 text-sm text-white hover:border-[#ff4d00]/50 transition-all min-h-[48px]"
          >
            {(() => {
              const opt = [...VISIBILITY_OPTIONS, { key: 'draft', label: 'Unpublish (draft)', desc: 'Hidden until published', icon: Eye }].find((o) => o.key === visibility)
                || VISIBILITY_OPTIONS[0];
              const Icon = opt.icon;
              return (
                <>
                  <Icon className="w-4 h-4 text-[#ff4d00] shrink-0" aria-hidden />
                  <span className="font-bold">{opt.label}</span>
                  <span className="text-[10px] font-mono text-zinc-500">{opt.desc}</span>
                </>
              );
            })()}
            <ChevronDown className={`w-4 h-4 text-zinc-500 ml-auto transition-transform ${visibilityOpen ? 'rotate-180' : ''}`} />
          </button>
          {visibilityOpen && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl overflow-hidden" role="listbox">
              {[
                ...VISIBILITY_OPTIONS,
                ...(editing ? [{ key: 'draft', label: 'Unpublish (draft)', desc: 'Hide it until you publish again', icon: Eye }] : []),
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="option"
                    aria-selected={visibility === opt.key}
                    onClick={() => {
                      setVisibility(opt.key);
                      setVisibilityOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors min-h-[52px] ${visibility === opt.key ? 'bg-[#ff4d00]/10' : 'hover:bg-[#222]'}`}
                  >
                    <Icon className="w-4 h-4 text-[#ff4d00] shrink-0" aria-hidden />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-white">{opt.label}</span>
                      <span className="block text-[10px] font-mono text-zinc-500">{opt.desc}</span>
                    </span>
                    {visibility === opt.key && <Check className="w-4 h-4 text-[#ff4d00]" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Permissions */}
      <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setPermsOpen(!permsOpen)}
          aria-expanded={permsOpen}
          className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
        >
          <span className="text-xs font-bold text-white">Interaction controls</span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${permsOpen ? 'rotate-180' : ''}`} />
        </button>
        {permsOpen && (
          <div className="px-4 pb-3 border-t border-[#222] divide-y divide-[#1c1c1c]">
            <Toggle on={perms.comments} onChange={(v) => setPerms((p) => ({ ...p, comments: v }))} label="Comments" desc="Let people join the conversation" />
            <Toggle on={perms.reactions} onChange={(v) => setPerms((p) => ({ ...p, reactions: v }))} label="Reactions" desc="Let people react to this photo" />
            <Toggle on={perms.sharing} onChange={(v) => setPerms((p) => ({ ...p, sharing: v }))} label="Sharing" desc="Show the share button" />
            <Toggle on={perms.saving} onChange={(v) => setPerms((p) => ({ ...p, saving: v }))} label="Saving" desc="Let people save this photo" />
          </div>
        )}
      </div>

      {/* Schedule */}
      <div>
        <SectionLabel hint="optional">Schedule for later</SectionLabel>
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden />
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            aria-label="Schedule publish time"
            className="flex-1 bg-[#111] border border-[#222] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff4d00] min-h-[44px]"
          />
          {scheduledAt && (
            <button type="button" onClick={() => setScheduledAt('')} aria-label="Clear schedule" className="p-2 text-zinc-500 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Privacy notices — exactly what becomes visible */}
      {notices.length > 0 && (
        <div className="bg-[#ff4d00]/5 border border-[#ff4d00]/25 rounded-xl p-3 space-y-1" role="note" aria-label="What will be visible">
          <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#ff4d00]">Visible on this post</p>
          {notices.map((n) => (
            <p key={n} className="text-[11px] text-zinc-300">• {n}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={() => setStage('preview')}
            disabled={(!file && !(editing && existingMediaUrl && !removePhoto)) || submitting}
          className="w-full py-3 rounded-xl bg-[#111] border border-[#333] text-zinc-200 font-bold text-xs uppercase tracking-wider hover:border-[#ff4d00]/50 transition-all disabled:opacity-40 min-h-[48px]"
        >
          <span className="inline-flex items-center gap-2">
            <Eye className="w-4 h-4" /> Preview
          </span>
        </button>
        <div className="flex gap-2">
          {!challengeCtx && !editing && (
            <button
              type="button"
              onClick={() => submit('draft')}
              disabled={!file || submitting}
              className="flex-1 py-3 rounded-xl bg-[#1a1a1a] border border-[#333] text-zinc-200 font-bold text-xs uppercase tracking-wider hover:border-zinc-500 transition-all disabled:opacity-40 min-h-[48px]"
            >
              <span className="inline-flex items-center gap-2">
                {submitting && submitMode === 'draft' ? <span className="spinner w-4 h-4" aria-hidden /> : <Save className="w-4 h-4" />}
                Save Draft
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => submit('publish')}
            disabled={(!file && !(editing && existingMediaUrl && !removePhoto)) || submitting}
            aria-busy={submitting}
            className="btn-burn tactile flex-[2] py-3 rounded-xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px]"
          >
            {submitting && submitMode === 'publish' ? (
              <span className="spinner w-4 h-4" aria-hidden />
            ) : (
              <>
                <Flame className="w-4 h-4 fill-black" />
                {editing ? 'Save Changes' : primaryLabel}
              </>
            )}
          </button>
        </div>
        <button type="button" onClick={onBack} className="w-full py-2 text-[11px] font-mono text-zinc-500 hover:text-white transition-colors min-h-[40px]">
          ← Back to types
        </button>
      </div>

      {/* Preview sheet */}
      <BottomSheet open={stage === 'preview'} onClose={() => setStage('edit')} title="Preview">
        <div className="space-y-3">
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-[#222]">
              <img src={previewUrl} alt="Post preview" className="w-full max-h-80 object-cover" />
            </div>
          )}
          {caption.trim() && <p className="text-sm text-zinc-100 leading-relaxed">{caption.trim()}</p>}
          {photoMeta.location && <p className="text-[11px] font-mono text-zinc-400">📍 {photoMeta.location}</p>}
          {photoMeta.email && <p className="text-[11px] font-mono text-zinc-400">✉️ {photoMeta.email} <span className="text-zinc-600">(visible to viewers)</span></p>}
          {photoMeta.website && <p className="text-[11px] font-mono text-zinc-400">🔗 {photoMeta.website}</p>}
          {photoMeta.business && <p className="text-[11px] font-mono text-zinc-400">🏢 {photoMeta.business}</p>}
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span key={String(t.id ?? t)} className="px-2 py-1 rounded-full bg-[#ff4d00]/10 border border-[#ff4d00]/25 text-[10px] font-mono text-[#ff4d00]">
                  #{t.name || t.id}
                </span>
              ))}
            </div>
          )}
          {tagged.length > 0 && (
            <p className="text-[11px] font-mono text-zinc-400">with {tagged.map((t) => `@${t.username}`).join(', ')}</p>
          )}
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 border-t border-[#222] pt-3">
            <span className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#333] uppercase">{scheduled ? 'Scheduled' : visibility.replace('_', ' ')}</span>
            {!perms.comments && <span className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#333]">comments off</span>}
            {!perms.reactions && <span className="px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#333]">reactions off</span>}
          </div>
          {notices.length > 0 && (
            <div className="space-y-1">
              {notices.map((n) => (
                <p key={n} className="text-[11px] text-zinc-400">• {n}</p>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setStage('edit');
              submit('publish');
            }}
            disabled={(!file && !(editing && existingMediaUrl && !removePhoto)) || submitting}
            className="btn-burn tactile w-full py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-40 min-h-[48px]"
          >
            {editing ? 'Confirm Save' : scheduled ? 'Confirm Schedule' : 'Confirm Publish'}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
