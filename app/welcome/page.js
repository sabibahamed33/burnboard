import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { safeInternalPath } from '@/lib/growth/referral';
import WelcomeFlow from './WelcomeFlow';

export const metadata = {
  title: 'Welcome to BurnBoard',
  description: 'Set up your BurnBoard profile in under a minute — or skip and explore right away.',
  robots: { index: false, follow: false },
};

/**
 * /welcome — short, skippable first-time setup.
 *
 * Reached once, right after signup (login goes straight to the destination —
 * returning users are never forced through here). The incoming ?next=
 * destination is server-validated and preserved through to the end.
 * Signed-out visitors bounce to /auth with the welcome path remembered.
 */
export default async function WelcomePage({ searchParams }) {
  const rawNext = typeof searchParams?.next === 'string' ? searchParams.next : null;
  const next = safeInternalPath(rawNext) || '/';
  const here =
    '/welcome' + (next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '');

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

  // Routing guard only: getSession() reads the session from cookies
  // locally (no network round-trip), so a slow auth backend can never wedge
  // this gate. A timeout races fail-closed to /auth, which re-checks
  // client-side and returns here when a session exists (no loop: /auth with
  // a session goes to ?next=, without one it stays put).
  let session = null;
  try {
    const sessionPromise = supabase.auth.getSession().then(
      ({ data }) => data?.session || null,
      () => null
    );
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 8000));
    session = await Promise.race([sessionPromise, timeout]);
  } catch {
    session = null;
  }

  if (!session) {
    redirect(`/auth?next=${encodeURIComponent(here)}`);
  }

  return <WelcomeFlow next={next} here={here} />;
}
