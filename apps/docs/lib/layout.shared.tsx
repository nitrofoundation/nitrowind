import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';
import Image from 'next/image';
import VersionSwitcher from '@/components/version-switcher';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="nitrowind-brand">
          <Image
            priority
            alt={appName}
            className="nitrowind-logo h-6 w-auto"
            height={24}
            src="/img/logo.svg"
            width={158}
          />
        </span>
      ),
      children: <VersionSwitcher />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      { text: 'Docs', url: '/docs', active: 'nested-url' },
      { text: 'Features', url: '/docs/features', active: 'nested-url' },
      { text: 'Theming', url: '/docs/core-concepts/theming', active: 'nested-url' },
      { text: 'Blog', url: '/blog', active: 'nested-url' },
      { text: 'API', url: '/docs/api', active: 'nested-url' },
    ],
  };
}
