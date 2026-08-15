import { DocsLayout as FumadocsLayout } from 'fumadocs-ui/layouts/notebook';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';

export default function DocsLayout({ children }: { children: ReactNode }) {
  const tree = source.getPageTree();
  const options = baseOptions();

  return (
    <FumadocsLayout
      {...options}
      nav={{ ...options.nav, mode: 'top' }}
      tree={tree}
      sidebar={{
        collapsible: false,
        defaultOpenLevel: 2,
        banner: <DocsSidebarBanner />,
      }}
    >
      {children}
    </FumadocsLayout>
  );
}

function DocsSidebarBanner() {
  return (
    <div className="docs-sidebar-banner" key="docs-sidebar-banner">
      <strong>
        Nitrowind 1.0 <small>beta</small>
      </strong>
      <span>Tailwind CSS v4 bindings, powered by the native engine.</span>
      <Link href="/docs/getting-started/installation">Get started →</Link>
    </div>
  );
}
