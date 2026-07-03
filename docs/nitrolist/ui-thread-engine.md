# NitroList — the UI-thread engine (re-architecture)

> Supersedes the JS-windowing first cut (`src/internal/virtualWindow.ts` + the three
> variant components). That cut ran the scroll→window→reveal loop on the **JS thread**
> (real ScrollView + `onScroll` + React re-render), which is what every existing JS list
> already does and blanks under JS-thread load. This doc is the native, UI-thread design,
> synthesized from a 6-agent deep-read of RN 0.86 `node_modules` + our `packages/nitrocss/cpp`.

## The one distinction that reframes everything

There are **two** different "off-thread" moves (the existing `docs/nitrolist/*` conflate them):

1. **Off-thread measurement** — compute item sizes on a worker thread (Texture/Litho). Portable; nitrocss already reads exact frames off the committed tree via `LayoutObserver`.
2. **Off-thread FILL** — the per-frame *scroll → decide-which-cells-exist → populate* loop, running on the **UI thread with zero JS-thread round-trip**. Only **Lynx** and **Valdi** have this. FlashList v2, Legend List, **and RN's own `unstable_VirtualView`** do NOT — `experimental_flushSync` is a *synchronous JS render on the logic thread* triggered from a UI-thread event, so a busy JS thread blanks it exactly like FlashList.

nitrolist's goal is **#2**. The realistic delivery is Valdi's *committed-window* model; Lynx's *template fill* is a larger layer on the same core.

## Confirmed mechanisms (all in RN 0.86 `node_modules` / our cpp)

- **Scroll in (UI thread, no JS):** iOS `RCTScrollViewComponentView` exposes `scrollViewDelegateSplitter` + `-addScrollListener:`; attach an `NSObject<UIScrollViewDelegate>` resolved by tag via `RCTSurfacePresenter -findComponentViewWithTag_DO_NOT_USE_DEPRECATED:` (the GradientApplier pattern). `scrollViewDidScroll:` fires per frame on main. Android: own a `ReactScrollView` subclass and hook `onScrollChanged` (UI thread, **unthrottled** — the global `ReactScrollViewHelper.addScrollListener` is throttled by `scrollEventThrottle`). RN's own `RCTVirtualViewContainerState.mm` / `VirtualViewContainerStateClassic.kt` are the reference — read them.
- **Window math (C++):** our `packages/nitrolist/cpp/Virtualizer.hpp` (Fenwick, O(log n) `offset`/`indexAt`) + `ViewportCuller.hpp` (P/V/PV window + `changed()` delta), called directly from the scroll callback (Obj-C++ `#include`s the hpp; Android via a thin inbound JNI like `GradientApplierJNI.cpp`).
- **Commit without React render (same frame):** `ShadowTreeMutator::commit` (`packages/nitrocss/cpp/fabric/ShadowTreeMutator.cpp`) addresses nodes by stable `ShadowNodeFamily`, merges props via `cloneProps`, one `ShadowTree::commit({.enableStateReconciliation=false})` per surface. Defaults `mountSynchronously=true`, `source=Unknown` → issued **on the main thread it diffs+mounts re-entrantly before `commit()` returns**, and bypasses commit-branching (`source!=React`). `NitroCssCore::syncGrids` already commits `position:absolute`+`left/top/width/height` to arbitrary child families this way — the working precedent.
- **Off-thread measure (when needed):** `SurfaceHandler::measure` is the exact clone-a-committed-subtree + `layoutIfNeeded()` + read `getLayoutMetrics().frame.size` pattern, under a shared-lock (no JS affinity). Yoga is thread-safe per independent tree (`thread_local threadLocalLayoutContext`); text measure is `@AnyThread` (mutex-guarded caches; Android workers must be JVM-attached).
- **No visual jump:** iOS mVCP is a native mount-transaction observer (`RCTScrollViewComponentView` will/did-mount: snapshot anchor cell frame, then `contentOffset += delta` atomically pre-paint). Emulate it; use `Virtualizer::offset(index)` for anchor math.
- **Positions:** flow **C++ → per-cell Fabric state slots**, never JS-worklet→SharedValue (Legend List's *own* rejected experiment proves worklet positioning "renders on a different thread" and breaks the React flow).

## Architecture (per scroll frame — entirely off the main JS thread)

```
iOS UIScrollViewDelegate.scrollViewDidScroll: / Android ReactScrollView.onScrollChanged  (UI thread, native)
   │  contentOffset (+ adjustedContentInset, container-relative rect for RTL)
   ▼
nitrolist::ScrollObserver::onScroll(listId, offset)          (C++, UI thread, no JS)
   │  Virtualizer.indexAt() + ViewportCuller.update()  →  window delta (changed())
   ▼
nitrolist::ListCommitter                                     (C++)
   │  for cells crossing the window boundary: NodeMutation{family, {display: none|flex}}
   │  (cells are absolutely positioned by owned layout → display:none does NOT reflow siblings)
   │  gate on ViewportCuller.changed() (anti-self-retrigger, like grid's gridLastWidth_)
   ▼
nitrolist::FabricAccess → nitrocss ShadowTreeMutator::commit(batch)   (reused, main thread, no React render)
   │  merges DISJOINT keys (display/opacity/left/top/width/height) — never nitrocss style props
   ▼
same-frame diff + mount (mountSynchronously) + mVCP-style anchor correction via a UIManagerCommitHook
```

- **Cells stay React-owned** (100% ecosystem compat) and are committed to the ShadowTree once. Steady-state scroll (hide/show already-committed cells) is then **zero JS, zero React render**. This is Valdi's committed-window property, memory-bounded to a few-thousand cells.
- **JS does:** first render of the cell subtrees (one time), and cold-path control (register list, `scrollToIndex`) via a Nitro HybridObject. Not the per-frame loop.

## Isolation from nitrocss (hard requirement)

- nitrolist depends on nitrocss ONLY through a thin `nitrolist::FabricAccess` facade over `NitroCssInstaller::shared().uiManager()/contextContainer()` + `ShadowTreeMutator::commit`. It never touches `cpp/css`, gradient/clip/bgimage registries, or `NitroCssCore::resolveForNode`.
- Window props use a **disjoint key set** from nitrocss style props, so `cloneProps` merges (window commit ⟂ style commit; theme recompute can't clobber the window and vice-versa).
- Register nitrolist's own `UIManagerMountHook`/`UIManagerCommitHook` (multiple registrants supported) — separate from nitrocss's `LayoutObserver`.

## Build order

1. **UI-thread core (this rework).** iOS-first: native scroll observer (attach-by-tag) → `ScrollObserver` (C++, reuse Virtualizer/ViewportCuller) → `ListCommitter` → `ShadowTreeMutator` display:none commit. Cells committed once (Valdi model). Nitro HybridObject control surface + a JSI `__nitrolistSetViewport`-style channel (mirror `installGradientAngleHostFunctions`). Verify: scroll on iOS hides off-window cells natively with **no `onScroll` in JS and no React re-render per frame**. Then Android.
2. **Off-thread pre-measure** (`measureCell` = retargeted `SurfaceHandler::measure`; worker pool + serial commit queue) → exact first-paint frames, variable heights.
3. **mVCP anchor correction** via commit hook; sticky/snap/RTL; velocity-directional buffers; per-frame budget.
4. **Native detach (Valdi V2)** via a `MountingOverrideDelegate` suppressing Create/Insert for out-of-window cells (true view non-realization + reorder; chains after Reanimated's `LayoutAnimationsProxy`).
5. **Lynx template fill** (unbounded, off-thread *fill*): Metro template compiler → element descriptor + binding bytecode → C++ BindingVM; nitrocss style tables make conditional classes pure-C++. Stronger than Lynx (no JS engine on the hot path; `WorkletRuntime::runSync` as the narrowed MTS/formatter hatch).

## Reference files (read when implementing)
- Scroll attach: `node_modules/react-native/React/Fabric/Mounting/ComponentViews/ScrollView/{RCTScrollViewComponentView.mm,RCTVirtualViewContainerState.mm,RCTEnhancedScrollView.mm}`; Android `ReactScrollView.java`, `ReactScrollViewHelper.kt`, `VirtualViewContainerStateClassic.kt`.
- Commit/mount: `ReactCommon/react/renderer/mounting/ShadowTree.cpp` (tryCommit/mount, options defaults), `scheduler/Scheduler.cpp`, iOS `RCTMountingManager.mm`; mVCP `RCTScrollViewComponentView.mm` (will/did-mount).
- Off-thread measure: `ReactCommon/react/renderer/scheduler/SurfaceHandler.cpp:192`, `components/view/YogaLayoutableShadowNode.cpp` (thread_local ctx).
- Override delegate / hooks (multi): `mounting/MountingCoordinator.cpp`, `core/UIManager.cpp`; Reanimated `ReanimatedCommitHook.cpp`, `LayoutAnimationsProxy_*`.
- Reuse: `packages/nitrocss/cpp/{NitroCssInstaller.*,fabric/ShadowTreeMutator.*,fabric/LayoutObserver.*,core/NitroCssCore.cpp (syncGrids)}`, `packages/nitrocss/ios/NitroCssGradientApplier.mm`, `packages/nitrocss/android/.../GradientApplier.kt` + `GradientApplierJNI.cpp`.
- Substrate: `node_modules/react-native-worklets/Common/cpp/worklets/WorkletRuntime/WorkletRuntime.h` (runSync), reanimated `useAnimatedScrollHandler` (per-cell effects only).
</content>
