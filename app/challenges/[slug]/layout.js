import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * /challenges/[slug] — server layout: shareable Open Graph metadata.
 * Only active public challenges are indexed; ended/private/suspended
 * challenges return noindex (never searchable, never leaked).
 */

const SITE = 'https://burnboard.app';

function buildClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    }
  );
}

export async function generateMetadata({ params }) {
  const slug = params?.slug;
  if (!slug) return { title: 'BurnBoard' };

  try {
    const supabase = buildClient();
    const { data: challenge } = await supabase
      .from('challenges')
      .select('id, slug, title, description, challenge_type, visibility, status')
      .eq('slug', String(slug).toLowerCase())
      .maybeSingle();

    if (!challenge || challenge.visibility !== 'public') {
      return { title: 'BurnBoard', robots: { index: false, follow: false } };
    }

    const title = `${challenge.title} — BurnBoard Challenge`;
    const description = (challenge.description || `Join the ${challenge.challenge_type || ''} challenge on BurnBoard`).slice(0, 200);

    return {
      title,
      description,
      alternates: { canonical: `${SITE}/challenges/${challenge.slug}` },
      openGraph: {
        type: 'website',
        url: `${SITE}/challenges/${challenge.slug}`,
        title,
        description,
        siteName: 'BURNBOARD',
      },
      twitter: { card: 'summary', title, description },
    };
  } catch (err) {
    console.error('[Challenge Metadata] Error:', err);
    return { title: 'BurnBoard' };
  }
}

export default function ChallengeLayout({ children }) {
  return children;
}