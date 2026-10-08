import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import HashtagClient from './HashtagClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';
const SITE = 'https://burnboard.app';

// Canonical tag shape (mirrors lib/hashtags normalizeTag — ASCII-safe here,
// full Unicode validated by the same rule).
const TAG_RE = /^[\p{L}\p{N}_]{2,40}$/u;

function canonTag(raw) {
  const clean = String(raw || '').replace(/^#+/, '').trim().toLowerCase();
  if (!TAG_RE.test(clean)) return null;
  return clean;
}

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * /hashtag/[tag] — public normalized hashtag page.
 *
 * #Football / #football / #FOOTBALL resolve to one canonical URL
 * (/hashtag/football). Malformed tags render not-found (never fabricated
 * pages). Activity counts come from real public rows only (RLS-filtered).
 */
export async function generateMetadata({ params }) {
  const tag = canonTag(params?.tag);
  const fallback = { title: 'Hashtag — BurnBoard' };
  if (!tag) {
    return { title: 'Hashtag Not Found — BurnBoard', robots: { index: false, follow: false } };
  }
  let count = null;
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { count: c } = await supabase
        .from('social_posts')
        .select('id', { count: 'exact', head: true })
        .ilike('content_text', `%#${tag}%`)
        .eq('moderation_state', 'visible')
        .eq('visibility', 'public');
      count = c;
    }
  } catch {}
  const title = `#${tag} — BurnBoard`;
  const description =
    count !== null && count > 0
      ? `Explore ${count} public ${count === 1 ? 'post' : 'posts'} tagged #${tag} on BurnBoard.`
      : `Explore public posts tagged #${tag} on BurnBoard.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/hashtag/${tag}` },
    openGraph: {
      type: 'website',
      url: `${SITE}/hashtag/${tag}`,
      title,
      description,
      siteName: 'BURNBOARD',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function HashtagPage({ params }) {
  const tag = canonTag(params?.tag);
  if (!tag) return notFound();
  return <HashtagClient tag={tag} />;
}
