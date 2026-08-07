# Engine v2 — own the native styling stack

> Branch: `feat/nitrocss-engine-v2`. **Research-first: no engine code lands until the per-engine
> docs below are complete and reviewed.** Naming is intentionally kept generic — the project
> family will be renamed later, so engine internals avoid hardcoding the current name.

> **2026-07 restructure:** the engine described here now ships as
> **`nitrocss`** (`packages/nitrocss` — C++ engine, iOS/Android natives,
> TS runtime, components, plain-CSS compiler), with **`nitrowind`** as a thin
> Tailwind wrapper on top. Older `packages/nitrowind/...` code paths in these docs map to
> `packages/nitro-css/...`; artifact markers are `--nitrocss-*`. See `STATUS.md` (2026-07-03).

## Intent

Make the styling engine **self-contained and native**: build our **own** implementations of
advanced capabilities and wire them into the Fabric shadow tree via our existing
`NitroCssEngine` / `ShadowTreeMutator` / `LayoutObserver`, instead of depending on React
Native's *experimental* features and feature flags.

- **Gradients:** our own engine (Nitro HybridView; iOS `CAGradientLayer`, Android shader),
  modeled on RN's rendering but not using `experimental_backgroundImage` /
  `enableNativeCSSParsing`. Animatable.
- **Animation:** **Reanimated** now; adopt RN's C++ `cxxNativeAnimatedEnabled` / shared
  AnimationBackend later.
- **Grid:** wire the already-existing C++ `GridLayoutEngine` (native, no `onLayout`).
- **CSS values:** our own C++ value parser (colors incl. `oklch/oklab/lab/lch`, lengths,
  transforms, gradient/filter syntax).
- **`nitrolist`:** a **separate future package** — our own list virtualization / view culling /
  recycling over shadow nodes (the RN research here is its groundwork).

## Build order (after docs are reviewed)

1. **Grid engine** — wire `packages/nitro-css/cpp/grid/GridLayoutEngine` via `LayoutObserver`
   (`LayoutMetrics`) → engine → `ShadowTreeMutator::commit` per-item box; drop the native
   `onLayout` fallback (keep for web).
2. **Gradient engine** — HybridView + compiler `--nitrocss-gradient` descriptor; background
   child of `View` with border-radius clipping; Reanimated-driven animation.
3. **Native CSS value parser (C++)** — stop JS pre-lowering (culori/`toRNValue`).
4. **`nitrolist`** (separate package) — virtualization/culling/recycling.

Cross-cutting (JS, anytime): universal interop — harden `import {View} from 'react-native'`
rewrite + `cssInterop()` + react-native-svg preset.

## Docs in this folder

- `STATUS.md` — live progress board (maintained by the monitor).
- `gradient-engine.md` — how RN renders gradients (iOS/Android) + our engine design.
- `grid-engine.md` — RN/Yoga layout + our native grid wiring.
- `css-parser.md` — RN `react/renderer/css/` value parsers + our C++ parser design.
- `virtualization.md` — RN culling/virtual-view/recycling → `nitrolist` design.
- `animation.md` — Reanimated integration now; C++ AnimationBackend / ViewTransition later.

The approved master plan (with the full RN feature-flag research appendix and OWN/USE/CONSUME/PASS
verdicts) is preserved at `docs/engine-v2/master-plan.md`.
