---
title: Compatibility
description: React Native, architecture, web, Expo Go, and CSS support boundaries.
---

# Compatibility

Nitrowind targets React Native `0.86`, Fabric, bridgeless, and the new architecture.

## Native engine

The native engine is built through `nitrocss`:

- iOS uses the `NitroCss` pod.
- Android uses the `:nitrocss` Gradle project.
- macOS has an experimental, core-only Phase 0 target using React Native
  `0.81.6` with React Native macOS `0.81.9`. Native class resolution, runtime
  state, diagnostics, and Fabric mutation are included; AppKit paint effects
  are not yet supported.
- Nitro modules generate the native bindings from `*.nitro.ts` specs.

Check an application's actual setup at any time with `yarn nitrowind doctor`.
Use `--json` to save the compatibility report as a CI artifact.

## Virtualized lists

FlatList and FlashList can reuse a Fabric tag before the old React cell cleanup
runs. NitroCSS identifies registrations by both tag and ShadowNode family: a late
cleanup from the old cell cannot unregister the current occupant. Linking a new
occupant also resets all tag-owned effect, gradient, background, clip-path, grid,
container, group, structural-state, and mutation-diff entries.

This lifecycle is regression-tested with rapid scrolling, theme changes, data
insertion/removal, class changes, delayed cleanup, and thousands of recycled
items. The live native registry remains bounded by the mounted list window.

## Fallback environments

When the native engine is unavailable, the JS resolver handles styles. This is useful for:

- Web builds.
- Tests.
- Expo Go.
- Early integration before native rebuilds.

## CSS support boundary

Nitrowind supports CSS that can map cleanly to React Native styles or native effect descriptors. Browser-only features that React Native cannot represent are skipped. The compiler also intentionally avoids arbitrary CSS URL background images except where native support exists in the package.
