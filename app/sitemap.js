// Dynamic Sitemap Generator for BURNBOARD (Master Prompt 14)
// Indexes ONLY genuinely public, non-removed resources. RLS on the anon
// client already filters removed/under-review content and private posts, so
// this list can never include content search engines shouldn't see.
// No fake URLs, no thin auto-generated pages — each resource is real.

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export const revalidate = 3600; // Cache for an hour (public pages stay cheap).

export default async function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://burnboard.app';

  const staticRoutes = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'always', priority: 1.0 },
    { url: `${baseUrl}/home`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1.0 },
    { url: `${baseUrl}/top`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/battle`, lastModified: new Date(), changeFrequency: 'always', priority: 0.9 },
    { url: `${baseUrl}/roast/linkedin`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.85 },
    { url: `${baseUrl}/roast/github`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.85 },
    { url: `${baseUrl}/roast/x`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.85 },
    { url: `${baseUrl}/roast/instagram`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
    { url: `${baseUrl}/roast/tiktok`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
    { url: `${baseUrl}/hot-seat`, lastModified: new Date(), changeFrequency: 'always', priority: 0.85 },
    { url: `${baseUrl}/c`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/challenges`, lastModified: new Date(), changeFrequency: 'always', priority: 0.85 },
    { url: `${baseUrl}/discover`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  if (!isSupabaseConfigured || !supabase) {
    return staticRoutes;
  }

  const all = [...staticRoutes];

  // Public user profiles (RLS excludes banned users).
  try {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('username, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const p of profiles || []) {
      all.push({ url: `${baseUrl}/u/${p.username}`, lastModified: new Date(p.created_at || Date.now()), changeFrequency: 'weekly', priority: 0.7 });
    }
  } catch (err) { console.warn('[Sitemap] profiles:', err); }

  // Modern public posts — RLS enforces visibility + moderation_state.
  try {
    const { data: posts } = await supabase
      .from('social_posts')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const p of posts || []) {
      all.push({ url: `${baseUrl}/post/${p.id}`, lastModified: new Date(p.created_at || Date.now()), changeFrequency: 'daily', priority: 0.7 });
    }
  } catch (err) { console.warn('[Sitemap] posts:', err); }

  // Public roasts (target roast cards) — hidden ones are excluded.
  try {
    const { data: roasts } = await supabase
      .from('roasts')
      .select('id, created_at')
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(1000);
    for (const r of roasts || []) {
      all.push({ url: `${baseUrl}/r/${r.id}`, lastModified: new Date(r.created_at || Date.now()), changeFrequency: 'weekly', priority: 0.6 });
    }
  } catch (err) { console.warn('[Sitemap] roasts:', err); }

  // Legacy roast targets (hot seats) — only active ones.
  try {
    const { data: hotSeats } = await supabase
      .from('hot_seats')
      .select('id, created_at')
      .eq('status', 'active')
      .eq('moderation_state', 'visible')
      .order('created_at', { ascending: false })
      .limit(500);
    for (const hs of hotSeats || []) {
      all.push({ url: `${baseUrl}/hot-seat/${hs.id}`, lastModified: new Date(hs.created_at || Date.now()), changeFrequency: 'daily', priority: 0.7 });
    }
  } catch (err) { console.warn('[Sitemap] hot seats:', err); }

  // Public communities (RLS + explicit filters keep private/suspended out).
  try {
    const { data: communities } = await supabase
      .from('communities')
      .select('slug, created_at')
      .eq('status', 'active')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const c of communities || []) {
      all.push({ url: `${baseUrl}/c/${c.slug}`, lastModified: new Date(c.created_at || Date.now()), changeFrequency: 'daily', priority: 0.75 });
    }
  } catch (err) { console.warn('[Sitemap] communities:', err); }

  // Public challenges that are actually open.
  try {
    const { data: challenges } = await supabase
      .from('challenges')
      .select('slug, created_at')
      .eq('status', 'active')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(2000);
    for (const ch of challenges || []) {
      all.push({ url: `${baseUrl}/challenges/${ch.slug}`, lastModified: new Date(ch.created_at || Date.now()), changeFrequency: 'daily', priority: 0.75 });
    }
  } catch (err) { console.warn('[Sitemap] challenges:', err); }

  return all;
}