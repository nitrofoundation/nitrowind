import { getPageImageUrl, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/notebook/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { gitConfig } from '@/lib/shared';
import DocsRail from '@/components/docs-rail';
import JsonLd from '@/components/json-ld';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const editUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}/edit/${gitConfig.branch}/apps/docs/content/docs/${page.path}`;
  const canonicalUrl = new URL(page.url, 'https://nitrowind.dev').toString();
  const breadcrumbItems = [
    { name: 'Nitrowind', url: 'https://nitrowind.dev/' },
    { name: 'Documentation', url: 'https://nitrowind.dev/docs' },
    ...(params.slug ?? []).flatMap((_, index) => {
      const breadcrumbPage = source.getPage(params.slug!.slice(0, index + 1));
      if (!breadcrumbPage || breadcrumbPage.url === '/docs') return [];

      return [
        {
          name: breadcrumbPage.data.title,
          url: new URL(breadcrumbPage.url, 'https://nitrowind.dev').toString(),
        },
      ];
    }),
  ];

  return (
    <>
      <JsonLd
        value={[
          {
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            headline: page.data.title,
            description: page.data.description,
            url: canonicalUrl,
            author: { '@id': 'https://nitrowind.dev/#organization' },
            publisher: { '@id': 'https://nitrowind.dev/#organization' },
            isPartOf: { '@id': 'https://nitrowind.dev/#website' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbItems.map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: item.name,
              item: item.url,
            })),
          },
        ]}
      />
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        tableOfContent={{
          style: 'clerk',
          single: false,
          footer: <DocsRail />,
        }}
      >
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
        <div className="flex flex-row gap-2 items-center border-b pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover markdownUrl={markdownUrl} githubUrl={editUrl} />
        </div>
        <DocsBody>
          <MDX
            components={getMDXComponents({
              // this allows you to link to other pages with relative file paths
              a: createRelativeLink(source, page),
            })}
          />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: page.url,
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      type: 'article',
      url: page.url,
      images: [
        { url: getPageImageUrl(page).url, alt: `${page.data.title} — Nitrowind documentation` },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
      images: [getPageImageUrl(page).url],
    },
  };
}
