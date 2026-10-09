// Robots.txt configuration for BURNBOARD (Master Prompt 14)
// Search engines may crawl public content; private, internal, and
// authenticated-only surfaces are explicitly excluded. Removed/private
// content is additionally never emitted by RLS-backed sitemaps/metadata.
//
// NOTE: public/robots.txt is a static file and takes precedence for the
// served /robots.txt — keep it in sync with the disallow list below.

export default function robots() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://burnboard.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/auth',
          '/auth/',
          '/creator', // legacy private alias route — never indexed
          '/insights', // canonical private route — never indexed
          '/welcome', // authenticated-only setup flow — never indexed
          '/settings',
          '/messages',
          '/messages/',
          '/notifications',
          '/s/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}