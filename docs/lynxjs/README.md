# Lynx reference research

Study of [lynx-family/lynx](https://github.com/lynx-family/lynx) (ByteDance's open-source native
UI engine) as a reference for our own native styling/rendering + list engine. Source-grounded
(GitHub source + lynxjs.org docs), inferred-vs-confirmed tagged, each doc ends with concrete
"lessons for us."

## Docs
- **`architecture.md`** — 4-actor threaded pipeline (UI / element-tree(TASM) / layout / JS),
  PrimJS (QuickJS fork; JS object model == element tree), versioned `StyleResolve → Layout →
  UIOpFlush` pipeline with stage-skipping, own layout engine **Starlight** (not Yoga), native C++
  animation engine (`core/animation`: transition + keyframe managers, transform curves, worklets).
- **`backgrounds-filters.md`** — own C++ CSS parser (`core/renderer/css/`), gradients parsed to a
  **compact numeric descriptor** (platform paints with zero string parsing); iOS CoreGraphics
  raster + `CAGradientLayer` fast path with `fixPoints()` angle correction; Android `Shader` on
  Paint; ellipse = circle + axis scale; border-radius = clip rounded-rect. Filters: iOS private
  `CAFilter`, Android `RenderEffect`. **No `oklch/oklab/lab/lch/color-mix` — sRGB-8-bit only.**
- **`list-performance.md`** — virtualization brain in shared **C++ (`core/list/`)** over a *dumb*
  native scroll view (not UICollectionView/RecyclerView); no JS on the scroll frame (native scroll
  → C++ `ListEngineProxy`); compile-time reuse keys (`ReusePool` CREATE/REUSE/UPDATE); off-thread
  parallel item build; `ListAnchorManager` for viewport stability.

## Top takeaways for engine-v2
1. **Numeric gradient descriptor** (not a CSS string) → platform paint is trivial + fast. Validates
   our `--nitrowind-gradient` fold. Port Lynx's `fixPoints()` angle correction + ellipse-from-circle.
2. **We're ahead on color** — Lynx has no modern color spaces; our oklch C++ path is net-new value.
3. **Filters:** iOS `CAFilter` (private) or CoreImage; Android `RenderEffect` — matches our hybrid plan.
4. **Native-driven scroll/cull with no JS round-trip** is the core of list speed → drive our
   `ShadowTreeMutator` from a native scroll tap; layer a Lynx-style reuse pool onto our P/V/PV +
   interval-tree model; add an anchor manager. (Our interval-tree beats Lynx's frame-walk for random
   `scrollToIndex`.)
5. **Pipeline discipline:** versioned, stage-skipping style→layout→flush, vsync-batched commits —
   adaptable over our C++ bucket resolution + `ShadowTreeMutator`.
6. **Honest constraint:** we run on RN's Fabric/Yoga — we can't own the layout engine, JS runtime, or
   layout-thread scheduling the way Lynx does; anything layout-affecting must route through Fabric.
