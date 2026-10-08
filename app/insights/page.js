import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import CreatorDashboard from '@/components/creator/CreatorDashboard';

export const metadata = {
  title: 'My Insights — BurnBoard',
  description: 'Your private BurnBoard insights: real reach, audience growth, content performance, and milestones. Available to every user.',
  robots: { index: false, follow: false },
};

/**
 * /insights — canonical My Insights route (universal user feature).
 *
 * Every BurnBoard account is simply a USER — there is no separate Creator
 * identity. This private dashboard is available to any signed-in user.
 * /creator renders the same dashboard for backwards compatibility.
 */
export default async function InsightsPage() {
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
