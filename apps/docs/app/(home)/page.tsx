import Link from 'next/link';
import HomeShowcase from '@/components/home-showcase';
import HeroVisual from '@/components/hero-visual';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tailwind CSS v4 for React Native',
  description:
    'Build React Native apps with Tailwind CSS v4, native themes, responsive state, backgrounds, gradients, masks, animations, and C++ ShadowTree updates.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-orbit" />
        <div className="home-banner">
          Nitrowind 1.0 beta is available{' '}
          <Link href="/docs/getting-started/installation">Read the docs →</Link>
        </div>
        <div className="home-hero-shell">
          <div className="home-hero-copy">
            <p className="home-code-label">text-5xl · tracking-tight · native-first</p>
            <h1>
              Style React Native apps with Tailwind CSS. <span>At native speed.</span>
            </h1>
            <p>
              CSS-first Tailwind v4 bindings for React Native, with native C++ updates for themes,
              layout, effects, and interaction state.
            </p>
            <div className="home-hero-actions">
              <Link className="home-primary-button" href="/docs/getting-started/installation">
                Get started <b>→</b>
              </Link>
              <Link className="home-secondary-button" href="/docs/getting-started/migration">
                Migrate from NativeWind or Uniwind
              </Link>
            </div>
            <div className="home-platforms">
              <span>Built for</span>
              <b>iOS</b>
              <b>Android</b>
              <b>Web fallback</b>
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>
      <nav className="home-shortcuts" aria-label="Documentation shortcuts">
        <Link href="/docs/getting-started/installation">Installation</Link>
        <Link href="/docs/features">Features</Link>
        <Link href="/docs/core-concepts/theming">Theming</Link>
        <Link href="/docs/features/effects">Effects</Link>
        <Link href="/docs/getting-started/migration">Migration</Link>
        <Link href="/docs/api">API</Link>
      </nav>
      <section className="home-showcase-section">
        <header>
          <p className="home-code-label">text-4xl · pb-8 · pt-12</p>
          <h2>Why Nitrowind?</h2>
          <p>
            Everything you need for expressive React Native interfaces—compiled ahead of time and
            updated at the native layer.
          </p>
        </header>
        <HomeShowcase />
      </section>
      <section className="home-bottom-cta">
        <p className="home-code-label">Open source · MIT licensed</p>
        <h2>Build your next native interface with familiar classes.</h2>
        <div>
          <Link className="home-primary-button" href="/docs/getting-started/installation">
            Start building <b>→</b>
          </Link>
          <Link
            className="home-secondary-button"
            href="https://github.com/nitrofoundation/nitrowind"
          >
            View on GitHub
          </Link>
        </div>
      </section>
    </main>
  );
}
