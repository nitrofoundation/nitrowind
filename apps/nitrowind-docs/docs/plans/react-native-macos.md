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

## Phase 2 — runtime and semantic platform state (implemented)

- ✅ Implement an AppKit `NativePlatform` adapter for appearance, screens,
  backing-scale factor, layout direction, font scale, and window/content insets.
- ✅ Map semantic colors to `NSColor`, preserve Display-P3 through Fabric, and
  observe light/dark, increased-contrast, and reduced-transparency changes.
- ✅ Define desktop safe-area behavior explicitly: full-window content, title-bar
  content layout, and ordinary zero-inset windows must be distinguishable.
- ✅ Make responsive dimensions surface-scoped, clear them when a Fabric
  surface unmounts or the React instance reloads, and validate observer teardown.

The AppKit observer coalesces application activation, key/main-window changes,
close, resize, screen/backing-scale, effective-appearance, and
accessibility-display changes. Invalidation clears its callback before removing
KVO and notification tokens, so an already-coalesced main-queue callback cannot
reach a destroyed HybridObject. JavaScript's runtime snapshot follows the active
key/main window; native responsive resolution overlays dimensions measured from
each Fabric root, allowing two windows to occupy different breakpoints at once.

Exit criterion met: native appearance and accessibility changes update only
affected Fabric nodes with zero React rerenders, while window-size dependencies
are resolved independently for each mounted surface.

## Phase 3 — native paint adapters (implemented)

- ✅ Port gradients, gradient borders, and clip paths through the shared Apple
  CALayer appliers, including mount/recycle pruning and bounds invalidation.
- ✅ Port background images, multi/inset shadows, foreground filters, outlines,
  blend modes, continuous corners, and backdrop effects from UIKit views to
  AppKit layer-backed views.
- ✅ Use `NSImage` for cached raster loading and preserve async URL/tag-reuse
  validation and repeat tiling behavior.
- ✅ Use Core Image layer filters and background filters as the deterministic
  macOS 14 implementation.
- ✅ Verify that tag reuse clears every CALayer/descriptor registry before a new
  cell occupies the tag.

Animated gradient angles remain static on the tested React Native macOS
`0.81.9` / Reanimated combination. That Reanimated build calls the platform's
ObjC Timing TurboModule, which throws on macOS; Hermes `0.12` then crashes while
converting the exception. NitroCSS therefore does not load the Reanimated host
or its RAF gradient-angle driver on this version pair. Static gradients and all
other native paint paths remain available without a React rerender.

Exit criterion: the effects and backgrounds examples visually match iOS within
the documented platform differences in light, dark, and high-contrast modes.

## Phase 4 — components and ecosystem coverage (implemented)

- ✅ Validate View, Text, Image, ScrollView, FlatList, SectionList, Pressable,
  TextInput, Switch, and ActivityIndicator wrappers.
- ✅ Test hover, focus-visible, keyboard navigation, pointer interaction, RTL,
  window resizing, and desktop font scaling.
- ✅ Exercise native grid, responsive/container state, CSS math, semantic
  colors, and
  `macos:`/`native:` variant precedence.

The example sidebar now has dedicated Core components, Pointer & keyboard, and
Responsive layout destinations. Their tests exercise controlled text input,
switch state, press activation, selection/navigation state, responsive grid,
CSS `clamp()`, RTL ordering, and macOS/native variant output.

Optional ecosystem gate for the tested `0.81` pair:

| Integration | Status | Reason |
| --- | --- | --- |
| React Native SVG | not enabled | no explicitly tested macOS peer is installed in the consumer example |
| Reanimated `4.5` | guarded | its ObjC Timing TurboModule throws on RN macOS `0.81.9`; NitroCSS keeps the compiled steady-state style and does not load the animation host |
| Gesture Handler `3.0` | not enabled | the package is not part of the macOS consumer graph |
| FlashList | not enabled | no macOS-supported consumer version is installed; core FlatList/SectionList remain covered |

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
