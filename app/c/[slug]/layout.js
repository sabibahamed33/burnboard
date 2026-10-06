import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * /c/[slug] — server layout: shareable Open Graph metadata.
 * Only public, active communities get indexed metadata; private or suspended
 * communities return noindex so they can never leak through search.
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
    const { data: community } = await supabase
      .from('communities')
      .select('id, name, slug, description, visibility, status')
      .eq('slug', String(slug).toLowerCase())
      .maybeSingle();

    // Private/suspended communities are never indexable (and RLS keeps
    // private communities from being read at all by anonymous visitors).
    if (!community || community.status !== 'active' || community.visibility !== 'public') {
      return { title: 'BurnBoard', robots: { index: false, follow: false } };
    }

    const title = `${community.name} — BurnBoard Community`;
    const description = (community.description || `Join ${community.name} on BurnBoard`).slice(0, 200);

    return {
      title,
      description,
      alternates: { canonical: `${SITE}/c/${community.slug}` },
      openGraph: {
        type: 'website',
        url: `${SITE}/c/${community.slug}`,
        title,
        description,
        siteName: 'BURNBOARD',
      },
      twitter: { card: 'summary', title, description },
    };
  } catch (err) {
    console.error('[Community Metadata] Error:', err);
    return { title: 'BurnBoard' };
  }
}

export default function CommunityLayout({ children }) {
  return children;
}