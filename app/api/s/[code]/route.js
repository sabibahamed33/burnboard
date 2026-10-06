import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * /s/[code] — referral landing (durable, opaque-code invite links).
 *
 * Served at the public URL /s/[code] via a middleware rewrite (middleware.ts)
 * so shared invite links never 404 and attribution needs no client JS.
 *
 * GET records a REAL visit (rate-capped server-side), sets a first-party
 * attribution cookie (opaque token), and serves a lightweight branded page —
 * content-first, signup-optional: the visitor can browse the feed or join.
 *
 * No open redirects: the only links on this page are internal.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://burnboard.app';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export async function GET(request, { params }) {
  const code = String(params?.code || '').toLowerCase();

  // Validate before any DB work or cookie write (also blocks token guessing
  // attempts from ever reaching the referrer lookup).
  if (!/^[a-z0-9]{6,12}$/.test(code)) {
    return NextResponse.redirect(`${SITE}/`, 302);
  }

  const supabase = getSupabase();
  let referrerUsername = null;
  let tracked = false;
  let token = null;

  if (supabase) {
    try {
      // Real visit token (RFC-validated & rate-capped inside the function).
      const { data: visitToken, error } = await supabase.rpc('record_referral_visit', {
        p_code: code,
      });
      if (!error && visitToken) {
        token = visitToken;
        tracked = true;
      }

      // Referrer public identity for the landing card (never private data).
      const { data: referrer } = await supabase
        .from('referral_codes')
        .select('user_profiles!inner(username)')
        .eq('code', code)
        .eq('active', true)
        .maybeSingle();
      referrerUsername = referrer?.user_profiles?.username || null;
    } catch {
      // Degrade gracefully: still render a generic invite page.
    }
  }

  const response = new NextResponse(renderPage({ code, referrerUsername, tracked }), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

  if (tracked && token) {
    response.cookies.set('bb_ref', String(token), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
  }

  return response;
}

// Render the branded invite page (content-first: feed is one tap away).
function renderPage({ code, referrerUsername, tracked }) {
  const mention = referrerUsername ? `@${escapeHtml(referrerUsername)}` : 'a BurnBoard member';
  return `<!doctype html>
<html lang="en" style="background:#0a0a0a">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You're invited to BurnBoard 🔥 — Real humans. No filter.</title>
  <meta name="robots" content="noindex" />
  <style>
    body{margin:0;background:#0a0a0a;color:#f0f0f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
    .card{max-width:420px;width:100%;background:#111;border:1px solid #222;border-radius:20px;padding:36px 28px;text-align:center;}
    .flame{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#ff4d00,#f59e0b);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px;}
    h1{font-size:20px;margin:0 0 10px;letter-spacing:.5px;text-transform:uppercase;}
    p{color:#a1a1aa;font-size:13px;line-height:1.6;margin:0 0 24px;}
    .btn{display:block;width:100%;box-sizing:border-box;background:#ff4d00;color:#000;font-weight:800;text-decoration:none;padding:14px;border-radius:14px;font-size:14px;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;}
    .btn.ghost{background:#1a1a1a;border:1px solid #333;color:#c0c0c0;text-transform:none;font-weight:600;letter-spacing:0;}
    .note{color:#555;font-size:11px;margin-top:14px;}
    ${tracked ? '' : '.'}
  </style>
</head>
<body>
  <div class="card">
    <div class="flame">🔥</div>
    <h1>You're invited to BurnBoard</h1>
    <p><strong>${mention}</strong> thinks you can take the heat.</p>
    <p>Real humans. No AI. Brutal roasts, hot takes, roast battles, and communities built on sharp wit.</p>
    <a class="btn" href="${SITE}/auth?ref=${encodeURIComponent(code)}">Join the roast</a>
    <a class="btn ghost" href="${SITE}/home?ref=${encodeURIComponent(code)}">Browse the feed first</a>
    <p class="note">No spam. No forced invites. Just unfiltered humans.</p>
  </div>
</body>
</html>`;
}