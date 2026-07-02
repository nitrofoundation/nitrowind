# nitrolist — native list virtualization (DEFERRED, separate future package)

> **Status: not implemented.** This consolidates the virtualization research as the spec for a
> future standalone `nitrolist` package. Build order puts it last (after grid, gradient, CSS
> parser). Kept rename-agnostic.

Source research (full detail): `research/virtualization-ios.md`, `research/virtualization-android.md`,
`research/virtualization-jscpp.md`.

## What it is
Our own list/scroll **virtualization + culling + view pooling** built over the Fabric shadow tree
via the engine's existing primitives (`LinkedNode` handles, `LayoutObserver` layout metrics,
`ShadowTreeMutator` commits) — **not** RN's `enableViewCulling` / VirtualView flags.

## v1 decision (locked)
- **Off-screen = `display:none` visibility-commit** (reuses `ShadowTreeMutator`; no structural
  tree edits). Structural unmount + pooling is a later version.
- We **cannot** emit `ShadowViewMutation`s directly (RN culls inside the differ; our mount hook is
  observe-only) → we change the tree the differ sees, via prop commits.

## Core model (from research, portable C++)
- **P/V/PV state machine** (from Android `VirtualViewContainerStateExperimental.kt`): compute
  `V'` (viewport) and `PV'` (viewport inflated by a prerender ratio, RN default 5.0), derive
  `P' = PV' − V'`, act only on deltas (`toVisible`, `toPrerender`, `toHidden`). Exclusive overlap
  test (edge-touch ≠ overlap).
- **1D fast path:** sorted item offsets → binary search for dense uniform lists; AVL interval tree
  fallback for variable/overlapping/masonry.
- **Item frames** come from `LayoutObserver` (`getLayoutMetrics().frame`), NOT native `onLayout`.
- **The one value not in the shadow tree** = live scroll offset → must be sourced from the mounted
  scroll view (iOS `UIScrollView` delegate; Android scroll listener). This is the only
  platform-native touch-point.
- **Pooling (later):** per-ViewManager, per-surface pool keyed by `itemType`; reset allowlist
  modeled on RN `BaseViewManager.prepareToRecycleView`.

## Proposed layout (when built)
- `packages/nitrolist/` — its own package (spec + iOS Swift + Android Kotlin + shared C++
  `cpp/virtualization/`: `ViewportCuller` / `ListRegistry` / `ListMountObserver` / `ListCommitter`).

## Open questions (deferred)
- Hidden = detach (unmount children) vs. `display:none` (a11y + blank-flash tradeoff) — v1 picks
  `display:none`.
- Recycler pool vs. our own ShadowNode pool; reset allowlist correctness.
- Prerender window sizing; RTL; single-item update storms; thread-safety with commit retries
  (`preventShadowTreeCommitExhaustion`).
