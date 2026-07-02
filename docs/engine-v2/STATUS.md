# Engine v2 — research STATUS board

_Maintained by the orchestrator (monitor). Updated as research workers report. **No engine code
until every research doc below is `DONE` and reviewed.**_

## Phase: RESEARCH (no code)

| # | Research file | Area | Worker focus | Status |
|---|-----|------|--------------|--------|
| 1 | `research/gradient-ios.md` | iOS | CAGradientLayer axial/radial, RCTLinearGradient/RCTRadialGradient, RCTBackgroundImageUtils sizing/clip | DONE |
| 2 | `research/gradient-android.md` | Android | LinearGradient/RadialGradient Shader, GradientDrawable, rounded-corner clip | DONE |
| 3 | `research/gradient-jscpp.md` | JS/C++ | descriptor from compiler fold, HybridView spec, View child render, Reanimated surface | DONE |
| 4 | `research/grid.md` | JS/C++ | GridLayoutEngine API, LayoutObserver/LayoutMetrics hook, ShadowTreeMutator commit, remove onLayout | DONE |
| 5 | `research/css-parser.md` | JS/C++ | RN react/renderer/css parsers → our own C++ value parser (oklch etc.) | DONE |
| 6 | `research/virtualization-ios.md` | iOS | VirtualView hiding, RCTVirtualViewContainerState, offscreen hidden=YES | DONE |
| 7 | `research/virtualization-android.md` | Android | VirtualViewContainerStateExperimental IntervalTree, ViewManager recycling | DONE |
| 8 | `research/virtualization-jscpp.md` | JS/C++ | culling (sliceChildShadowNodeViewPairs, CullingContext) over shadow nodes for nitrolist | DONE |
| 9 | `research/animation.md` | JS/C++ | Reanimated for the gradient view now; C++ AnimationBackend + ViewTransition later | DONE |
| 10 | `research/filters.md` | iOS/Android | SwiftUI/RenderEffect filter path for native `filter` blur/effects | DONE |

_All 10 workers launched (background). Docs merged into per-engine files after review._

Status values: `pending` → `researching` → `DONE` → `reviewed`.

## Phase: RESEARCH — **COMPLETE (10/10 DONE)**. Now: **IMPLEMENT** (decisions locked below).

## Decisions (locked by user)
1. **Gradient theme reactivity → NATIVE.** The C++ engine commits new gradient colors to the
   gradient view on theme/scheme change (no JS re-render). → gradient view is a linked node the
   engine updates; C++ fold emits the descriptor and the mutator commits it.
2. **Radial fidelity → approximation for v1** (CAGradientLayer / ellipse matrix); revisit if needed.
3. **CSS parser → reuse RN where it exists, own the gaps.** Use RN's `react/renderer/css/`
   (`CSSColor`, `CSSFilter`, …) for supported types; build our own only for what RN lacks
   (`oklch/oklab/lab/lch/color()/color-mix()`). Replace our shims with RN's once RN adds them.
   JS "emit raw" + C++ "parse at commit" must land together; match culori's per-channel clip.
4. **`nitrolist` → deferred, documented.** `display:none` visibility-commit for v1; separate future
   package. Consolidated in `docs/engine-v2/nitrolist.md`. Not built now.
5. **Filters → hybrid, with the C++ parser.** RN prop for Android color-matrix + iOS
   opacity/brightness; engine owns iOS blur (CoreImage) + Android RenderEffect. Fix
   `backdrop-filter`→`filter` collapse.

**Build order:** 1) grid wiring → 2) gradient HybridView (native-committed colors) → 3) C++ CSS
value parser → 4) filters (with parser). Cross-cutting interop anytime. Each task = one agent,
sequenced (shared files), built + verified between.

## Cross-cutting findings (synthesis)
- **Nitro HybridView is the vehicle** and requires no new native-module plumbing: nitro-modules
  0.35.10 ships first-class `HybridView` (Swift + Kotlin bases), and `packages/nitrowind` already
  has nitrogen autolinking (`nitro.json`, iOS podspec globs `ios/**`, Android `+autolinking`).
  Adding a gradient view = spec + Swift + Kotlin + `nitro.json` entry + codegen. The deleted
  `nitrolist` used the *old* Paper `SimpleViewManager` pattern — **do not copy it**; use HybridView.
- **Gradient is a fill, not a tiled background** → we skip RN's `RCTBackgroundImageUtils` sizing
  entirely; map descriptor → `CAGradientLayer` (iOS) / `Shader`+`Canvas` (Android) directly. RN's
  gradient math (angle→points, radial ellipse matrix, color-stop fixups) is `internal`/private →
  **port the algorithms**, don't depend on them.
- **The C++ `GridLayoutEngine` is compiled dead code** — wiring it is the container-query pattern
  verbatim (`LayoutObserver` reads `LayoutMetrics` → `ShadowTreeMutator` commits absolute item
  boxes, no re-render, converges in one frame). ⚠️ Likely off-by-one in `offsetFor` (never run).
- **RN's `react/renderer/css/` value parser** is available (prebuilt headers) but has a TODO gap:
  no `oklch/oklab/lab/lch/color()/color-mix()`. Vendor a trimmed `nitrocss::css` module (reuse RN
  algorithms + add the modern-color path), parse at commit time; JS then emits raw CSS.
- **Culling can't emit mutations directly** (RN culls inside the differ; our mount hook is
  observe-only) → `nitrolist` culls via commits that change the tree the differ sees
  (`display:none` v1; structural pruning later). Live scroll offset is the one value NOT in the
  shadow tree → must be sourced from the mounted scroll view.
- **Animation stays on Reanimated (translate-swept gradient).** Even the FUTURE C++ AnimationBackend
  has `TRANSFORM/BACKGROUND_COLOR/FILTER` PropNames but **no background-image PropName** → native
  gradient-position animation needs a new PropName / rawProps path regardless. `viewTransitionEnabled`
  → native CSS transitions later.

## Open questions / decisions needed (for the user)
1. **Gradient theme reactivity ownership:** JS re-render of a dedicated `<GradientLayer>` (owns a
   Theme/ColorScheme subscription) vs. native prop-commit from the C++ engine. (Recommend JS for v1.)
2. **Radial fidelity:** accept `CAGradientLayer`/ellipse-matrix approximation vs. manual gradient
   drawing for exact CSS radial positions/sizes.
3. **CSS parser scope + parity:** own oklch→sRGB must match culori's per-channel clip (not CSS-4
   gamut mapping) to keep first-paint(JS)/first-commit(C++) identical; JS "emit raw" + drop-culori
   must land in the same change. Reuse RN `CSSFilter.h`/`CSSColor` grammar vs. fully own it.
4. **`nitrolist` Hidden semantics:** detach children (unmount) vs. `hidden`/`display:none` — affects
   accessibility and blank-flash; and recycler-vs-own-pool.
5. **Filters:** hybrid (RN prop for Android color-matrix + iOS opacity/brightness; engine owns iOS
   blur via CoreImage + Android RenderEffect) — confirm, plus fix the `backdrop-filter`→`filter`
   collapse bug in `parsers/filter.ts`.

## Known bugs surfaced (fix regardless of v2 direction)
- `%`-drop in transform keyframes: `translateX(-18%)` → `-18` px (`parsers/animations.ts` lengthToNumber has no `%` branch).
- Theme toggle can restart running animations: memoize `animationName`/entering by animation identity, not by `snapshot`.
- Grid `offsetFor` probable off-by-one (C++ engine never executed).
- `backdrop-filter` wrongly folded into `filter`.

## Recommended build order (unchanged, now evidence-backed)
1. **Grid wiring** (bounded; engine exists) → 2. **Gradient HybridView** (3 platform docs ready) →
3. **C++ CSS value parser** → 4. **`nitrolist`** (separate package). Cross-cutting: **universal
interop** (cssInterop + svg preset) can land anytime.

## Notes
- Reanimated is the animation engine for v2; `cxxNativeAnimatedEnabled` is a later adoption.
- `nitrolist` is a separate package; docs 6–8 are its groundwork, not core.
- Keep everything rename-agnostic (family rename is a later mechanical pass).
