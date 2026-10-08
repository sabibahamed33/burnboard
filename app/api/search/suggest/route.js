import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@/lib/routeAuth';
import { rateLimitMiddleware, getClientIp, ipKey, RATE_LIMITS } from '@/lib/serverRateLimit';
import { hiddenAuthorIds } from '@/lib/safety';
import { sanitizeSearchQuery } from '@/lib/unicode';
import { normalizeQuery } from '@/lib/hashtags';
import { instrumentHandler } from '@/lib/metrics';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function sanitizeLike(q) {
  return sanitizeSearchQuery(q, 40).replace(/[,()"%_\\]/g, '').trim();
}

/**
 * GET /api/search/suggest?q=...
 *
 * Fast as-you-type suggestions: users, topics, communities (bounded,
 * privacy-respecting, block/mute-aware). Debounced + abortable client-side;
 * tiny bounded queries server-side — no full-content scans.
 */
async function getHandler(req) {
  try {
    const anon = getSupabase();
    if (!anon) {
      return NextResponse.json({ error: 'Service not configured' }, { status: 503 });
    }

    const ipLimit = rateLimitMiddleware(ipKey(getClientIp(req), 'search_suggest'), RATE_LIMITS.API_READ);
    if (ipLimit.blocked) {
      return NextResponse.json({ error: ipLimit.response.error }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const rawQ = searchParams.get('q') || '';
    const q = normalizeQuery(rawQ);
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, query: q, suggestions: [] });
    }
    if (q.length > 40) {
      return NextResponse.json({ error: 'Query too long' }, { status: 400 });
    }

    const { client: sessionClient, userId } = await getRequestContext(req);
    const db = sessionClient || anon;
    const safe = sanitizeLike(q);
    if (!safe) {
      return NextResponse.json({ success: true, query: q, suggestions: [] });
    }
    const like = `%${safe}%`;
    const suggestions = [];

    const [peopleResRaw, topicsRes, commRes] = await Promise.all([
      db.from('user_profiles')
        .select('id, username, display_name')
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .eq('is_banned', false)
        .limit(6),
      db.from('topics').select('id, name, slug').ilike('name', like).limit(4),
      db.from('communities').select('id, name, slug').ilike('name', like).eq('visibility', 'public').limit(4),
    ]);
    // Fail-soft banned filter (column may not exist on older snapshots).
    let peopleRes = peopleResRaw;
    if (peopleResRaw.error && /is_banned|column/i.test(peopleResRaw.error.message || '')) {
      try {
        peopleRes = await db.from('user_profiles')
          .select('id, username, display_name')
          .or(`username.ilike.${like},display_name.ilike.${like}`)
          .limit(6);
      } catch {}
    }

    let people = (peopleRes.data || []).filter((p) => p.username).slice(0, 3);
    if (userId && people.length) {
      try {
        const hidden = await hiddenAuthorIds(db, userId, people.map((p) => p.id));
        if (hidden.size) people = people.filter((p) => !hidden.has(p.id));
      } catch {}
    }
    for (const p of people) {
      suggestions.push({ type: 'user', id: p.id, label: `@${p.username}`, sub: p.display_name || null, href: `/u/${p.username}` });
    }
    for (const t of (topicsRes.data || []).slice(0, 3)) {
      suggestions.push({ type: 'topic', id: t.id, label: t.name, sub: 'Topic', href: `/search?q=${encodeURIComponent(t.name)}` });
    }
    for (const c of (commRes.data || []).slice(0, 2)) {
      suggestions.push({ type: 'community', id: c.id, label: c.name, sub: 'Community', href: `/c/${c.slug}` });
    }

    return NextResponse.json({ success: true, query: q, suggestions: suggestions.slice(0, 8) });
  } catch (err) {
    return NextResponse.json({ success: true, query: '', suggestions: [] });
  }
}

export const GET = instrumentHandler('search_suggest', getHandler);
