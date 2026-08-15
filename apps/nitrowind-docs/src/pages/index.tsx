import React from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import HomeComparison from "../components/HomeComparison";
import HomePlayground from "../components/HomePlayground";

export default function Home(): React.ReactNode {
  return (
    <Layout
      title="React Native Tailwind CSS - NativeWind and Uniwind Alternative"
      description="Nitrowind is an open-source React Native Tailwind CSS engine with Tailwind v4 utilities, className support, and native C++ style updates."
    >
      <main className="seo-home">
        <section className="seo-home-hero">
          <div className="seo-home-shell">
            <div className="seo-home-copy">
              <p className="seo-home-wordmark">Nitrowind</p>
              <p className="seo-home-eyebrow">Open source native styling engine</p>
              <h1>Tailwind CSS for React Native. Native speed, familiar classes.</h1>
              <p className="seo-home-lede">
                Build iOS, Android, and web interfaces with Tailwind CSS v4,
                adaptive themes, container queries, and native C++ style updates.
              </p>
              <div className="seo-home-proof-strip" aria-label="Nitrowind highlights">
                <div>
                  <div className="seo-home-proof-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                  </div>
                  <div className="seo-home-proof-text">
                    <strong>Tailwind v4</strong>
                    <span>CSS-first configuration</span>
                  </div>
                </div>
                <div>
                  <div className="seo-home-proof-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 12l3-3" />
                    </svg>
                  </div>
                  <div className="seo-home-proof-text">
                    <strong>Native C++</strong>
                    <span>ShadowTree runtime</span>
                  </div>
                </div>
                <div>
                  <div className="seo-home-proof-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </div>
                  <div className="seo-home-proof-text">
                    <strong>Open source</strong>
                    <span>MIT licensed</span>
                  </div>
                </div>
              </div>
              <div className="seo-home-actions">
                <Link className="seo-home-button seo-home-button-primary" to="/getting-started/installation">
                  Get started
                </Link>
                <button className="seo-home-search" data-docs-search-trigger type="button">
                  Search docs <kbd>K</kbd>
                </button>
                <Link className="seo-home-text-link" to="/getting-started/migration">
                  Migrate from NativeWind or Uniwind
                </Link>
              </div>
            </div>
            <HomePlayground />
          </div>
        </section>

        <nav className="seo-home-shortcuts" aria-label="Documentation shortcuts">
          <div className="seo-home-shell seo-home-shortcuts-inner">
            <Link to="/getting-started/installation">Installation</Link>
            <Link to="/features">Features</Link>
            <Link to="/core-concepts/theming">Theming</Link>
            <Link to="/getting-started/migration">Migration</Link>
            <Link to="/api">API</Link>
            <Link to="/skills">Skills</Link>
          </div>
        </nav>

        <section className="seo-home-section">
          <div className="seo-home-shell seo-home-intro">
            <div>
              <p className="seo-home-eyebrow">Tailwind v4 for native apps</p>
              <h2>Use the familiar React Native Tailwind workflow.</h2>
            </div>
            <p>
              Author global CSS, configure Metro once, and style React Native
              primitives with Tailwind utilities. Nitrowind is built for Fabric
              and keeps runtime style dependency updates in its native engine.
            </p>
          </div>
        </section>

        <HomeComparison />

        <section className="seo-home-section seo-home-section-soft">
          <div className="seo-home-shell">
            <div className="seo-home-grid">
              <Link className="seo-home-card" to="/getting-started/installation">
                <span>Get started</span>
                <h2>Install in a React Native or Expo app</h2>
                <p>Set up Metro, global CSS, and your first className-styled screen.</p>
              </Link>
              <Link className="seo-home-card" to="/getting-started/migration">
                <span>Migration</span>
                <h2>Move from NativeWind or Uniwind</h2>
                <p>Keep the familiar Tailwind workflow while changing the native setup deliberately.</p>
              </Link>
              <Link className="seo-home-card" to="/features/container-queries">
                <span>Native features</span>
                <h2>Responsive containers, themes, and safe areas</h2>
                <p>Build component-level responsive layouts with native runtime state.</p>
              </Link>
              <Link className="seo-home-card" to="/intro">
                <span>Documentation</span>
                <h2>Nitrowind docs</h2>
                <p>Explore the complete setup, concepts, features, APIs, and native engine reference.</p>
              </Link>
              <Link className="seo-home-card" to="/core-concepts/theming">
                <span>Theming</span>
                <h2>React Native themes</h2>
                <p>Use light, dark, system, and named themes through semantic Tailwind tokens.</p>
              </Link>
              <Link className="seo-home-card" to="/skills">
                <span>AI agents</span>
                <h2>Nitrowind skills</h2>
                <p>Install focused agent workflows for setup, migration, components, and native features.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="seo-home-section">
          <div className="seo-home-shell seo-home-proof">
            <div>
              <p className="seo-home-eyebrow">What Nitrowind supports</p>
              <h2>A React Native CSS engine for the parts that matter in apps.</h2>
            </div>
            <ul>
              <li>Tailwind CSS v4 utilities and semantic theme tokens.</li>
              <li>ClassName-aware React Native and SVG primitives.</li>
              <li>Native themes, dark mode, safe areas, platform variants, and group states.</li>
              <li>Container queries, backgrounds, gradients, effects, and animations.</li>
            </ul>
          </div>
        </section>
      </main>
    </Layout>
  );
}
