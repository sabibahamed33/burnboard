import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import LocaleProvider from '@/components/LocaleProvider';
import SocialShell from '@/components/SocialShell';
import ReferralLinkProbe from '@/components/growth/ReferralLinkProbe';

export const metadata = {
  metadataBase: new URL('https://burnboard.app'),
  title: 'BURNBOARD - Get Roasted by Real Humans | 100% Anonymous',
  description: 'No AI. Just humans roasting humans. The brutal, anonymous social media roast platform with live leaderboards, roast battles, and zero filter.',
  alternates: {
    canonical: 'https://burnboard.app',
    languages: {
      'en-US': 'https://burnboard.app',
      'bn-BD': 'https://burnboard.app',
      'es-ES': 'https://burnboard.app',
      'fr-FR': 'https://burnboard.app',
      'ar-EG': 'https://burnboard.app',
      'hi-IN': 'https://burnboard.app',
    },
  },
  keywords: [
    'roast me',
    'anonymous roasts',
    'LinkedIn roasts',
    'GitHub roasts',
    'Twitter roasts',
    'social media roasts',
    'comedy roast battle',
    'burnboard',
  ],
  authors: [{ name: 'BURNBOARD' }],
  creator: 'BURNBOARD',
  publisher: 'BURNBOARD',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://burnboard.app',
    title: 'BURNBOARD - No AI. Just Humans Roasting Humans.',
    description: 'The anonymous social media roast platform. Submit profiles, write brutal burns, vote in live roast battles.',
    siteName: 'BURNBOARD',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BURNBOARD - No AI. Just Humans Roasting Humans.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BURNBOARD - No AI. Just Humans Roasting Humans.',
    description: 'The anonymous social media roast platform. 100% human-crafted burns.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }) {
  // Structured data for Google Rich Results
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'BURNBOARD',
    url: 'https://burnboard.app',
    description: 'No AI. Just humans roasting humans. The anonymous social media roast platform.',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://burnboard.app/?search={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BURNBOARD',
    url: 'https://burnboard.app',
    logo: 'https://burnboard.app/og-image.png',
    sameAs: [
      'https://twitter.com/burnboard',
      'https://github.com/burnboard',
      'https://www.producthunt.com/posts/burnboard',
    ],
  };

  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className="bg-[#0a0a0a] text-[#f0f0f0] min-h-screen font-sans selection:bg-[#ff4d00] selection:text-white">
        <LocaleProvider>
          <SocialShell>
            {children}
          </SocialShell>
        </LocaleProvider>
        <ReferralLinkProbe />
        <Analytics />
      </body>
    </html>
  );
}
