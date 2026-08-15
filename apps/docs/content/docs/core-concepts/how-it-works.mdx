---
title: How It Works
description: Understand the Nitrowind compile, register, link, and native update pipeline.
---

# How It Works

Nitrowind moves styling work out of the steady React render path.

## Pipeline

1. Tailwind v4 scans your source files and builds CSS for the class candidates it finds.
2. `nitrocss` flattens CSS and converts supported declarations into React Native style buckets.
3. Each bucket receives a dependency bitmask: theme, color scheme, dimensions, insets, orientation, RTL, font scale, rem, container size, or group state.
4. The compiled artifact is registered at runtime.
5. Styled host components resolve initial styles and link their Fabric ShadowNode to the native engine.
6. When a dependency changes, the C++ engine recomputes only affected linked nodes and commits cloned props to the ShadowTree.

## Why this matters

A color-scheme or theme change often affects many views. In a JS-only styling system, that usually means React state changes and component re-renders. Nitrowind gives the native engine enough information to update affected native props directly after first render.

The JS fallback remains available for web, tests, Expo Go, and any environment where the native engine is unavailable.

## Dependency-aware styles

A static class like `p-4` has no live dependency. A class like `dark:bg-black` depends on color scheme. A class like `pt-safe` depends on insets. These dependencies let Nitrowind avoid recomputing unrelated nodes.
