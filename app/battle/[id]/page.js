import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import BattleArena from '../page';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://burnboard.app';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function isPlausibleId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && !id.includes('/');
}

/**
 * /battle/[id] — stable public deep link for a battle matchup.
 *
 * Canonical URL for every matchup; the legacy ?battle= alias canonicalizes
 * here on load (see the arena client). Metadata is public-only: battles
 * reference roast-target profiles, never private user data. Unknown ids
 * render the arena's safe "Battle unavailable" state with noindex.
 */
export async function generateMetadata({ params }) {
  const id = params?.id;
  if (!isPlausibleId(id)) {
    return { title: 'Battle Not Found — BurnBoard', robots: { index: false, follow: false } };
  }
  try {
    const supabase = getSupabase();
    if (!supabase) return { title: 'Battle Arena — BurnBoard' };
    const { data: battle } = await supabase
      .from('battles')
      .select('id, profile1_id, profile2_id')
      .eq('id', id)
      .maybeSingle();
    if (!battle) {
      return { title: 'Battle Not Found — BurnBoard', robots: { index: false, follow: false } };
    }
    const [{ data: p1 }, { data: p2 }] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', battle.profile1_id).maybeSingle(),
      supabase.from('profiles').select('username').eq('id', battle.profile2_id).maybeSingle(),
    ]);
    const name1 = p1?.username || 'Fighter 1';
    const name2 = p2?.username || 'Fighter 2';
    const title = `@${name1} vs @${name2} — Battle Arena`;
    const description = `Who got roasted harder by real humans — @${name1} or @${name2}? Vote live on BurnBoard.`;
    const ogImage =
      `${SITE}/api/og?template=battle` +
      `&username=${encodeURIComponent(name1)}&username2=${encodeURIComponent(name2)}`;
    return {
      title,
      description,
      alternates: { canonical: `${SITE}/battle/${battle.id}` },
      openGraph: {
        type: 'website',
        url: `${SITE}/battle/${battle.id}`,
        title,
        description,
        siteName: 'BURNBOARD',
        images: [{ url: ogImage, width: 1080, height: 1080, alt: title }],
      },
      twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
    };
  } catch {
    return { title: 'Battle Arena — BurnBoard' };
  }
}

export default function BattleDeepLinkPage() {
  return (
    <Suspense>
      <BattleArena />
    </Suspense>
  );
}
