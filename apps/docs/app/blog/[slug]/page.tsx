import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/notebook/page';
import { getMDXComponents } from '@/components/mdx';
import DocsRail from '@/components/docs-rail';
import { blogSource } from '@/lib/source';
import JsonLd from '@/components/json-ld';
import type { Metadata } from 'next';

export default async function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const page = blogSource.getPage([slug]);
  if (!page) notFound();

  const MDX = page.data.body;
  const canonicalUrl = new URL(page.url, 'https://nitrowind.dev').toString();

  return (
    <>
      <JsonLd
        value={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: page.data.title,
          description: page.data.description,
          datePublished: page.data.date,
          dateModified: page.data.date,
          url: canonicalUrl,
          author: {
            '@type': 'Person',
            name: page.data.author.name,
            url: page.data.author.url,
          },
          publisher: {
            '@type': 'Organization',
            name: 'Nitro Foundation',
            url: 'https://nitrowind.dev',
          },
          isPartOf: { '@type': 'Blog', name: 'Nitrowind Blog', url: 'https://nitrowind.dev/blog' },
        }}
      />
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        tableOfContent={{ style: 'clerk', single: false, footer: <DocsRail /> }}
      >
        <header className="blog-docs-header">
          <time dateTime={page.data.date}>{formatDate(page.data.date)}</time>
          <DocsTitle>{page.data.title}</DocsTitle>
          <div className="blog-article-tags">
            {page.data.tags.map(tag => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
          <Link className="blog-article-byline" href={page.data.author.url}>
            {page.data.author.image_url ? (
              // The source is a contributor-controlled GitHub avatar URL from blog frontmatter.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={page.data.author.image_url} />
            ) : (
              <span className="blog-author-avatar">{initials(page.data.author.name)}</span>
            )}
            <span>
              <strong>{page.data.author.name}</strong>
              <small>{page.data.author.title}</small>
            </span>
          </Link>
        </header>
        <DocsBody>
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(blogSource, page),
            })}
          />
        </DocsBody>
        <footer className="blog-author-card">
          {page.data.author.image_url ? (
            // The source is a contributor-controlled GitHub avatar URL from blog frontmatter.
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={page.data.author.image_url} />
          ) : (
            <span className="blog-author-avatar">{initials(page.data.author.name)}</span>
          )}
          <div>
            <small>WRITTEN BY</small>
            <strong>{page.data.author.name}</strong>
            <p>{page.data.author.title}</p>
          </div>
          <Link href={page.data.author.url} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" /> GitHub
          </Link>
        </footer>
      </DocsPage>
    </>
  );
}

export function generateStaticParams() {
  return blogSource.generateParams().map(params => ({ slug: params.slug?.[0] }));
}

export async function generateMetadata(props: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const page = blogSource.getPage([slug]);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    authors: [{ name: page.data.author.name, url: page.data.author.url }],
    alternates: { canonical: page.url },
    openGraph: {
      type: 'article',
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      publishedTime: page.data.date,
      authors: [page.data.author.url],
      tags: page.data.tags,
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
      images: ['/opengraph-image'],
    },
  };
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function initials(name: string) {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2);
}
