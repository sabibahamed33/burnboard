// Robots.txt configuration for BURNBOARD (Master Prompt 14)
// Search engines may crawl public content; private, internal, and
// authenticated-only surfaces are explicitly excluded. Removed/private
// content is additionally never emitted by RLS-backed sitemaps/metadata.

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
          '/creator',
          '/insights',
          '/settings',
          '/notifications',
          '/s/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}