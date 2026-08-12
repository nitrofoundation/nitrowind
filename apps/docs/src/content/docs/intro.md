---
title: Nitrowind Documentation
description: Nitrowind is an open-source Tailwind CSS v4 styling system for React Native backed by a native C++ ShadowTree engine.
---


Nitrowind brings Tailwind CSS v4 classes to React Native with a native C++ ShadowTree engine. It updates theme, color scheme, safe-area, container, and group-state styles without putting React back on the render path.

[Get started](/getting-started/installation/) | [How it works](/core-concepts/how-it-works/)

## What you get

- Tailwind CSS v4 utilities through `className`.
- Native C++ style updates for runtime state changes.
- A plain CSS path through `nitrocss`.
- Platform variants, themes, safe-area utilities, interaction states, and container queries.
- Styled React Native primitives, scrollables, SVG primitives, and third-party component interop.
- Optional Reanimated helpers for entering, exiting, layout, and CSS-keyframe style animations.

## Packages

| Package | Use it when |
| --- | --- |
| `nitrowind` | You want Tailwind CSS v4 utilities, platform variants, safe-area utilities, animation helpers, and the full `className` workflow. |
| `nitrocss` | You want the native CSS engine directly with plain CSS classes and no Tailwind requirement. |

The engine compiles styles at build time, links rendered Fabric nodes to a native C++ resolver, and updates affected native props when runtime state changes. Theme switches, dark mode, dimensions, safe-area insets, RTL, font scale, group state, and container size changes can be recomputed without asking React to re-render your tree.

## Where to go next

Start with [Installation](/getting-started/installation/), then read [How It Works](/core-concepts/how-it-works/). If you are coming from NativeWind or Uniwind, read [Migration](/getting-started/migration/), [States and Groups](/features/states-and-groups/), [Responsive and Containers](/features/responsive-and-containers/), and [cssInterop](/api/css-interop/).
