'use client';

import Link from 'next/link';
import P3ColorsVisual from '@/components/p3-colors-visual';
import DarkModeVisual from './DarkModeVisual';

export default function HomeShowcase() {
  return (
    <div className="showcase-grid">
      <article className="showcase-card theme-card accent-cyan">
        <CardTop number="01" title="Adaptive themes" />
        <DarkModeVisual />
        <CardBottom
          href="/docs/core-concepts/adaptive-theming"
          label="Dark mode · named themes · system"
        />
      </article>
      <article className="showcase-card p3-card accent-pink">
        <CardTop number="02" title="P3 & native colors" />
        <div className="p3-spectrum">
          <P3ColorsVisual />
        </div>
        <CardBottom href="/docs/features/p3-colors" label="Semantic colors · native props" />
      </article>
      <Link
        className="showcase-card image-card accent-orange"
        href="/docs/features/background-images"
      >
        <CardTop number="03" title="Images & gradients" />
        <div className="image-demo">
          <div className="image-sun" />
          <div className="image-ridge ridge-one" />
          <div className="image-ridge ridge-two" />
          <div className="image-copy">
            <span>Native paint layers</span>
            <strong>Background image</strong>
            <small>cover · focal point · repeat</small>
          </div>
        </div>
        <CardBottom label="Background images · gradients · borders" />
      </Link>
      <Link className="showcase-card effects-card accent-pink" href="/docs/features/effects">
        <CardTop number="04" title="Masks & clip paths" />
        <div className="effects-demo">
          <div className="effect-orb orb-one" />
          <div className="effect-orb orb-two" />
          <div className="effect-frame">
            <span>clip-path</span>
            <strong>Paint outside the box.</strong>
          </div>
          <div className="effect-mask">MASK</div>
        </div>
        <CardBottom label="Masks · clip paths · shadows · filters" />
      </Link>
      <article className="showcase-card motion-card accent-purple">
        <CardTop number="05" title="Motion in native" />
        <div className="motion-demo">
          <section className="motion-utilities">
            <div className="motion-copy">
              <span>UTILITY ANIMATIONS</span>
              <strong>animate-spin, animate-bounce, animate-pulse</strong>
              <p>
                Classes compile into native animation descriptors. The native runtime drives each
                frame; no JavaScript animation loop is required.
              </p>
            </div>
            <div className="utility-list">
              <UtilityAnimation className="spin" label="animate-spin" />
              <UtilityAnimation className="bounce" label="animate-bounce" />
              <UtilityAnimation className="pulse" label="animate-pulse" />
            </div>
            <div className="timing-list" aria-label="Animation timing function comparison">
              <TimingTrack color="blue" label="linear" timing="linear" />
              <TimingTrack color="violet" label="ease-out" timing="ease-out" />
              <TimingTrack color="rose" label="ease-in-out" timing="ease-in-out" />
              <TimingTrack color="indigo" label="ease-in" timing="ease-in" />
            </div>
          </section>
          <section className="scroll-example">
            <div>
              <span>SCROLL-DRIVEN</span>
              <strong>Scroll the feed</strong>
              <p>Timeline progress follows the scroll container.</p>
            </div>
            <div className="scroll-viewport" tabIndex={0}>
              <span className="scroll-hint">scroll ↓</span>
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </section>
        </div>
        <CardBottom
          href="/docs/features/scroll-driven-animations"
          label="CSS keyframes · native utilities · scroll timelines"
        />
      </article>
    </div>
  );
}
function UtilityAnimation({ className, label }: { className: string; label: string }) {
  return (
    <div className="utility-animation">
      <span>{label}</span>
      <i className={className} />
    </div>
  );
}
function TimingTrack({ color, label, timing }: { color: string; label: string; timing: string }) {
  return (
    <div className={`timing-track timing-${color}`}>
      <span>{label}</span>
      <div>
        <i style={{ animationTimingFunction: timing }} />
      </div>
    </div>
  );
}
function CardTop({ number, title }: { number: string; title: string }) {
  return (
    <div className="showcase-top">
      <span className="feature-index">
        <i aria-hidden="true" />
        NW/{number}
      </span>
      <h3>{title}</h3>
      <b aria-hidden="true">↗</b>
    </div>
  );
}
function CardBottom({ href, label }: { href?: string; label: string }) {
  return (
    <div className="showcase-bottom">
      <span>{label}</span>
      {href ? (
        <Link className="showcase-docs-button" href={href}>
          <i aria-hidden="true" />
          <span>Explore feature</span> <b>→</b>
        </Link>
      ) : (
        <strong className="showcase-docs-button">
          <i aria-hidden="true" />
          <span>Explore feature</span> <b>→</b>
        </strong>
      )}
    </div>
  );
}
