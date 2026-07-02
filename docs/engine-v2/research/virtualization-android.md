# Android list virtualization + view recycling in RN 0.86 — model for the list engine

Research worker output for **engine-v2** (groundwork for a future standalone `nitrolist`
package). READ-ONLY study of `node_modules/react-native` @ **0.86.0**. This document is
rename-agnostic: "the list engine" = our Fabric-ShadowNode-level virtualization + recycling
layer that will eventually ship as `nitrolist`.

Two mechanisms in RN are relevant and **independent**:

1. **VirtualView virtualization** — an interval-tree / P·V·PV visibility state machine that
   decides which items are Visible / Prerender / Hidden as the scroll viewport moves. This is
   the model for our *virtualization* (what to render).
2. **ViewManager view recycling** — a per-ViewManager, per-surface pool of dead native Views
   that get reset and reused instead of re-created. This is the model for our *recycling*
   (how to reuse rendered instances).

They are gated by separate feature flags and can be adopted separately. Our engine will
reimplement the *ideas* at the ShadowNode level **without** RN's flags.

All paths below are absolute under:
`/Users/ashwithsaldanha/MyWork/nitrowind/node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react`
(abbreviated as `…/react` in headers).

---

## 1. RN Android internals

### 1a. The P/V/PV visibility state machine

Files:
- `…/react/views/scroll/VirtualViewContainer.kt` — `VirtualView` interface, `rectsOverlap`, abstract `VirtualViewContainerState` (rect computation, prerender ratio, flag-based `create`).
- `…/react/views/scroll/VirtualViewContainerStateExperimental.kt` — the interval-tree + P/V/PV implementation.
- `…/react/views/scroll/VirtualViewContainerStateClassic.kt` — the O(n) fallback.
- `…/react/views/virtual/VirtualViewMode.kt` — the mode enum.
- `…/react/views/virtual/view/ReactVirtualView.kt` — the item view that participates.

#### The item contract (`VirtualView`)

Each virtualizable item exposes an ID, a rect **in container (scrollView) coordinates**, and
a mode-change callback. This is the entire surface the state machine needs:

```kotlin
// VirtualViewContainer.kt:22-27
public interface VirtualView {
  public val virtualViewID: String
  public val containerRelativeRect: Rect
  public fun onModeChange(newMode: VirtualViewMode, thresholdRect: Rect): Unit
}
```

```kotlin
// VirtualViewMode.kt
public enum class VirtualViewMode(public val value: Int) {
  Visible(0),   // overlaps the actual viewport
  Prerender(1), // overlaps the (inflated) prerender window but not the viewport
  Hidden(2),    // overlaps neither
}
```

#### Rect math: `rectsOverlap`, `visibleRect`, `prerenderRect`, prerender ratio

`rectsOverlap` is a deliberate *exclusive* overlap (touching edges do **not** count as
overlapping; a zero-area line/point still counts if strictly inside), distinct from
`Rect.intersects`:

```kotlin
// VirtualViewContainer.kt:36-46
internal fun rectsOverlap(rect1: Rect, rect2: Rect): Boolean {
  if (rect1.top >= rect2.bottom || rect2.top >= rect1.bottom) return false // no y overlap
  if (rect1.left >= rect2.right || rect2.left >= rect1.right) return false // no x overlap
  return true
}
```

The viewport and prerender windows come from the scrollView's drawing rect, inflated by a
ratio. `virtualViewPrerenderRatio()` defaults to **5.0** (i.e. prerender window is inflated by
5× the viewport size on each axis via `Rect.inset` with negative insets):

```kotlin
// VirtualViewContainerState (base), VirtualViewContainer.kt:49,94-118
protected val prerenderRatio: Double = ReactNativeFeatureFlags.virtualViewPrerenderRatio() // 5.0
protected fun updateRects() {
  scrollView.getDrawingRect(visibleRect)
  if (visibleRect.isEmpty()) { prerenderRect.set(visibleRect); return } // content not ready
  prerenderRect.set(visibleRect)
  prerenderRect.inset(
      (-prerenderRect.width()  * prerenderRatio).toInt(),
      (-prerenderRect.height() * prerenderRatio).toInt())
}
```

`updateState()` (base) is the entry point the scroll container calls on `onLayout`/`onScroll`;
it just calls `updateModes()`.

#### The `VirtualViewContainerStateExperimental` P/V/PV sets

Three ID sets track the current classification:

```kotlin
// VirtualViewContainerStateExperimental.kt:28-32
var PV: MutableSet<String> = mutableSetOf() // in prerender OR visible ranges
var P:  MutableSet<String> = mutableSetOf() // in prerender (NOT viewport)
var V:  MutableSet<String> = mutableSetOf() // in viewport
```

There are two update paths:

**Single-item update** (`updateMode`, lines 63-102) — used when *one* item's rect changed
(`onChange`). It classifies that item against `visibleRect`/`prerenderRect` (Visible wins over
Prerender), fires `onModeChange`, and moves the item between P/V/PV. It does **not** touch
other items.

**Full re-scan** (`updateModesAll`, lines 108-146) — used on scroll/layout. This is the core
set-difference algorithm and runs in **O(m + log n)** (m = items in the prerender window):

```kotlin
// VirtualViewContainerStateExperimental.kt:108-146 (condensed)
val VPrime  = virtualViews.query(visibleRect)    // V'  = items overlapping viewport
val PVPrime = virtualViews.query(prerenderRect)   // PV' = items overlapping prerender window
val PPrime  = PVPrime.minus(VPrime)               // P'  = prerender-only

val toVisible   = VPrime.minus(V)   // newly entered viewport
val toPrerender = PPrime.minus(P)   // newly entered prerender-only
val toHidden    = PV.minus(PVPrime) // left the prerender window entirely

for (id in toVisible)   virtualViews.getVirtualView(id)?.onModeChange(Visible,   visibleRect)
for (id in toPrerender) virtualViews.getVirtualView(id)?.onModeChange(Prerender, prerenderRect)
for (id in toHidden)    virtualViews.getVirtualView(id)?.onModeChange(Hidden,    emptyRect)

V  = VPrime
P  = PPrime.toMutableSet()
PV = PVPrime.toMutableSet()
```

Key property: only the **deltas** get `onModeChange` calls, so unchanged items are never
re-notified. `onChange` (add/update) and `remove` keep the tree and the P/V/PV sets in sync
(`remove` also purges the ID from all three sets, lines 52-57).

#### The interval tree (self-balancing, 1D)

`IntervalTree` (lines 173-504) is an **AVL tree of 1D intervals**. Only the scroll axis is
indexed (`horizontal` chooses `left..right` vs `top..bottom` — cross-axis overlap is
ignored). This is the data structure that makes `query()` sublinear:

- `Interval(start, end, id)` with **exclusive** `intersects` (`start < other.end && other.start < this.end`); `id` is a tiebreaker so overlapping items with equal bounds stay distinct (lines 154-162).
- Each `IntervalNode` augments the standard AVL node with `max` (max endpoint in subtree) so `queryHelper` can prune (`node.max <= interval.start` ⇒ skip subtree, lines 350-374).
- `add` is upsert: if the ID already exists it deletes then re-inserts (rect changed), returning `true` only for genuinely-new items (lines 417-442). `idToIntervalNode` gives O(1) id→node lookup for `getVirtualView`/`remove`.
- Standard AVL `rotateLeft`/`rotateRight`/`balance` keep height ~log n; `updateMax` is recomputed on every rotation and balance.

`query(rect)` (lines 389-396) converts the query rect to a 1D interval and gathers all
overlapping IDs into a `HashSet` — this is what `updateModesAll` calls for V' and PV'.

#### `ReactVirtualView` — how an item feeds the machine and reports `onModeChange`

`…/react/views/virtual/view/ReactVirtualView.kt` is a `ReactViewGroup` that implements
`VirtualView` and `View.OnLayoutChangeListener`:

- On attach it walks up parents to find the enclosing `VirtualViewContainer` (the scroll view), stopping at `ReactRoot` so it never crosses into a sibling hierarchy (`traverseParentStack`, lines 268-288). It also registers `OnLayoutChangeListener` on every ancestor so parent moves update its offset.
- It maintains `containerRelativeRect` by adding accumulated parent offsets (`updateParentOffset`, lines 230-248) to its own `left/top/right/bottom`.
- Any rect change calls `reportRectChangeToContainer()` → `virtualViewContainerState.onChange(this)` (single-item path), guarded by a `lastContainerRelativeRect` dedupe (lines 250-260).
- `onModeChange` (lines 134-194) is where a mode transition is turned into a JS event via `modeChangeEmitter`:
  - `Visible`: emitted **synchronous = true**; also forces `updateClippingRect`.
  - `Prerender`: **synchronous = false**; skipped if already Visible.
  - `Hidden`: **synchronous = false**.
  - A `renderState` (`Unknown`/`Rendered`, from `VirtualViewRenderState.kt`) guards against emitting redundant Visible events when a Prerender already committed.
- Clipping is co-opted from the ScrollView's clipping rect and intersected with the item's own rect (lines 199-228) — the item clips *its children* when off-viewport rather than itself.
- `onDetachedFromWindow` → `recycleView()` (lines 112-127) clears listeners, removes itself from the container state, and resets all cached rects/mode. (Note: this is the VirtualView's own teardown, unrelated to ViewManager pooling below.)

The `Classic` variant (`VirtualViewContainerStateClassic.kt`) is the same classification logic
but iterates **all** items every update (O(n)), no tree. It's the fallback when
`enableVirtualViewContainerStateExperimental()` is false.

#### Gating flags (defaults from `ReactNativeFeatureFlagsDefaults.kt`)

```
enableVirtualViewContainerStateExperimental() = false  // tree vs. O(n) classic
enableVirtualViewDebugFeatures()              = false  // FLog debug logging
virtualViewPrerenderRatio()                   = 5.0    // prerender window inflation
```

---

### 1b. ViewManager view recycling (native-view pooling)

File: `…/react/uimanager/ViewManager.java`. Base reset:
`…/react/uimanager/BaseViewManager.java`. Example concrete adopter:
`…/react/views/view/ReactViewManager.kt`.

#### The pool

A `ViewManager` owns a **per-surface** stack of dead views. `null` map = recycling disabled:

```java
// ViewManager.java:56
@Nullable private Map<Integer, Stack<T>> mRecyclableViews = null;

// ViewManager.java:67-71 — opt-in, called from a concrete VM's constructor
protected void setupViewRecycling() {
  if (ReactNativeFeatureFlags.enableViewRecycling()) {
    mRecyclableViews = new HashMap<>();
  }
}

// ViewManager.java:79-87 — lazily create per-surface stack
private @Nullable Stack<T> getRecyclableViewStack(int surfaceId, boolean create) { … }
```

`Map<Integer surfaceId, Stack<T>>`: pooling is scoped per surface so views never leak across
surfaces and can be dropped wholesale when a surface stops.

#### Acquire path (`createViewInstance`, lines 205-239)

```java
@Nullable Stack<T> recyclableViews = getRecyclableViewStack(reactContext.getSurfaceId(), true);
if (recyclableViews != null && !recyclableViews.empty()) {
  T recyclableView = recyclableViews.pop();
  // recycled view may still be attached to a non-recyclable parent; detach it
  if (ReactNativeFeatureFlags.enableViewRecycling() && recyclableView.getParent() != null) {
    ((ViewGroup) recyclableView.getParent()).removeView(recyclableView);
  }
  view = recycleView(reactContext, recyclableView); // hook to re-init before reuse
} else {
  view = createViewInstance(reactContext);          // cold create
}
view.setId(reactTag);
addEventEmitters(reactContext, view);
if (initialProps != null) updateProperties(view, initialProps);
if (stateWrapper != null) { /* updateState → updateExtraData */ }
```

So a reused view goes through the **same** id-assign → event-emitters → props → state path as
a fresh one; the only difference is it came from the pool and was reset rather than allocated.

#### Release path (`onDropViewInstance`, lines 245-274)

```java
ThemedReactContext ctx = (ThemedReactContext) view.getContext();
@Nullable Stack<T> recyclableViews = getRecyclableViewStack(ctx.getSurfaceId(), false);
if (recyclableViews != null) {
  T recyclableView = prepareToRecycleView(ctx, view); // reset; may return null = "cannot recycle"
  if (recyclableView != null) recyclableViews.push(recyclableView);
}
```

#### The reset/reuse hooks

- `prepareToRecycleView(ctx, view): T?` (abstract, lines 281-282) — reset the view to a clean
  state on release. **Returning `null` means "not recyclable"** and the view is dropped
  normally. `BaseViewManager.prepareToRecycleView` (BaseViewManager.java:76-172) is the
  canonical reset: it clears ~20 tags (pointer events, a11y label/role/state/actions, test id,
  native id, clipped flag…), resets transform (translation/rotation/scale/camera distance),
  pivot, top/bottom/left/right, elevation, animation matrix, filter/blend/hardware-layer tags,
  shadow colors, focus IDs, click/focusable flags, alpha=1, padding=0, foreground=null.
  Notably it **returns `null` on API < P** (can't reset pivot) — i.e. no recycling on old APIs.
- `recycleView(ctx, view): T` (lines 285-287) — default no-op; hook to re-initialize on
  acquire before props are applied.
- `ReactViewManager` (ReactViewManager.kt:67-88) shows the full opt-in pattern:
  ```kotlin
  init {
    if (ReactNativeFeatureFlags.enableViewRecyclingForView() &&
        this.javaClass == ReactViewManager::class.java) {   // only the exact class, not subclasses
      setupViewRecycling()
    }
  }
  override fun prepareToRecycleView(reactContext, view): ReactViewGroup? {
    view.removeClippedSubviews = false          // avoid clipping churn during reset
    val prepared = super.prepareToRecycleView(reactContext, view)
    prepared?.recycleView()                      // ReactViewGroup-specific child/state cleanup
    return prepared
  }
  ```

#### Lifecycle / memory

- `onSurfaceStopped(surfaceId)` (lines 467-471) drops that surface's stack.
- `trimMemory()` (lines 474-480) wipes **all** pooled views on memory pressure (fresh `HashMap`) but keeps recycling enabled.

#### Recycling gating flags (`ReactNativeFeatureFlagsDefaults.kt`)

```
enableViewRecycling()            = false  // master switch; setupViewRecycling no-ops without it
enableViewRecyclingForImage()    = true
enableViewRecyclingForScrollView() = false
enableViewRecyclingForText()     = true
enableViewRecyclingForView()     = true
```

Per-component `enableViewRecyclingFor*` flags gate whether a given VM calls
`setupViewRecycling()` at all, but `setupViewRecycling()` still checks the master
`enableViewRecycling()`.

---

## 2. Mapping to the list engine (ShadowNode level, no RN flags)

Our engine operates on the **Fabric ShadowNode graph**: we link item nodes and commit via a
`ShadowTreeMutator`, and read measured frames via a `LayoutObserver`. We are not inside
`ReactVirtualView`/`ViewManager`, so we reimplement both ideas one layer down.

### 2a. Our virtualization (interval / visibility over linked item frames)

Direct analog of `VirtualViewContainerStateExperimental`, but the "rect" for each item comes
from the **committed/measured frame of the item ShadowNode** (via `LayoutObserver`), not from a
native `View.onLayout`.

- **Item contract (our `VirtualItem`)**: `{ id: stable key, frame: Rect (content-space), onModeChange(mode, thresholdRect) }`. Frame is in list-content coordinates (analogous to `containerRelativeRect`), so it is scroll-independent — only the viewport rect moves.
- **Viewport + prerender**: mirror `updateRects` — `visibleRect` = current scroll offset + viewport size; `prerenderRect` = `visibleRect` inflated by our own ratio (start with **1–2×** per side; RN's 5.0 is aggressive and tuned for sparse `VirtualView`s embedded in arbitrary content, not dense uniform lists — a dense list wants a *smaller* window).
- **Index structure**: for a **1D dense list** we don't even need the AVL interval tree — if item frames are laid out monotonically along the scroll axis we can binary-search the sorted `offset[]`/`cumulativeHeight[]` array to get the `[firstVisible, lastVisible]` index range in O(log n), then expand by the prerender window. Keep the interval tree as the fallback for **variable-height / overlapping / sticky / multi-column (masonry)** layouts where monotonicity breaks (this is exactly why RN uses a tree — its VirtualViews can overlap). Port `Interval.intersects` (exclusive) and the `max`-augmented `queryHelper` pruning verbatim.
- **The P/V/PV delta engine**: reuse the set-difference core verbatim (`toVisible = V'−V`, `toPrerender = P'−P`, `toHidden = PV−PV'`), so on each scroll tick we only act on items crossing a boundary. "Act" for us = enqueue a `ShadowTreeMutator` op:
  - `toVisible` / `toPrerender` → **link** (or keep linked) the item subtree into the committed tree (prerender can commit off-screen but clipped).
  - `toHidden` → **unlink** the item subtree and **release its recycled instance to our pool** (see 2b).
- **Two update paths**, same as RN: single-item (`onChange`, when one item's measured frame changes — e.g. dynamic height settles via `LayoutObserver`) and full re-scan (`updateModesAll`, on scroll/viewport change). Keep them separate to avoid O(n) work on every scroll frame.
- **Coordinate reporting**: RN pushes rects up from `ReactVirtualView.onLayout`/parent
  `onLayoutChange`. We instead *pull* frames from the `LayoutObserver` after each Fabric
  commit, dedupe against a `lastFrame` cache (mirror `reportRectChangeToContainer`'s
  `lastContainerRelativeRect` guard) to avoid redundant re-classification.

### 2b. Our ShadowNode/view pooling model

Direct analog of the `ViewManager` recyclable-view stack, but pooled objects are **item
render instances keyed by item "type"** (the recycler-key / cell type), and lifecycle is driven
by our virtualization deltas rather than `createView`/`onDropViewInstance`.

- **Pool shape**: `Map<surfaceId, Map<itemType, Stack<Instance>>>`. RN keys only by surface
  because each ViewManager is already one component type; a list mixes many cell types in one
  container, so we add the `itemType` dimension (this is the RecyclerView/FlashList
  "getItemType" idea). Per-surface scoping is retained for the same leak/teardown reasons.
- **Acquire** (item enters V or P): pop from `pool[surface][type]`; if empty, cold-create the
  item ShadowNode subtree. Then re-bind: set stable id, apply the item's props/state, link into
  the tree. Mirror `createViewInstance`: reused and fresh instances take the same bind path.
- **Release** (item enters Hidden): run our `prepareToRecycle(instance)` — reset per-item
  mutable state that must not bleed into the next item bound to this instance (scroll position
  of nested lists, animated values, transient a11y state, measured-height cache if variable).
  Returning "not recyclable" (RN's `null`) drops the instance and unlinks normally. Then push
  to `pool[surface][type]`.
- **Reset semantics** are the subtle part. RN's `BaseViewManager.prepareToRecycleView` resets
  a fixed ~20-field allowlist of native View state. At the ShadowNode level our reset is
  smaller (transform/layout are recomputed by the next commit anyway) but must cover: nested
  scroll offsets, imperative refs, animation/gesture handlers, and any JS-side per-item state
  that isn't re-driven by props. Prefer an **allowlist reset** (reset known-dirty fields) over
  clearing everything, matching RN, and rely on the subsequent props-apply to overwrite the
  rest.
- **Memory**: replicate `onSurfaceStopped` (drop that surface's pools) and `trimMemory`
  (clear pooled instances, keep recycling on) driven by our own memory-pressure signal.
- **No RN flags**: we do not read `enableViewRecycling*` or `enableVirtualView*`. Our engine
  owns its own config (prerender ratio, pool caps per type, tree-vs-binary-search strategy).
  We are not a `ViewManager` and don't participate in RN's `createView` acquire path, so the
  RN flags are irrelevant to us — but our *item cells* are still ordinary RN components whose
  own ViewManagers may independently recycle; our reset must not fight that.

### 2c. What we deliberately keep vs. drop from RN

| RN mechanism | Keep | Change / drop |
|---|---|---|
| Exclusive `rectsOverlap` / `Interval.intersects` | Keep verbatim (edge-touch semantics matter for adjacent cells) | — |
| P/V/PV set-difference delta engine | Keep verbatim | — |
| AVL interval tree | Keep as fallback for non-monotonic layouts | Prefer sorted-offset binary search for the dense 1D fast path |
| `prerenderRatio = 5.0` | Keep the *mechanism* | Default much lower (1–2×) for dense lists; make it configurable |
| Per-surface pool stack + null=disabled + `null`-return=not-recyclable | Keep | Add `itemType` dimension |
| `onSurfaceStopped` / `trimMemory` | Keep | Drive from our own signals |
| `enableViewRecycling*` / `enableVirtualView*` flags | — | Drop; use our own config |
| Native `View.onLayout` push of rects | — | Pull frames from Fabric `LayoutObserver` after commit |
| JS `onModeChange` event emit (sync Visible / async Prerender·Hidden) | Analog | Replace with `ShadowTreeMutator` link/unlink ops; keep the sync-visible / async-prerender priority split |

---

## 3. Ordered Android build steps + open questions

### Build steps (Android side of the list engine)

1. **Item frame source.** Wire the `LayoutObserver` so that after each Fabric commit we can
   read every linked item ShadowNode's frame in list-content coordinates. Cache `lastFrame`
   per item id; emit a change event only on delta (port `reportRectChangeToContainer` dedupe).
2. **Viewport model.** Compute `visibleRect` from the scroll container's offset + size and
   `prerenderRect = visibleRect` inflated by the configured ratio. Recompute on scroll and on
   commit/layout (RN's two triggers: `onScroll`, `onLayout`).
3. **Index structure.** Implement the dense 1D fast path first: maintain a sorted
   `cumulativeOffset[]` keyed by item index; binary-search for `[firstVisible, lastVisible]`
   and expand by prerender window. Behind the same interface, port `IntervalTree`
   (AVL + `max` pruning + exclusive intersect) as the fallback strategy for variable/overlapping
   layouts. Select strategy per list config.
4. **P/V/PV delta engine.** Port `updateModesAll` (set differences) and `updateMode`
   (single-item) over the index structure. Output: `toVisible`, `toPrerender`, `toHidden`.
5. **Commit bridge.** Translate deltas into `ShadowTreeMutator` ops: link on
   Visible/Prerender, unlink on Hidden. Preserve RN's priority split (Visible = synchronous /
   high priority so the user never sees a blank cell; Prerender = async/low priority).
6. **Recycler pool.** Implement `Map<surfaceId, Map<itemType, Stack<Instance>>>` with
   acquire (pop-or-create + rebind) and release (`prepareToRecycle` allowlist reset +
   push-or-drop). Wire release to the `toHidden` step.
7. **Lifecycle.** Hook surface-stop (drop pools) and memory-pressure (clear pools, keep engine
   on), mirroring `onSurfaceStopped` / `trimMemory`.
8. **RTL + horizontal.** Parameterize the axis choice like `IntervalTree(horizontal)` and make
   the offset/inset math sign-aware for RTL (see open questions).
9. **Instrumentation.** Port the gated debug-log pattern (RN's `IS_DEBUG_BUILD &&
   enableVirtualViewDebugFeatures()`), keyed by item id, for P/V/PV set transitions.

### Open questions

- **Recycler integration vs. our own pool.** RN never sits on Android `RecyclerView`; it pools
  raw Views per ViewManager. Do we (a) build our own ShadowNode pool (matches our
  commit-driven model, full control of reset, but we reimplement view churn), or (b) mount
  cells into a real `RecyclerView`/`LinearLayoutManager` and drive its adapter from our P/V/PV
  output (native fling/prefetch/accessibility for free, but we must reconcile RecyclerView's
  own recycling with Fabric's mount/unmount and our ShadowTree ownership — two recyclers
  fighting)? Leaning (a) for the first cut to keep a single source of truth.
- **Reset semantics / allowlist.** Which per-item mutable state actually bleeds across
  recycles at the ShadowNode level (vs. being re-driven by props on rebind)? Need to enumerate:
  nested scroll offset, running animations/gestures, transient a11y, variable-height measure
  cache, imperative refs. RN's `BaseViewManager` list is native-View-specific and not directly
  portable — we need our own audited allowlist, and a "not recyclable" escape hatch
  (RN's `null` return) for cells that hold un-resettable state.
- **Prerender window size.** RN defaults to 5.0 for sparse embedded VirtualViews. For dense
  uniform lists that's ~11 viewports of work. What's the right default and should it be
  adaptive to scroll velocity (larger window when flinging fast)? Also: symmetric vs.
  leading-biased window in the scroll direction.
- **RTL.** `IntervalTree` uses `left..right` for horizontal but assumes LTR increasing-x. Under
  RTL, content grows leftward; either normalize item frames to a logical (start-relative) axis
  before indexing, or make the interval/binary-search comparators direction-aware. Decide where
  the RTL flip lives (frame normalization at the `LayoutObserver` boundary is cleanest so the
  index/delta core stays direction-agnostic).
- **Prerender commit + clipping.** RN clips prerendered VirtualViews via the ScrollView
  clipping rect. If we commit prerendered subtrees off-screen, do we clip them, keep them
  `display:none`-equivalent, or render at reduced fidelity? Affects both correctness (no ghost
  overdraw) and the whole point of prerender (warm the tree before it's visible).
- **Single-item update storms.** Variable-height cells settle their measured height after
  first layout, each firing a single-item `onChange`. Need to confirm this doesn't cascade into
  repeated full re-scans, and possibly coalesce single-item updates within a commit.

---

STATUS: DONE
