# nitrocss engine v2 — own the native styling stack (research-first master plan)

> **2026-07 note:** the package restructure landed on this branch — the engine now ships as
> **`@nitrofoundation/nitrocss`** (`packages/nitrocss`: native engine + runtime + components +
> plain-CSS compiler) with **`@nitrofoundation/nitrowind`** as the Tailwind wrapper. Historical
> `packages/nitrowind/...` paths below map to `packages/nitrocss/...`. Plan text otherwise
> preserved as written.

## Context & intent (corrected)

This is a **major** initiative to make nitrowind/nitrocss a **self-contained native styling
engine** that **builds its own** implementations of advanced capabilities and integrates them
directly with the Fabric shadow tree — rather than depending on React Native's *experimental*
features / feature flags. Where earlier research said "consume RN's flag," the intent is now to
**own an equivalent engine** modeled on how RN does it, wired into nitrowind's shadow-node layer.

Fixed constraints from the user:
- **Do NOT rely on RN's experimental gradient path** (`experimental_backgroundImage` +
  `enableNativeCSSParsing`). Build **our own gradient engine**, extended from RN's rendering
  approach (CAGradientLayer / Android shader), designed to be animatable.
- **Animation:** use the **Reanimated** engine now; adopt RN's C++ `cxxNativeAnimatedEnabled` /
  shared AnimationBackend **later** when it's stable.
- **`nitrolist`** will be a **separate future package** (list virtualization / culling /
  recycling); the culling/virtual-view/recycling research is groundwork for it — don't fold it
  into core.
- **Native grid layout** is wanted (a C++ `GridLayoutEngine` already exists, unwired).
- The **project family will be renamed** later → keep engine/package naming decoupled; avoid
  hardcoding the current name in new engine internals; defer naming decisions.
- **Research-first:** a multi-worker swarm thoroughly documents *how each RN engine works* and
  *exact build steps* in a detailed MD **before any code is written**.
- **Docs** live in a new `docs/` folder; move the plan(s) there.
- **Git:** push current work (with proper `.gitignore`s), then do all v2 work on a new branch
  **`feat/nitrocss-engine-v2`**.

---

## Execution sequence (what happens once plan is approved)

### Step 0 — Repo setup (git)
1. Ensure `.gitignore` covers build artifacts (`lib/`, `nitrogen/generated/`, vendored
   `packages/nitrowind/cpp/nitrocss/`, `*.d.ts`/`.js` build output, DerivedData, Pods) — already
   restored this session; verify.
2. Commit + push current work on the current branch.
3. Create and switch to **`feat/nitrocss-engine-v2`**; all v2 work happens here.

### Step 1 — Docs scaffold
- Create `docs/` and move the plan(s) there (`docs/engine-v2/README.md` as the master index).
- One file per engine under `docs/engine-v2/` (e.g. `css-parser.md`, `gradient-engine.md`,
  `grid-engine.md`, `virtualization.md` (nitrolist), `animation.md`).

### Step 2 — Research swarm (read-only, ~10 workers + 1 monitor) → detailed docs, NO code yet
Segment by concern; each worker deeply reads RN's implementation and writes a step-by-step
"how it works + how we rebuild it, integrating with our ShadowTreeMutator/LayoutObserver" doc:
- **iOS workers (≈3):** CAGradientLayer/radial internals; how RN's `RCTViewComponentView` +
  `RCTBackgroundImageUtils` build gradient layers; iOS view culling / VirtualView hiding; SwiftUI
  filter path.
- **Android workers (≈3):** Linear/Radial `Shader`/`GradientDrawable`; `ViewManager` recycling
  (`setupViewRecycling`/`prepareToRecycleView`); `VirtualViewContainerStateExperimental` IntervalTree.
- **JS / C++ workers (≈3):** RN `react/renderer/css/` value parsers (to model our own C++ parser);
  the shadow-tree commit + `LayoutObserver` layout-metrics hook (grid + culling integration);
  compiler descriptor shapes; Reanimated integration surface for our gradient view.
- **Monitor (1):** maintains `docs/engine-v2/STATUS.md` — per-worker progress, what each engine
  needs, open questions, and the ordered build steps — updated continuously.
- Gate: **no engine code until the docs are complete and reviewed.**

### Step 3 — Implement per docs (later, after research review)
Build order (each its own engine, shadow-node-integrated, rename-agnostic):
1. **Native grid engine** — wire the existing C++ `GridLayoutEngine`
   (`packages/nitrocss/cpp/grid/`) via `LayoutObserver` (reads `LayoutMetrics`) → engine →
   `ShadowTreeMutator::commit` per-item `{left,top,width,height}`; remove the `onLayout` JS
   fallback on native (keep for web). Kills the reflow/flicker.
2. **Own gradient engine** — a Nitro HybridView gradient component (iOS CAGradientLayer / Android
   shader), fed a structured `--nitrocss-gradient` descriptor from the compiler fold; rendered as
   an absolutely-filling background child of `View` with border-radius clipping; **Reanimated**
   drives its transform/position animation. Drops `experimental_backgroundImage` +
   `enableNativeCSSParsing`.
3. **Own native CSS value parser (C++)** — parse colors (incl. `oklch/oklab/lab/lch`→RGBA),
   lengths, transforms, gradient/filter syntax in the engine, so the JS compiler stops
   pre-lowering (culori/`toRNValue`) and we don't depend on RN's native parser.
4. **`nitrolist` (separate package, future)** — our own list virtualization + view culling +
   recycling over shadow nodes, informed by the RN research.

### Cross-cutting: universal interop (JS, can land anytime)
`import {View} from 'react-native'` already rewrites to our wrapper; harden it, and add a
`cssInterop(Component, mapping?)` + react-native-svg preset so className works on any component
(svg, custom native). Rename-safe (API names may change with the family rename).

---

## Research appendix — RN flags, re-verdicted to "own our equivalent"

(Full mechanism notes retained from the four research agents; verdicts updated to the build-our-own
intent.)

**Build our own engine modeled on these (do NOT ship RN's flag):**
- **Gradient rendering** (RN `experimental_backgroundImage`, `RCTLinearGradient`/`RCTRadialGradient`,
  `BackgroundImagePropsConversions`) → our own gradient HybridView + descriptor. Animatable via
  Reanimated.
- **View culling** (`sliceChildShadowNodeViewPairs.cpp`, `CullingContext.cpp`, `viewCullingOutsetRatio`)
  → our own culling for `nitrolist` over shadow nodes.
- **Virtual-view state** (`VirtualViewContainerStateExperimental.kt` IntervalTree,
  `RCTVirtualViewContainerState.mm`, `hideOffscreenVirtualViewsOnIOS`) → our own virtualization for
  `nitrolist`.
- **View recycling** (`ViewManager.setupViewRecycling`/`prepareToRecycleView`,
  `enableViewRecycling*`) → our own ShadowNode/view pooling for `nitrolist`.
- **Native CSS parsing** (`enableNativeCSSParsing`, `react/renderer/css/`, `*PropsConversions.h`) →
  our own C++ value parser.
- **Grid** — C++ `GridLayoutEngine` exists; wire it (native, no onLayout).

**Adopt later / from Reanimated for now (animation):**
- **`cxxNativeAnimatedEnabled` + `useSharedAnimatedBackend`** (`ReactCommon/react/renderer/animated/`,
  `animationbackend/`, `Scheduler.cpp`) — the C++ shared AnimationBackend. *Later.* Use Reanimated now.
- **`viewTransitionEnabled`** (`Scheduler.cpp` ~163, `MountingOverrideDelegate`) — native CSS
  transitions. *Later.*
- **`enableSwiftUIBasedFilters`** (`FilterPropsConversions.h`, SwiftUI/RenderEffect) — native
  `filter` blur/effects. *Later, with the native parser.*

**Respect / pass-through (RN infra, not ours to rebuild):**
- **`preventShadowTreeCommitExhaustion`** (`ShadowTree.cpp` ~300/588/598) — our `ShadowTreeMutator`
  must use the same 3-attempt+`recursive_mutex` strategy to avoid commit starvation.
- **`enableSchedulerDelegateInvalidation`** — don't capture `SchedulerDelegate` in our commit
  callbacks.
- **`enableAccessibilityOrder`** — pass through.
- **`enableImperativeFocus` / `enableKeyEvents`** — pass through; consume for `:focus`/`:focus-visible`
  pseudo styling.
- **`enableMutationObserverByDefault`** — pass through (low priority; our C++ engine sees mutations
  directly).

---

## Notes / risks
- Enormous scope — this is a multi-milestone v2 rebuild; the research-first docs are the gate.
- Nitro HybridView maturity: spike iOS gradient view first.
- Rename: keep new engine code name-agnostic; the family rename is a later mechanical pass.
- Grid/gradient/parser each land independently and are individually verifiable in the example app.

## Immediate next action (on approval / plan-mode exit)
Do Step 0–1 (git push + `.gitignore` + `feat/nitrocss-engine-v2` branch + `docs/` scaffold, move
plans), then launch the Step 2 research swarm and the monitor-maintained `docs/engine-v2/STATUS.md`.
No engine code until those docs are reviewed.
