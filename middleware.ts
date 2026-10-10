import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const requestId =
    request.headers.get('x-request-id') ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `mid-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);

  // ── Supabase session refresh (ROOT CAUSE FIX) ────────────────
  // The browser client (@supabase/ssr) stores the session in cookies, but
  // those cookies must be refreshed on the server on every request —
  // otherwise the /welcome server guard reads a stale/empty session and
  // bounces an actually-signed-in user back to /auth in a loop.
  // This follows the official @supabase/ssr middleware pattern: create a
  // server client bound to this request, call getUser() (refreshes +
  // re-sets cookies when needed), and return the response that carries
  // any updated cookies.
  let response = NextResponse.next({ request: { headers } });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    '';

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update the request (for downstream server components/routes)
          // and the outgoing response (so the browser stores the refresh).
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              request.cookies.set(name, value);
            } catch {}
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              response.cookies.set(name, value, options);
            } catch {}
          });
        },
      },
    });
    try {
      // getUser() validates + refreshes the session; never throws the
      // middleware — auth failures simply leave an anonymous request.
      await supabase.auth.getUser();
    } catch {
      // Fail-open: anonymous request continues with security headers.
    }
  }

  // ── Security headers (hardening, MP21) ───────────────────
  // Clickjacking / MIME-sniffing / referrer-leak protections on every
  // response. CSP deliberately omitted here: this app loads Supabase auth,
  // remote images, fonts, and inline styles/scripts from many origins, and a
  // naive policy would break first-party flows.
  const securityHeaders = [
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    [
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    ],
  ];
  for (const [key, value] of securityHeaders) {
    response.headers.set(key, value);
  }
  response.headers.set('x-request-id', requestId);

  // ── Referral deep-link rewrite (MP23) ────────────────────
  // Invite links are shared as /s/CODE (durable, opaque codes) but the
  // branded landing + server-side attribution cookie live in the route
  // handler at /api/s/[code]. Rewrite the public URL to that handler so a
  // shared link never 404s and attribution works without client JS.
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/s/')) {
    const code = pathname.slice(3);
    if (code && !code.includes('/') && code.length <= 64 && /^[a-z0-9]+$/i.test(code)) {
      const rewrite = NextResponse.rewrite(
        new URL(`/api/s/${code.toLowerCase()}`, request.url),
        { request: { headers } }
      );
      for (const [key, value] of securityHeaders) {
        rewrite.headers.set(key, value);
      }
      rewrite.headers.set('x-request-id', requestId);
      // Preserve any refreshed Supabase auth cookies on the rewrite path.
      try {
        for (const c of response.cookies.getAll()) {
          rewrite.cookies.set(c.name, c.value, c);
        }
      } catch {}
      return rewrite;
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
};

