'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Mail, Globe, Phone, Briefcase, Users } from 'lucide-react';

/**
 * PhotoMetaChips — optional photo-post metadata as secondary glass chips.
 *
 * Renders ONLY fields the user explicitly published. Empty/absent
 * fields render nothing — never empty containers, never raw identifiers.
 * Visually secondary to the photo by design (small, muted, below media).
 */

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function topicLabel(t) {
  if (typeof t === 'string') return t;
  return t?.name || String(t?.id || '');
}

function topicKey(t, i) {
  if (typeof t === 'string') return `t-${t}`;
  return `t-${t?.id || i}`;
}

export default function PhotoMetaChips({ metadata = {}, taggedUsers = [] }) {
  if (!metadata || typeof metadata !== 'object') return null;

  const { location, email, website, contact, business, topics } = metadata;
  const tags = Array.isArray(topics) ? topics.filter(Boolean).slice(0, 8) : [];
  const tagged = Array.isArray(taggedUsers) ? taggedUsers.filter((u) => u?.username).slice(0, 5) : [];

  const hasAny = location || email || website || contact?.value || business || tags.length > 0 || tagged.length > 0;
  if (!hasAny) return null;

  const host = website ? hostname(website) : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3" aria-label="Post details">
      {location && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-zinc-300 min-h-[32px]">
          <MapPin className="w-3 h-3 text-[#ff4d00] shrink-0" aria-hidden />
          <span className="truncate max-w-[200px]">{location}</span>
        </span>
      )}

      {business && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-zinc-300 min-h-[32px]">
          <Briefcase className="w-3 h-3 text-amber-400 shrink-0" aria-hidden />
          <span className="truncate max-w-[200px]">{business}</span>
        </span>
      )}

      {email && (
        <a
          href={`mailto:${email}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Email ${email}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-zinc-300 hover:border-[#ff4d00]/50 hover:text-white transition-all min-h-[32px]"
        >
          <Mail className="w-3 h-3 text-sky-400 shrink-0" aria-hidden />
          Email
        </a>
      )}

      {host && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Visit ${host}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-zinc-300 hover:border-[#ff4d00]/50 hover:text-white transition-all min-h-[32px]"
        >
          <Globe className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden />
          <span className="truncate max-w-[160px]">{host}</span>
        </a>
      )}

      {contact?.value && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-zinc-300 min-h-[32px]">
          <Phone className="w-3 h-3 text-purple-400 shrink-0" aria-hidden />
          <span className="truncate max-w-[200px]">
            {contact.label && contact.label !== 'Contact' ? `${contact.label}: ` : ''}{contact.value}
          </span>
        </span>
      )}

      {tags.map((t, i) => (
        <Link
          key={topicKey(t, i)}
          href={`/search?q=${encodeURIComponent(topicLabel(t))}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#ff4d00]/10 border border-[#ff4d00]/25 text-[11px] font-mono text-[#ff4d00] hover:bg-[#ff4d00]/20 transition-all min-h-[32px]"
        >
          #{topicLabel(t)}
        </Link>
      ))}

      {tagged.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-zinc-300 min-h-[32px]">
          <Users className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden />
          <span className="truncate max-w-[220px]">
            with{' '}
            {tagged.map((u, i) => (
              <React.Fragment key={u.id || u.username}>
                <Link
                  href={`/u/${u.username}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[#ff4d00] hover:underline"
                >
                  @{u.username}
                </Link>
                {i < tagged.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))}
          </span>
        </span>
      )}
    </div>
  );
}
