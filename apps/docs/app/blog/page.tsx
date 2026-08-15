import Link from 'next/link';
import { DocsPage } from 'fumadocs-ui/layouts/notebook/page';
import { blogSource } from '@/lib/source';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Nitrowind release notes, engineering articles, migration guides, and native styling updates.',
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    title: 'Nitrowind Blog',
    description:
      'Release notes, engineering articles, migration guides, and native styling updates.',
    url: '/blog',
  },
};

export default function BlogPage() {
  const posts = blogSource
    .getPages()
    .toSorted((first, second) => second.data.date.localeCompare(first.data.date));

  return (
    <DocsPage toc={[]} full>
      <main className="blog-index blog-index-notebook">
        <header className="blog-index-hero">
          <div className="blog-index-copy">
            <p className="blog-kicker">NITROWIND / BLOG</p>
            <h1>Latest Blog Posts</h1>
            <p>Release announcements, implementation notes, and guides from the native layer.</p>
          </div>
        </header>
        <section className="blog-feed" aria-label="Blog posts">
          {posts.map((post, index) => (
            <Link
              className={`blog-post-row ${index === 0 ? 'is-featured' : ''}`}
              href={post.url}
              key={post.url}
            >
              <div className="blog-post-summary">
                <time dateTime={post.data.date}>{formatDate(post.data.date)}</time>
                <h2>{post.data.title}</h2>
                <div className="blog-post-meta">
                  {post.data.tags.map(tag => (
                    <i key={tag}>{tag}</i>
                  ))}
                </div>
                <p>{post.data.description}</p>
                <div className="blog-author-inline">
                  {post.data.author.image_url ? (
                    // The source is a contributor-controlled GitHub avatar URL from blog frontmatter.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={post.data.author.image_url} />
                  ) : (
                    <span>{initials(post.data.author.name)}</span>
                  )}
                  <p>
                    <strong>{post.data.author.name}</strong>
                    <small>{post.data.author.title}</small>
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </DocsPage>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
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
