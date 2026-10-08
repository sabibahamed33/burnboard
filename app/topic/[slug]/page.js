import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import TopicClient from './TopicClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';
const SITE = 'https://burnboard.app';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * /topic/[slug] — public topic page (real taxonomy only).
 *
 * Canonical identity is the stored slug; display uses the stored name.
 * Unknown slugs render a safe not-found state (never fabricated topics).
 * Content below comes from the same privacy-filtered search backend.
 */
export async function generateMetadata({ params }) {
  const slug = String(params?.slug || '').toLowerCase().slice(0, 120);
  const fallback = { title: 'Topic — BurnBoard' };
  if (!slug) return fallback;
  try {
    const supabase = getSupabase();
    if (!supabase) return fallback;
    const { data: topic } = await supabase
      .from('topics')
      .select('name, slug')
      .eq('slug', slug)
      .maybeSingle();
    if (!topic) {
      return { title: 'Topic Not Found — BurnBoard', robots: { index: false, follow: false } };
    }
    const title = `${topic.name} — BurnBoard Topic`;
    const description = `Explore public posts, photos, communities, Battles and Challenges about ${topic.name} on BurnBoard.`;
    return {
      title,
      description,
      alternates: { canonical: `${SITE}/topic/${topic.slug}` },
      openGraph: {
        type: 'website',
        url: `${SITE}/topic/${topic.slug}`,
        title,
        description,
        siteName: 'BURNBOARD',
      },
      twitter: { card: 'summary', title, description },
    };
  } catch {
    return fallback;
  }
}

export default async function TopicPage({ params }) {
  const slug = String(params?.slug || '').toLowerCase().slice(0, 120);
  try {
    const supabase = getSupabase();
    if (supabase && slug) {
      const { data: topic } = await supabase
        .from('topics')
        .select('id, name, slug')
        .eq('slug', slug)
        .maybeSingle();
      if (topic) return <TopicClient topic={topic} />;
    }
  } catch {}
  return notFound();
}
