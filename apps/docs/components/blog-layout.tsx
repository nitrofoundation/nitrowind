import { Blocks, BookOpen, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DocsLayout as FumadocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import { blogSource } from '@/lib/source';

export default function BlogLayout({ children }: { children: ReactNode }) {
  const options = baseOptions();

  return (
    <FumadocsLayout
      {...options}
      nav={{ ...options.nav, mode: 'top' }}
      tree={blogSource.getPageTree()}
      sidebar={{
        collapsible: false,
        defaultOpenLevel: 2,
        banner: <BlogSidebarLinks />,
      }}
    >
      {children}
    </FumadocsLayout>
  );
}

function BlogSidebarLinks() {
  return (
    <nav className="blog-sidebar-links" aria-label="Nitrowind resources">
      <Link href="/docs">
        <BookOpen aria-hidden="true" /> Docs
      </Link>
      <Link href="/docs/features">
        <LayoutGrid aria-hidden="true" /> Features
      </Link>
      <Link href="/docs/api">
        <Blocks aria-hidden="true" /> API
      </Link>
      <strong>Posts</strong>
    </nav>
  );
}
