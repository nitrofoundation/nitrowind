# NitroList — Architecture

> **2026-07 update:** see **[list-variants.md](./list-variants.md)** for the three planned variants
> sharing this core, plus findings that refine this doc: (1) the container state is a **Fenwick
> prefix-sum frame store** (we own layout, so no interval tree needed); (2) Lynx-grade sync fill is
> achievable via **build-time compiled template cells** in our own Metro transformer (restricted JSX
> subset → descriptor + binding bytecode; nitrocss style tables make bindings pure C++), with
> `WorkletRuntime::runSync` (react-native-worklets) as a data-only escape hatch; (3) Valdi validates
> the "virtualize views, keep fibers" model + a production-grade viewport-center scroll-anchoring
> algorithm; (4) RN's `unstable_VirtualView` confirms the sync-Discrete reveal mechanism is
> shipping-quality — borrow the mechanism, not the primitive.

> Companion: [list-plan.md](./list-plan.md) (API/product). This doc: internals, threading, and how it
> maps onto Fabric + the nitrocss engine. Facts below were verified against RN 0.86 sources, the Lynx
> repo, FlashList v2 source, Wishlist source + post-mortem, Shadowlist, Texture, and Litho.

## 0. Design thesis

Lynx proved the shape: **diff in the framework, recycle & lay out in the engine, scroll on the
platform thread, pull cells on demand.** Wishlist proved what kills it in RN: replacing React as the
cell renderer. FlashList v2 proved what JS alone can do — and its ceiling (everything rides the JS
thread; first frame renders empty; corrections are JS `useLayoutEffect` passes).

NitroList = Lynx's engine-side architecture **with React kept as the cell renderer**:

```
┌────────────────────────── JS thread ──────────────────────────┐
│ <NitroList> React component                                   │
│  · renders ONLY the engine-requested window (assigned keys)   │
│  · FlashList-v2-style key reassignment => cells recycle via   │
│    React reconciliation (stable key, new item props)          │
│  · hooks: useRecyclingState / useRecyclingEffect / context    │
└──────────────┬────────────────────────────────────────────────┘
               │ data changesets (insert/remove/move/update + itemKeys,
               │ estimated sizes, fullSpan/sticky flags)   [Lynx list_data model]
┌──────────────▼──────────── C++ core (nitrolist engine) ───────┐
│ Virtualizer        window computation, velocity-directional    │
│                    draw buffer, Texture-style range modes      │
│ LayoutManagers     linear / grid / staggered(waterfall)        │
│                    (grid math shared with nitrocss             │
│                    GridLayoutEngine)                           │
│ MeasureCoordinator off-thread pre-measure of item subtrees     │
│ AnchorManager      mVCP, exact contentSize, offset corrections │
│ DiffApplier        item-level changesets -> window updates,    │
│                    native update animations                    │
└──────────────┬────────────────────────────────────────────────┘
               │ commits / state updates / scroll math
┌──────────────▼──────────── platform ──────────────────────────┐
│ Phase 1: real RCTScrollView (full ecosystem contract)          │
│ Phase 2: NitroListScrollView — dumb native scroller à la Lynx  │
│          list-container (contentSize/offset pushed from C++)   │
└────────────────────────────────────────────────────────────────┘
```

## 1. Cell rendering & recycling (React-owned)

- **Render stack model** (validated by FlashList v2's `RenderStackManager`): the engine assigns
  stable *container keys* to item indices; leaving the window returns a key to a per-`itemType`
  pool; React sees the same key with new `item` props → the fiber and its host views are reused,
  not re-mounted. Cell wrappers are **custom host components** (never flattened by Fabric's
  view-flattening; RNGH's `Wrap` uses the same trick).
- **Legend-List-style signal positioning**: each cell subscribes only to its own `{x,y}` slot
  (C++ state → per-cell Fabric state update), so scrolling and corrections never re-render the list
  root. Positions are absolute frames computed by the C++ layout managers.
- `recyclable={false}` pins a key to an itemKey permanently (Lynx semantics).
- `defer` items follow Lynx's `isReady` handshake: placeholder at estimated size → background render
  → swap; `unmountRecycled` runs effect cleanup on recycle.
- Nitro's HybridViews (Fabric ShadowNode-backed, recycling-aware) are the implementation vehicle for
  the container + cell wrapper components — same infra nitrocss already ships (`BackdropView`).

## 2. Measurement — the actual differentiator

**Fact base (RN 0.86, verified):** Yoga is thread-safe for independent trees (yoga#769 contract; the
old `gDepth`/`gNodeInstanceCount` globals are gone; per-node `yogaConfig_`); ShadowNodes are immutable
+ clonable; **`SurfaceHandler::measure` already clones a committed tree and runs `layoutIfNeeded()`
on the caller's thread** — detached-tree measurement is in-tree precedent, not a hack. Text
measurement is `@AnyThread` on Android (`FabricUIManager.measureText`, StaticLayout off-main — the
Litho/PrecomputedText model) and TextKit-1-per-call on iOS (fresh NSLayoutManager per measure, cache
`SimpleThreadSafeCache`, callable from any thread).

**Pipeline:**
1. Cell subtree commits normally (JS thread). A `UIManagerCommitHook` (same registration Reanimated
   uses; RN supports **multiple** commit hooks and multiple `MountingOverrideDelegate`s since
   PR #44927) observes item-wrapper nodes.
2. `MeasureCoordinator` clones not-yet-measured item subtrees and lays them out on a **worker pool**
   (Texture's model: serial editing queue per list + work-stealing parallel-for across cores;
   `thread_local LayoutContext` keeps concurrent layouts isolated).
3. Measured exact sizes land in the Virtualizer; **contentSize is published in two phases**
   (measured-prefix + frozen per-type average × remainder — Shadowlist freezes the average so mVCP
   doesn't chase a moving anchor) and becomes exact once the low-priority full sweep finishes.
4. **Corrections are reconciled with offsets in the same commit**: anchor = first visible item ≥
   `minIndexForVisible`, `delta = newAnchorOrigin − oldAnchorOrigin` applied to contentOffset
   atomically, pre-paint, unanimated — the C++ version of what Fabric's own mVCP does in
   `mountingTransactionWillMount/DidMount`, but computed engine-side so the estimate is never
   observable at paint time. iOS container resizes wrap in the `preserveContentOffsetWithBlock`
   pattern while tracking/decelerating; Android re-aims flings (`scrollToPreservingMomentum`
   equivalent).
5. First paint: because we can measure clones *before* mounting, the initial viewport mounts with
   final frames — beating FlashList v2's known empty first render cycle.

**Commit/mount facts we rely on** (verified in ShadowTree.cpp / Scheduler.cpp): non-React commits
default to `mountSynchronously = true` — a commit made from the UI thread is diffed and mounted
re-entrantly before `commit()` returns; React commits defer mounting to let `useLayoutEffect` block
paint. Both behaviors are exactly what the correction path needs. `enableFabricCommitBranching` is
the current anti-starvation mechanism to watch across RN upgrades.

## 3. Scroll path & blank-avoidance

- Phase 1 scroller is a real `RCTScrollView` → full `NativeScrollEvent` fidelity for free.
  The engine consumes scroll offsets natively (iOS `scrollViewDidScroll` / Android `onScrollChanged`
  via our attached observer), computes the window in C++, and pushes cell position/state updates —
  the JS thread only renders newly-assigned cells.
- Velocity-directional draw buffer (FlashList/Legend: buffer scales with velocity and leads in the
  scroll direction) + Texture range tuning as defaults: display 1.0/0.5, preload 2.5/1.5 screenfuls,
  direction-swapping, with Minimum/LowMemory modes on memory pressure.
- Per-frame budgeting GapWorker-style: measured per-`itemType` create/bind running averages
  (¾ old + ¼ new) decide how many assignments fit before next vsync; the rest wait.
- **Sync prerender escape hatch (experimental):** RawEvent `Category::Discrete` +
  `EventEmitter::experimental_flushSync` gives "UI-thread event → synchronous React render →
  synchronous mount" — shipping today inside RN's `VirtualView`
  (`RCTVirtualViewComponentView::_dispatchSyncModeChange`). NitroList can use the identical recipe
  for imminent-cell prerender under fast fling, with a strict time budget (VirtualView's caveat:
  heavy cells now block the main thread).
- Blank truth: UI→JS→UI is 8–300 ms (Wishlist post-mortem). We don't pretend to eliminate blanks for
  arbitrary React cells under a saturated JS thread — we shrink them (native placeholders at engine
  frames, `defer` placeholders, sync-prerender for the next N cells) and never show layout jumps.

## 4. Layout managers (native features)

- **Linear / Grid / Waterfall** implemented in C++ over absolute frames (Lynx's
  `linear/grid/staggered_grid_layout_manager` split; waterfall = shortest-column fill;
  `fullSpan` breaks columns; grid rows match tallest item). Reuses/extends nitrocss's existing
  `GridLayoutEngine` where the math overlaps.
- **Sticky top & bottom** with push-out + recycling (Lynx `experimental-recycle-sticky-item`
  semantics), positioned by the engine, rendered as ordinary React cells pinned via their
  position slots.
- **Snap/paging**: `itemSnap {factor, offset}` → target-offset computation engine-side, exposed via
  `onSnap` before settle.
- **RTL**: engine mirrors all offset math (the perennial JS-list failure class).
- Container queries / `className` styling work in cells automatically via nitrocss (same ShadowTree).

## 5. Data & diffing

- `data` changes produce an **item-level changeset** in C++ (Myers diff on itemKeys — DiffUtil-class,
  runs off-thread; latest-wins like AsyncListDiffer/Litho): `{insertions, removals, moves, updates}`
  + per-index metadata (estimatedSize, fullSpan, sticky) — exactly Lynx's `list_data` payload shape.
- The changeset drives: window updates, native **update animations** (v2: engine-side mutation
  reordering via our own `MountingOverrideDelegate` — RN supports multiple delegates chained in
  registration order, Reanimated coexists; its LayoutAnimationsProxy is the reference
  implementation for postponing Delete mutations during exit animations), scroll-anchor preservation
  (`eventSource: 'diff'` scroll events, Lynx-style), and `onLayoutComplete.diffResult`.

## 6. Phase 2 — native container mode (opt-in)

Replaces RCTScrollView with a Lynx-list-container-style **dumb native scroller** (plain
UIScrollView / FrameLayout + custom scroller; Lynx maintainers explicitly abandoned
UICollectionView/RecyclerView for cross-platform consistency — we inherit that conclusion).
C++ pushes `targetContentSize` / `targetDelta` / child frames; sticky handled platform-side from
engine maps. Unlocks: a11y CollectionInfo ("item X of Y", VoiceOver scrolling past the window),
perfect large-title/tab-bar integration (the scroller is first-in-subview-chain), engine-owned
momentum interop. Gated on the RNGH upstream work (iOS `retrieveScrollView` whitelist / state
mirroring; Android `NativeViewGestureHandlerHook` + disallow-intercept orchestration +
`onChildStartedNativeGesture`) and on reimplementing the ScrollView contract items listed in
list-plan §4 — the interop research enumerates every known landmine with issue links.

## 7. What we reuse from this repo

| Existing asset (packages/nitrocss) | Use in NitroList |
|---|---|
| Nitro module scaffolding, nitrogen, autolinking | package skeleton, HybridObjects, HybridViews |
| `cpp/fabric/ShadowTreeMutator`, `LayoutObserver` | commit access, mount-transaction observation |
| `cpp/grid/GridLayoutEngine` | grid/waterfall layout math base |
| `cpp/registry/DependencyIndex`, `LinkedNode` | per-cell registry pattern, O(k) invalidation |
| GradientApplier JNI/main-thread applier pattern | engine→platform push channel precedent |
| `className` runtime | styled cells, container queries inside items |

## 8. Open questions

1. Position updates per cell: Fabric state update per frame vs. transform-only fast path via the
   mount layer — benchmark both (Shadowlist uses ShadowNode state; Reanimated uses direct
   ShadowTree clone/commit batches).
2. Reuse of RN's mount-layer view pools: iOS pool is always-on but `#RefuseSingleUse`; Android pool
   is flag-off in OSS. Verdict from research: **own our recycling at the React-key level**, never
   borrow the mounting pools.
3. `VirtualView`/Fling adoption: once `unstable_VirtualView`+`VirtualCollection` stabilize, evaluate
   re-basing windowing on them (background-thread prerender at transition priority is exactly our
   §3 escape hatch, maintained by Meta).
4. Worklet-driven scroll effects inside cells at Phase 2 (Lynx MTS analog = Reanimated worklets —
   already compatible since our events are standard).
