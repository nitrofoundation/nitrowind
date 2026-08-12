---
id: intro
title: Nitrowind Documentation
slug: /intro
description: Explore Nitrowind documentation for React Native Tailwind CSS v4 setup, theming, components, native features, APIs, and the C++ ShadowTree engine.
hide_title: true
---

<div className="docs-hero">
  <span className="docs-eyebrow">Getting started</span>
  <h1>Nitrowind</h1>
  <p>
    Open-source Tailwind v4 bindings for React Native, powered by a native C++
    ShadowTree engine that updates theme, color-scheme, safe-area, container,
    and group-state styles without putting React back on the render path.
  </p>
  <div className="docs-actions">
    <a className="docs-action docs-action-primary" href="/getting-started/installation">Get started</a>
    <a className="docs-action" href="/core-concepts/how-it-works">How it works</a>
  </div>
</div>

<div className="docs-card-grid">
  <a className="docs-card" href="/getting-started/installation">
    <span>Setup</span>
    <strong>Installation</strong>
    <p>Install Nitrowind, configure Metro, create global CSS, and render your first className.</p>
  </a>
  <a className="docs-card" href="/getting-started/plain-css">
    <span>Package</span>
    <strong>Plain CSS</strong>
    <p>Use the native nitrocss engine directly when you do not want Tailwind.</p>
  </a>
  <a className="docs-card" href="/features/states-and-groups">
    <span>Features</span>
    <strong>States and groups</strong>
    <p>Use active, focus, hover, disabled, and group-state variants in React Native.</p>
  </a>
  <a className="docs-card" href="/api/runtime">
    <span>Reference</span>
    <strong>Runtime API</strong>
    <p>Providers, hooks, style registration, runtime snapshots, and low-level helpers.</p>
  </a>
</div>

It is built as two packages:

| Package | Use it when |
| --- | --- |
| `nitrowind` | You want Tailwind v4 utilities, platform variants, safe-area utilities, animation helpers, and the full className workflow. |
| `nitrocss` | You want the native CSS engine directly with plain CSS classes and no Tailwind requirement. |

The engine compiles styles at build time, links rendered Fabric nodes to a native C++ resolver, and updates affected native props when runtime state changes. Theme switches, dark mode, dimensions, safe-area insets, RTL, font scale, group state, and container size changes can be recomputed without asking React to re-render your tree.

## What you get

- Tailwind v4 utilities in React Native via `className`.
- A native C++ ShadowTree engine for steady-state style updates.
- A plain-CSS path through `nitrocss`.
- Platform variants like `ios:`, `android:`, `web:`, `native:`, `macos:`, and `windows:`.
- Dark mode, themes, responsive styles, safe-area utilities, pseudo states, group variants, and container queries.
- Styled React Native primitives, scrollables, SVG primitives, and wrappers for third-party components.
- Optional Reanimated helpers for entering, exiting, layout, and CSS-keyframe style animations.

## Requirements

Nitrowind targets React Native `0.86` with the new architecture, Fabric, and bridgeless runtime.

The native engine is autolinked through `nitrocss`. Web, tests, and environments without the native module use the JS fallback resolver.

## Docs map

Start with [Installation](./getting-started/installation), then read [How It Works](./core-concepts/how-it-works). If you are coming from NativeWind or Uniwind, the closest pages are [Migration](./getting-started/migration), [States and Groups](./features/states-and-groups), [Responsive and Containers](./features/responsive-and-containers), and [cssInterop](./api/css-interop).
