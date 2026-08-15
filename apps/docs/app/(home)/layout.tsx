import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import Link from 'next/link';
import Image from 'next/image';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <HomeLayout {...baseOptions()}>
      {children}
      <footer className="border-t border-fd-border bg-fd-muted/50">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Image
              alt="Nitrowind"
              className="nitrowind-logo h-6 w-auto"
              height={24}
              src="/img/logo.svg"
              width={158}
            />
            <p className="mt-3 text-sm leading-6 text-fd-muted-foreground">
              Open-source Tailwind CSS v4 bindings for React Native, powered by a native C++ engine.
            </p>
          </div>
          <FooterColumn
            title="Documentation"
            links={[
              ['Installation', '/docs/getting-started/installation'],
              ['Features', '/docs/features'],
              ['Theming', '/docs/core-concepts/theming'],
              ['API reference', '/docs/api'],
            ]}
          />
          <FooterColumn
            title="Learn"
            links={[
              ['How it works', '/docs/core-concepts/how-it-works'],
              ['Migration', '/docs/getting-started/migration'],
              ['Compatibility', '/docs/core-concepts/compatibility'],
              ['Blog', '/blog'],
              ['Skills', '/docs/skills'],
            ]}
          />
          <FooterColumn
            title="Project"
            links={[
              ['GitHub', 'https://github.com/nitrofoundation/nitrowind'],
              [
                'Contributing',
                'https://github.com/nitrofoundation/nitrowind/blob/main/CONTRIBUTING.md',
              ],
              ['MIT License', 'https://github.com/nitrofoundation/nitrowind/blob/main/LICENSE'],
            ]}
          />
        </div>
        <div className="border-t border-fd-border px-6 py-5 text-center text-sm text-fd-muted-foreground">
          © {new Date().getFullYear()} Nitro Foundation. Built in the open.
        </div>
      </footer>
    </HomeLayout>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-fd-muted-foreground">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link className="transition hover:text-fd-foreground" href={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
