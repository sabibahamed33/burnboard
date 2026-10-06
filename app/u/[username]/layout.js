import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * /u/[username] — server layout providing shareable social metadata.
 *
 * The page itself is a client component; this layout adds the Open Graph /
 * Twitter metadata that makes profile links shareable externally (identity
 * only — bio, avatar, handle — never private content or follower data).
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
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only context.
        },
      },
    }
  );
}

export async function generateMetadata({ params }) {
  const username = params?.username;
  if (!username) return { title: 'BurnBoard' };

  try {
    const supabase = buildClient();
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, bio, avatar_url, is_banned')
      .eq('username', String(username).toLowerCase())
      .single();

    if (!profile || profile.is_banned) {
      return {
        title: 'Profile not found — BurnBoard',
        robots: { index: false, follow: false },
      };
    }

    const handle = `@${profile.username}`;
    const title = profile.display_name
      ? `${profile.display_name} (${handle}) on BurnBoard`
      : `${handle} on BurnBoard`;
    const description = (profile.bio || '').slice(0, 200)
      || `Follow ${handle} for roasts, hot takes, and unfiltered opinions on BurnBoard.`;

    const image = profile.avatar_url
      ? (profile.avatar_url.startsWith('http') ? profile.avatar_url : `${SITE}${profile.avatar_url.startsWith('/') ? '' : '/'}${profile.avatar_url}`)
      : null;

    return {
      title,
      description,
      alternates: { canonical: `${SITE}/u/${profile.username}` },
      openGraph: {
        type: 'profile',
        url: `${SITE}/u/${profile.username}`,
        title,
        description,
        siteName: 'BURNBOARD',
        images: image ? [{ url: image, width: 400, height: 400, alt: handle }] : undefined,
      },
      twitter: {
        card: image ? 'summary' : 'summary_large_image',
        title,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch (err) {
    console.error('[Profile Metadata] Error:', err);
    return { title: 'BurnBoard' };
  }
}

export default function UserProfileLayout({ children }) {
  return children;
}
