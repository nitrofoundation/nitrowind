import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import JsonLd from '@/components/json-ld';
import Analytics from '@/components/analytics';

const siteDescription =
  'Open-source Tailwind CSS v4 bindings for React Native with native themes, container queries, backgrounds, gradients, masks, animations, and ShadowTree updates.';

export const metadata: Metadata = {
  title: { default: 'Nitrowind', template: '%s | Nitrowind' },
  description: siteDescription,
  metadataBase: new URL('https://nitrowind.dev'),
  applicationName: 'Nitrowind',
  authors: [{ name: 'Nitro Foundation', url: 'https://github.com/nitrofoundation' }],
  creator: 'Nitro Foundation',
  publisher: 'Nitro Foundation',
  keywords: [
    'Nitrowind',
    'React Native Tailwind CSS',
    'Tailwind CSS v4 React Native',
    'React Native styling',
    'native CSS engine',
    'React Native animations',
    'React Native themes',
    'React Native container queries',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Nitrowind',
    title: 'Nitrowind — Tailwind CSS v4 for React Native',
    description: siteDescription,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Nitrowind native Tailwind CSS engine for React Native',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nitrowind — Tailwind CSS v4 for React Native',
    description: siteDescription,
    images: ['/opengraph-image'],
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/img/favicon.svg', type: 'image/svg+xml' },
      { url: '/img/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [{ url: '/img/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <JsonLd
          value={[
            {
              '@context': 'https://schema.org',
              '@type': 'Organization',
              '@id': 'https://nitrowind.dev/#organization',
              name: 'Nitro Foundation',
              url: 'https://nitrowind.dev',
              logo: 'https://nitrowind.dev/img/logo.svg',
              sameAs: ['https://github.com/nitrofoundation'],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              '@id': 'https://nitrowind.dev/#website',
              name: 'Nitrowind',
              alternateName: 'NitroWind',
              url: 'https://nitrowind.dev/',
              publisher: { '@id': 'https://nitrowind.dev/#organization' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareSourceCode',
              name: 'Nitrowind',
              description: siteDescription,
              codeRepository: 'https://github.com/nitrofoundation/nitrowind',
              license: 'https://opensource.org/license/mit',
              programmingLanguage: ['TypeScript', 'C++', 'Kotlin', 'Swift'],
              runtimePlatform: ['React Native', 'iOS', 'Android', 'Web'],
            },
          ]}
        />
        <RootProvider>{children}</RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
