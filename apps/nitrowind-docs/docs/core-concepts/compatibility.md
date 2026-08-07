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
- Nitro modules generate the native bindings from `*.nitro.ts` specs.

## Fallback environments

When the native engine is unavailable, the JS resolver handles styles. This is useful for:

- Web builds.
- Tests.
- Expo Go.
- Early integration before native rebuilds.

## CSS support boundary

Nitrowind supports CSS that can map cleanly to React Native styles or native effect descriptors. Browser-only features that React Native cannot represent are skipped. The compiler also intentionally avoids arbitrary CSS URL background images except where native support exists in the package.
