import React from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";

const installCommand =
  "npm install @nitrofoundation/nitrowind @nitrofoundation/nitrocss tailwindcss react-native-nitro-modules";

const features = [
  {
    number: "01",
    title: "Native themes",
    description:
      "Switch light, dark, and named themes through the native engine—without driving a React render through your app.",
    href: "/core-concepts/theming",
  },
  {
    number: "02",
    title: "One CSS language",
    description:
      "Use Tailwind utilities, theme tokens, platform variants, group states, and plain CSS in one familiar workflow.",
    href: "/getting-started/global-css",
  },
  {
    number: "03",
    title: "Responsive by container",
    description:
      "Build layouts that respond to the space they receive with native container queries, grids, and safe-area utilities.",
    href: "/features/container-queries",
  },
  {
    number: "04",
    title: "Native visual effects",
    description:
      "Bring backgrounds, gradients, masks, shadows, SVG, and CSS animations to React Native without changing your styling model.",
    href: "/features/gradients-and-backgrounds",
  },
];

export default function Home(): React.ReactNode {
  return (
    <Layout
      title="Native-first Tailwind CSS for React Native"
      description="NitroWind is a native-first Tailwind CSS styling engine for React Native."
    >
      <main className="nitro-home">
        <section className="nitro-home-hero">
          <div className="nitro-home-shell nitro-home-hero-grid">
            <div className="nitro-home-hero-copy">
              <div className="nitro-home-beta">Now in public beta · v0.2</div>
              <p className="nitro-home-eyebrow">Tailwind CSS, committed natively</p>
              <h1>
                Style React Native apps with Tailwind—<span>at native speed.</span>
              </h1>
              <p className="nitro-home-lede">
                NitroWind compiles your CSS and applies steady-state style updates through a C++ ShadowTree engine.
                Build with utilities; keep theme and UI updates off the React render path.
              </p>
              <div className="nitro-home-actions">
                <Link className="nitro-home-button nitro-home-button-primary" to="/getting-started/installation">
                  Get started <span aria-hidden="true">→</span>
                </Link>
                <a
                  className="nitro-home-button nitro-home-button-secondary"
                  href="https://github.com/nitrofoundation/nitrowind"
                  rel="noreferrer"
                  target="_blank"
                >
                  View on GitHub <span aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="nitro-home-note">Requires React Native’s new architecture and a development build.</p>
            </div>

            <div className="nitro-home-preview" aria-label="NitroWind styling example">
              <div className="nitro-home-preview-bar">
                <span className="nitro-home-window-dots"><i /><i /><i /></span>
                <span>Welcome.tsx</span>
                <span className="nitro-home-live">native</span>
              </div>
              <pre><code><span className="n-keyword">export default function</span> <span className="n-function">Welcome</span>() {`\n`}  <span className="n-keyword">return</span> ({`\n`}    <span className="n-tag">&lt;View</span> <span className="n-prop">className</span>=<span className="n-string">"flex-1 bg-surface pt-safe"</span><span className="n-tag">&gt;</span>{`\n`}      <span className="n-tag">&lt;View</span> <span className="n-prop">className</span>=<span className="n-string">"mx-5 rounded-3xl bg-brand p-6"</span><span className="n-tag">&gt;</span>{`\n`}        <span className="n-tag">&lt;Text</span> <span className="n-prop">className</span>=<span className="n-string">"text-2xl font-bold text-white"</span><span className="n-tag">&gt;</span>{`\n`}          Native styling, no compromise.`\n`}        <span className="n-tag">&lt;/Text&gt;</span>{`\n`}      <span className="n-tag">&lt;/View&gt;</span>{`\n`}    <span className="n-tag">&lt;/View&gt;</span>{`\n`}  );{`\n`}}</code></pre>
              <div className="nitro-home-preview-status"><span /> Theme update committed through ShadowTree</div>
            </div>
          </div>
        </section>

        <section className="nitro-home-proof" aria-label="NitroWind capabilities">
          <div className="nitro-home-shell nitro-home-proof-grid">
            <div><strong>Native C++ engine</strong><span>ShadowTree style commits</span></div>
            <div><strong>No React re-render</strong><span>for steady-state style updates</span></div>
            <div><strong>Tailwind CSS v4</strong><span>utilities, tokens, and CSS</span></div>
            <div><strong>iOS + Android</strong><span>Fabric and bridgeless runtime</span></div>
          </div>
        </section>

        <section className="nitro-home-section nitro-home-engine">
          <div className="nitro-home-shell">
            <div className="nitro-home-section-heading">
              <div>
                <p className="nitro-home-eyebrow">Built for the native runtime</p>
                <h2>Use the classes you know.<br />Let the engine do the rest.</h2>
              </div>
              <p>NitroWind turns CSS candidates into efficient native style work. Themes, containers, insets, and state changes stay close to the platform instead of becoming application-wide render work.</p>
            </div>
            <div className="nitro-home-engine-visual">
              <img src="/img/features/native-engine-pipeline.png" alt="NitroWind turns CSS tokens into native C++ ShadowTree style updates" />
            </div>
          </div>
        </section>

        <section className="nitro-home-section nitro-home-features">
          <div className="nitro-home-shell">
            <div className="nitro-home-section-heading nitro-home-section-heading-compact">
              <div>
                <p className="nitro-home-eyebrow">The native CSS toolbox</p>
                <h2>Everything your interface needs.</h2>
              </div>
              <Link to="/features/components">Explore all features <span aria-hidden="true">→</span></Link>
            </div>
            <div className="nitro-home-feature-grid">
              {features.map((feature) => (
                <Link className="nitro-home-feature" key={feature.number} to={feature.href}>
                  <span>{feature.number}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <b aria-hidden="true">↗</b>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="nitro-home-section nitro-home-install">
          <div className="nitro-home-shell nitro-home-install-grid">
            <div>
              <p className="nitro-home-eyebrow">Start building</p>
              <h2>Add NitroWind to your next native app.</h2>
              <p>Install the Tailwind wrapper and native CSS engine, wire Metro to your global CSS, then build with className.</p>
              <Link className="nitro-home-button nitro-home-button-primary" to="/getting-started/installation">Read the installation guide <span aria-hidden="true">→</span></Link>
            </div>
            <div className="nitro-home-install-code">
              <div><span>Terminal</span><span>npm</span></div>
              <code><em>$</em> {installCommand}</code>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
