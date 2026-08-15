import type { MetadataRoute } from 'next';
import { blogSource, source } from '@/lib/source';

const siteUrl = 'https://nitrowind.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/blog`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...blogSource.getPages().map(page => ({
      url: new URL(page.url, siteUrl).toString(),
      lastModified: new Date(`${page.data.date}T00:00:00Z`),
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    })),
    ...source.getPages().map(page => ({
      url: new URL(page.url, siteUrl).toString(),
      changeFrequency: 'weekly' as const,
      priority: page.url === '/docs' ? 0.9 : 0.7,
    })),
  ];
}
