---
title: Roadmap
description: What NitroWind is working toward during the public beta.
---

# Roadmap

NitroWind is in public beta. This roadmap describes the direction of the project, not a release contract. Priorities can change as we learn from real applications and feedback.

Our guiding principle is simple: keep the familiar Tailwind CSS workflow while making steady-state styling updates as native, observable, and efficient as possible.

## Delivered in the current development build

- Benchmark v2 separates a repeatable grid remount workload from steady-state theme switching, runs
  warmups plus measured samples, and reports median, p95, average, deviation,
  React renders, and native resolver/commit diagnostics.
- Dependency snapshots, a bounded static class-resolution cache, cached theme
  variables, and resolved-prop mutation diffing shorten the native update path.
- Native diagnostics expose linked, affected, resolved, skipped, and committed
  nodes together with resolver and ShadowTree commit time.
- `color-mix()`, conic gradients, and intrinsic/content-sized native grid tracks
  are implemented with documented platform fallbacks.
- Project-specific autocomplete, maintained interop presets, copyable examples,
  and a read-only NativeWind/Uniwind migration checker are available.
- A deterministic 20-scene iOS/Android visual-regression gate now covers home,
  borders, backgrounds, grid, and SVG in both color schemes, plus warm-navigation
  and live-theme stress checks.
- The native effects descriptor, style inspector, accessibility variants, CSS
  math/runtime units, semantic colors, percentage/dense/aligned native grid, and
  Tailwind v4 compatibility descriptors are available in the development build.

The remaining performance gate is to run Benchmark v2 in release builds on
physical iOS and Android devices and publish reproducible results. The theme
switch target is to match or beat the equivalent `StyleSheet` steady-state path;
the roadmap does not claim that target until those device results are recorded.

### Current simulator baseline

Simulator results are useful for catching regressions, but they are **not a
physical-device performance claim**. On an iPhone 17 Pro simulator with a
Release build, React Native 0.86, 1,000 cards, two warmups, and 10 measured runs,
the current development build recorded:

| Scenario | NitroWind | StyleSheet | React renders |
| --- | ---: | ---: | ---: |
| Grid remount, average | 81.26 ms | 78.03 ms | 12 / 12 |
| Native theme switch, average | 16.05 ms | 96.08 ms | 0 / 12 |

The native theme-switch path was about 6× faster in this simulator run because
it updated affected Fabric nodes without rerendering the React tree. Mount was
about 4% slower than the matching StyleSheet control. Android and iOS Release
builds pass emulator/simulator startup and navigation smoke tests for
animations, grid, and gradients. An Android emulator run exposed a mixed
surface/text palette during an adaptive light/dark switch; that correctness
issue remains a gate before publishing device numbers. Physical-device runs are
intentionally deferred and remain the release-quality performance gate.

## Planned — React Native macOS

NitroWind already compiles `macos:` variants and the shared C++ resolver can
identify a macOS target. Native macOS support now has an implementation plan
covering package integration, AppKit paint adapters, Fabric lifecycle behavior,
testing, diagnostics, and an experimental release gate.

[Read the React Native macOS support plan](./plans/react-native-macos)

## Now — beta foundations

### Reliable native styling

- Harden theme, color-scheme, safe-area, container, group, and pseudo-state updates across iOS and Android.
- Expand the native test matrix for React Native release builds, Expo development builds, navigation, lists, and hot reload.
- Make the native-engine / JS-fallback boundary easy to understand when an app is running in an unsupported environment.

### Benchmarking we can stand behind

- Replace the single remount timing screen with a benchmark suite that separates first mount, theme switches, container changes, and list scrolling.
- Compare against an identical `StyleSheet` tree in release builds on physical iOS and Android devices.
- Report median, p95, worst run, memory, React Native version, device, and exact benchmark source.

### Native runtime diagnostics

- Add a development-only diagnostics API and overlay.
- Show linked nodes, affected nodes, resolved nodes, skipped mutations, resolver time, commit time, and native-engine status.
- Make regressions visible before they reach a release.

## Next — faster steady-state updates

### Resolver and commit path

- Cache static class composition so only state-dependent values are recomputed at runtime.
- Snapshot affected nodes before resolving them, keeping registry locks short.
- Skip ShadowTree mutations when a resolved result did not actually change.
- Index container dependents directly so a size change updates only the children that use that container.

The goal is not merely “faster benchmarks”; it is predictable native work that is proportional to the number of affected views.

## Next — native CSS capability

### High-value styling features

- `color-mix()` support where React Native does not currently parse it natively.
- Conic gradients for charts, decorative surfaces, and data-rich UI.
- More complete backdrop filters beyond blur.
- More complete native grid sizing, including intrinsic and content-based tracks.

### Accessibility and platform adaptation

- Reduced-motion variants.
- Font-scale and larger-text-aware variants.
- Contrast-aware theme tokens.
- Better RTL-aware utilities and platform-specific adaptive tokens.

## Later — developer experience and ecosystem

### Better feedback in the editor

- Class autocomplete generated from the compiled CSS artifact.
- Safelist and dynamic-class guidance.
- Unknown-class diagnostics and a “why did this style win?” inspector.

### Interop that works out of the box

- Maintained `cssInterop` presets for common React Native libraries.
- Reference integrations for Expo Router, React Navigation, FlashList, SVG/chart packages, sheets, gestures, and popular component systems.
- More complete starter projects and migration examples.

## How to influence the roadmap

The most useful feedback includes a minimal reproduction, React Native version, platform, whether the app uses the new architecture, and what you expected to happen.

- [Open an issue on GitHub](https://github.com/nitrofoundation/nitrowind/issues)
- [Read the installation guide](./getting-started/installation)
- [Support continued development](https://buymeacoffee.com/joylan)

If NitroWind helps you, trying the beta in a real app and sharing what breaks is one of the best ways to shape what comes next.
