---
title: React Native macOS Support Plan
description: Phased plan for bringing NitroWind's native engine to React Native macOS.
---

# React Native macOS Support Plan

React Native macOS is an out-of-tree platform, so NitroWind must validate a
specific compatible pair of `react-native` and `react-native-macos` versions.
The first supported pair will use the same React Native minor version, following
the platform's official versioning guidance. macOS support will initially ship
as experimental and will not weaken the existing iOS or Android guarantees.

Useful starting points already exist:

- The compiler and JavaScript runtime recognize `macos:` selectors.
- The C++ engine selects `macos` when compiled with `TARGET_OS_OSX`.
- Nitro Modules already declares macOS in its CocoaPods platforms.
- Most resolution, dependency indexing, mutation diffing, grid, and diagnostics
  logic is portable shared C++.

## Phase 0 — compatibility spike (implemented)

The first spike uses React Native `0.81.6`, React Native macOS `0.81.9`, React
`19.1.4`, Nitro Modules `0.35.9`, macOS 14 as the deployment target, and the New
Architecture. The runnable fixture lives in `apps/example-macos` and was created
with `react-native-macos-init`.

The NitroCSS pod now builds for macOS and registers the core HybridObjects,
native platform state, diagnostics, ShadowRegistry, and Fabric mutation engine.
The fixture proves native class registration, a user-driven light/dark update,
and view unlink/relink without importing UIKit paint adapters.

React Native macOS `0.81` needs one Metro compatibility boundary in a monorepo:
all `react-native` package and subpath imports must resolve to
`react-native-macos`, and only that fork's `InitializeCore` may run. Loading the
upstream and macOS runtimes together duplicates native view registrations. Its
Debug bridge can also leave the `RCTDevLoadingViewWindow` progress sheet visible
after the bundle is ready; Release builds are the authoritative Phase 0 smoke.

Status: the core Phase 0 build and runtime criterion is met. macOS remains
experimental: AppKit paint adapters, system appearance observers, multi-window
state, and the full cleanup/stress matrix belong to later phases.

## Phase 1 — package and Apple build support (implemented)

- ✅ Change the NitroCSS podspec from iOS-only to Apple platforms with a declared
  minimum macOS version.
- ✅ Validate consumer installation through CocoaPods and the package's standard
  podspec discovery, rather than a repository-relative pod.
- ✅ Keep portable resolution/Fabric code in `cpp/`, UIKit adapters in `ios/`,
  and AppKit adapters in `macos/` so platform paint code cannot leak across.
- ✅ Add the matching `react-native-macos` development dependency only to the
  macOS example and CI job.
- ✅ Extend `nitrowind doctor` with the macOS version-pair, pod, architecture, and
  native-engine checks.

The macOS workflow installs a consumer pod graph, runs doctor and example tests,
and compiles universal Debug/Release (`arm64` + `x86_64`) artifacts. It also
rebuilds the iOS NitroCSS target to protect the shared Apple podspec boundary.

Exit criterion met locally and encoded in CI: clean Debug and Release universal
builds from a fresh pod install, with the existing iOS target still green.

## Phase 2 — runtime and semantic platform state (in progress)

- ✅ Implement an AppKit `NativePlatform` adapter for appearance, screens,
  backing-scale factor, layout direction, font scale, and window/content insets.
- ✅ Map semantic colors to `NSColor`, preserve Display-P3 through Fabric, and
  observe light/dark, increased-contrast, and reduced-transparency changes.
- ✅ Define desktop safe-area behavior explicitly: full-window content, title-bar
  content layout, and ordinary zero-inset windows must be distinguishable.
- Validate runtime subscription teardown across reloads and multiple windows.

The AppKit observer coalesces application activation, key-window, resize,
screen/backing-scale, effective-appearance, and accessibility-display changes.
Its KVO and notification tokens are released with the native HybridObject.
Window metrics follow the active key/main window; per-surface multi-window state
still needs the Phase 2 stress fixture before this phase is complete.

Exit criterion: native appearance and accessibility changes update only affected
Fabric nodes with zero React rerenders and correct multi-window state.

## Phase 3 — native paint adapters

- Port gradients, gradient borders, clip paths, background images, shadows,
  filters, outlines, backdrop effects, and animated gradient angles from UIKit
  views to AppKit layer-backed views.
- Use `NSImage` for raster loading and preserve cancellation/tag-reuse behavior.
- Provide deterministic fallbacks for effects unavailable on the selected
  minimum macOS version.
- Verify that tag reuse clears every CALayer/descriptor registry before a new
  cell occupies the tag.

Exit criterion: the effects and backgrounds examples visually match iOS within
the documented platform differences in light, dark, and high-contrast modes.

## Phase 4 — components and ecosystem coverage

- Validate View, Text, Image, ScrollView, FlatList, SectionList, Pressable,
  TextInput, Switch, and ActivityIndicator wrappers.
- Test hover, focus-visible, keyboard navigation, pointer interaction, RTL,
  window resizing, and desktop font scaling.
- Validate React Native SVG, Reanimated, Gesture Handler, and FlashList only on
  versions that explicitly support the selected React Native macOS release.
- Exercise native grid, container queries, CSS math, semantic colors, and
  `macos:`/`native:` variant precedence.

Exit criterion: the documented core component matrix passes without importing
iOS-only modules or silently falling back to fixed theme colors.

## Phase 5 — regression, performance, and release gate

- Add macOS compiler/unit tests and an Xcode CI build matrix for Debug/Release.
- Add visual baselines for home, effects, backgrounds, grid, SVG, semantic
  colors, focus/hover, and light/dark/high-contrast appearances.
- Run list-recycling stress tests with thousands of FlatList/FlashList items,
  window resizing, live theme changes, insertion/removal, and tag reuse.
- Extend Benchmark v2 with mount, native theme switching, resize/container
  changes, and list scrolling; compare identical trees against StyleSheet.
- Publish a compatibility table listing the exact React Native macOS, macOS,
  Xcode, Nitro Modules, and optional-library versions tested.

Experimental support is ready only when `nitrowind doctor` passes, Debug and
Release builds are green, native theme switching causes no React rerenders,
registry size returns to baseline after stress tests, and known visual or API
gaps are documented.

## Upstream references

- [React Native macOS: native platform development](https://microsoft.github.io/react-native-macos/docs/guides/native-development)
- [React Native macOS: getting started](https://microsoft.github.io/react-native-macos/docs/getting-started)
- [React Native macOS repository](https://github.com/microsoft/react-native-macos)
