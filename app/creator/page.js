import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import CreatorDashboard from '@/components/creator/CreatorDashboard';

export const metadata = {
  title: 'Creator Studio — BurnBoard',
  description: 'Your private BurnBoard creator dashboard: real analytics, audience growth, content performance, and milestones.',
  robots: { index: false, follow: false },
};

/**
 * /creator — private Creator Studio.
 *
 * Access control is enforced server-side (never a hidden frontend route):
 * signed-out visitors are redirected to /auth before any creator data loads.
 */
export default async function CreatorPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
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
          // Read-only.
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch {
    user = null;
  }

  if (!user) {
    redirect('/auth');
  }

  return <CreatorDashboard />;
}
