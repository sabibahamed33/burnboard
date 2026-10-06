import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import InviteClient from '@/components/growth/InviteClient';

export const metadata = {
  title: 'Invite & Earn — BurnBoard',
  description: 'Invite real people to BurnBoard and earn karma when your friends activate. Transparent rules, no spam, no fake rewards.',
  robots: { index: false, follow: false },
};

/**
 * /invite — Referral & Rewards hub (Master Prompt 23, Section 18).
 *
 * Signed-out visitors are redirected to /auth before any referral data loads
 * (server-side gate, never a hidden frontend route). Signed-in users see
 * their durable invite link, honest invite stats, and transparent reward
 * rules.
 */
export default async function InvitePage() {
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

  return <InviteClient />;
}