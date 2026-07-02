# How Lynx's `<list>` Is So Fast — Architecture Teardown + Lessons for `nitrolist`

> Research doc. Investigates the native `<list>` component of the Lynx framework
> (`lynx-family/lynx`, docs `lynxjs.org`) to extract concrete techniques we can
> adopt for our own React-Native-Fabric-based `nitrolist` virtualizer.
>
> **Confidence tags** used throughout:
> - **[CONFIRMED]** — read directly in Lynx source or official docs (path/URL cited).
> - **[INFERRED]** — my reading of how the confirmed pieces fit together; not stated verbatim.
>
> **Rename-agnostic note:** Lynx has *two* list stacks in-tree (see §0). Class names
> (`UIListContainer`, `ListContainerImpl`, `ListLayoutManager`, `ItemHolder`,
> `ListReusePool`, `ListEngineProxy`, `ListItemSchedulerAdapter`) may be renamed
> upstream; this doc references them by *role*, not just symbol.

---

## 0. TL;DR — why it's fast

Four structural decisions, in order of impact:

1. **The layout/virtualization "brain" lives in C++, not in the platform list
   widget.** In the current ("decoupled") architecture the native container is a
   *dumb* scroll view — `LynxUIScroller` (a `UIScrollView` subclass) on iOS,
   `NestedScrollContainerView` (a `NestedScrollView` subclass) on Android — **not**
   `UICollectionView` and **not** `RecyclerView`. All the interesting work
   (which items are on-screen, recycle decisions, anchoring, sticky, content-size)
   is computed in a shared C++ engine (`core/list/`). This means one implementation,
   zero per-platform virtualization drift, and no per-item bridge crossings. **[CONFIRMED]**

2. **Scroll is handled without a JS round-trip.** The native scroll view forwards
   its offset straight into the C++ engine via an *actor* hop
   (`ListEngineProxy::ScrollByListContainer`). The engine recomputes the visible
   window and emits mount/unmount/reposition ops back to the UI thread. Your
   background-thread app JS is never on the critical path of a scroll frame. **[CONFIRMED]**

3. **Recycling keys are computed at *compile* time.** Lynx assigns each
   `<list-item>` a `reuse-identifier` during compilation based on its structural
   "shape/position," so items produced by the same `map()` share a pool and reuse
   each other's mounted element subtrees. No runtime type-registration dance. **[CONFIRMED]**

4. **Item subtrees are built off the main thread, in parallel.** A per-item
   scheduler (`ListItemSchedulerAdapter`) can resolve an item's CSS/props
   (`kAsyncResolveProperty`) and even build its whole element tree
   (`kAsyncResolvePropertyAndElementTree`) on parallel worker tasks, then flush.
   New items appearing during a fling don't stall the main thread. **[CONFIRMED]**

Everything below is the detail behind these four points.

---

## 1. List component architecture

### 1.1 Two generations of list (rename-agnostic map)

Lynx ships two list implementations; the props that gate them are literal strings
in `core/renderer/ui_component/list/list_types.h`: `enable-decoupled-list`,
`list-container`, `custom-list-name`. **[CONFIRMED]**

| | **Legacy list** (`UIList`, ~2019) | **Decoupled/Container list** (current, 2024–2025) |
|---|---|---|
| Android native view | `RecyclerView` subclass (`ListStickyManager extends RecyclerView.OnScrollListener`) | `ListContainerView extends NestedScrollContainerView` (plain nested scroll view) |
| iOS native view | (collection-style) | `LynxUIListContainer : LynxUIScroller` (UIScrollView) |
| Virtualization brain | platform (RecyclerView LayoutManager) | **C++ engine** (`core/list/`) |
| Sticky | `ListStickyManager` (Java, moves views between holders) | C++ `UpdateStickyItems()` in the layout manager |

Source: `platform/android/.../ui/list/container/ListContainerView.java`,
`platform/android/.../ui/list/ListStickyManager.java`,
`platform/darwin/ios/lynx/public/ui/list/container/LynxUIListContainer.h`
(`@interface LynxUIListContainer : LynxUIScroller`). **[CONFIRMED]**

The rest of this doc focuses on the **decoupled** stack — that's the fast, current
one and the one worth copying.

### 1.2 Layers of the decoupled list

```
  App JS (background thread) ──▶ ReactLynx/Vue renders <list> + <list-item>s
        │  diff of item-keys ("update-list-info" / diffResult)
        ▼
  Element/DOM layer (C++)           core/renderer/dom/fiber/list_element.{h,cc}
    ├─ ListElement                  owns children, drives batch/parallel resolve
    └─ ListItemSchedulerAdapter     per-item async property/tree resolution
        │
        ▼
  List engine (C++)                 core/list/  (the "decoupled" impl)
    ├─ ListContainerImpl            orchestrates a list instance
    ├─ ListLayoutManager            Linear / Grid / StaggeredGrid subclasses
    ├─ ListChildrenHelper           the mounted/virtual children collection
    ├─ ListAnchorManager            scroll-stable anchor across diffs
    ├─ ItemHolder                   per-item geometry + state (the "cell record")
    └─ ListOrientationHelper        main/cross axis abstraction
        │  mount / unmount / setFrame ops
        ▼
  Platform UI (thin)                iOS: LynxUIScroller / Android: NestedScrollContainerView
    - hosts a plain scroll view + a content view
    - reports contentOffset back into the engine
```
Paths confirmed to exist via repo code search: `core/list/decoupled_list_layout_manager.h`,
`core/list/decoupled_list_anchor_manager.*`, `core/list/decoupled_item_holder.cc`,
`core/list/decoupled_list_children_helper.*`, `core/renderer/ui_component/list/item_holder.h`,
`core/renderer/dom/fiber/list_element.cc`. **[CONFIRMED]** The exact ownership arrows
between them are **[INFERRED]** from headers.

### 1.3 How items are defined — the `<list-item>` contract

- Children of `<list>` are `<list-item>` elements. Each carries **`item-key`**
  (stable identity for recycling; unique per data row) and a React `key`. **[CONFIRMED — docs]**
- The JS side does **not** hand the engine a windowed slice; it hands it a
  **diff** over the full item-key list. The engine receives `insertions`,
  `removals`, `updateFrom/updateTo`, `moveFrom/moveTo` (constants `kInsertions`,
  `kRemovals`, `kUpdateFrom…`, `kMoveFrom…` in `list_types.h`, wrapped as
  `update-list-info` / `diffResult`). **[CONFIRMED]** So the data-source contract is
  "here is the whole logical list as keys + per-key hints," and the engine decides
  what to physically realize.
- Per-item layout hints travel with the diff: `estimatedHeightPx` /
  `estimatedMainAxisSizePx`, `fullspan`, `stickyTop`/`stickyBottom`/`stickyStart`/
  `stickyEnd` (`kDataSource*` constants). **[CONFIRMED]** These let the engine size
  a not-yet-rendered row without measuring it.

### 1.4 The JS↔native contract for scroll/commands

`ListEngineProxy` (`core/public/list_engine_proxy.h`) is the entire platform→engine
surface for runtime interaction — just three methods: **[CONFIRMED]**

```cpp
virtual void ScrollByListContainer(int32_t tag, float offset_x, float offset_y,
                                   float original_x, float original_y) = 0;
virtual void ScrollToPosition(int32_t tag, int index, float offset, int align, bool smooth) = 0;
virtual void ScrollStopped(int32_t tag) = 0;
```

That's the whole hot-path vocabulary: "the scroll view moved," "programmatic
scroll-to," "scrolling ended." Everything else (which cells exist, where they go) is
the engine's business and flows the other way as painting ops.

---

## 2. Virtualization + recycling

### 2.1 The visible window and culling

- **Only items intersecting the viewport (plus a buffer) are realized.** The docs
  state "only child nodes visible in the visible area will be rendered." **[CONFIRMED — docs]**
- The layout manager tracks `content_offset_`, `content_size_`, the item frames
  (via `ItemHolder`), and computes visibility with
  `ItemHolderVisibleInList(item_holder)`. Off-screen holders are reclaimed by
  `RecycleOffScreenItemHolders()`. Layout is directional
  (`LayoutDirection::kLayoutToStart/kToEnd`) so it fills from the anchor outward in
  the scroll direction. **[CONFIRMED — `decoupled_list_layout_manager.h`]**
- **Prerender window:** `preload-buffer-count` = number of off-screen items to keep
  realized beyond the viewport (`SetPreloadBufferCount`, `ValidPreloadBufferCount`).
  Docs recommend ≈ one screen of items. There's also an experimental
  `enable-preload-section` / `PreloadSection()` path for preloading whole sections.
  **[CONFIRMED]**

### 2.2 The recycle pool (compile-time reuse identifiers)

This is the cleverest part and the biggest divergence from RN.

- `ListReusePool` (`core/renderer/dom/vdom/radon/list_reuse_pool.h`) is a
  **map from `reuse-identifier` → linked-hash-set of `item-key`s** whose mounted
  component subtree is available for reuse, plus a `key → component` map of live
  components. **[CONFIRMED]**
- Its `Dequeue(item_key, reuse_identifier, component)` returns an `Action`:
  **`CREATE`** (nothing reusable → build fresh), **`REUSE`** (adopt an off-screen
  component's element subtree and re-bind data), or **`UPDATE`** (same key still
  live → patch in place). **[CONFIRMED]**
- **`reuse-identifier` is derived at compile time from an item's structural
  shape/position.** Items emitted by the same `Array.prototype.map` get the *same*
  identifier and therefore reuse each other; structurally different items get
  different identifiers so a "photo card" never tries to morph into a "text row."
  Devs can override per-item. **[CONFIRMED — docs + pool design]**
- **`recyclable="false"`** on a `<list-item>` pins it (never pooled).
  `experimental-recycle-sticky-item` / `sticky-buffer-count` control whether sticky
  cells participate. **[CONFIRMED]**

**Why this beats RN.** RecyclerListView/FlashList infer a "type" at runtime via a
`getItemType` callback and maintain per-type pools in JS. Lynx computes the pool key
from the compiled template shape, so (a) there's no JS callback per row, (b) the
"same shape ⇒ same pool" guarantee is structural rather than developer-supplied, and
(c) reuse adopts an actual **native element subtree**, not a React element that must
re-reconcile. **[INFERRED from pool design + docs]**

### 2.3 The diff/update path

1. App state changes → framework diffs the item-key list → emits
   `update-list-info` (insert/remove/move/update ops). **[CONFIRMED]**
2. Engine applies the diff to `ListChildrenHelper`, updating `ItemHolder`s.
3. `ListAnchorManager` records a **diff anchor** (`UpdateDiffAnchorReference`)
   *before* relayout so the visible content doesn't jump when rows are inserted/
   removed above the fold. Anchor policy is tunable: `anchor-priority`
   (`fromBegin`/`fromEnd`), `anchor-align` (`toTop`/`toBottom`),
   `anchor-visibility` (`show`/`hide`), plus `initial-scroll-index`. **[CONFIRMED]**
4. `OnLayoutChildren()` relayouts affected holders; content size + corrected
   content offset are flushed to the platform scroll view
   (`FlushContentSizeAndOffsetToPlatform`). **[CONFIRMED]**
5. A `layoutcomplete` event with visible-cell info is emitted if requested
   (`need-layout-complete-info`, `needs-visible-cells`). **[CONFIRMED]**

### 2.4 vs. RN FlatList / FlashList — the concrete deltas

| Aspect | RN FlatList | FlashList (Shopify) | **Lynx `<list>`** |
|---|---|---|---|
| Virtualization brain | JS (`VirtualizedList`) | JS + RecyclerListView core | **C++ engine, shared** |
| Cull/mount work | JS thread | JS thread | engine (actor) thread |
| Item type/pool key | none (unmount/remount) | runtime `getItemType` | **compile-time `reuse-identifier`** |
| What gets reused | nothing (real unmount) | RN view via recycler | **native element subtree** |
| Scroll → new-cell latency | JS round-trip (blank cells) | reduced, still JS | **no JS round-trip** |
| Item build thread | JS | JS | **parallel worker tasks** |
| Sizing before render | needs `getItemLayout` or measures | `estimatedItemSize` | `estimated-main-axis-size-px` + per-item hints |

The headline: RN's blank-cells-during-fling problem comes from the recycle decision
and the item render both sitting on the JS thread behind the bridge. Lynx moves the
recycle decision to the engine thread (driven directly by native scroll) and the item
build to parallel workers, so a fling can realize cells without ever waking app JS.
**[INFERRED, well-supported]**

---

## 3. Threading / scheduling

### 3.1 Lynx's thread model (context)

Lynx runs JS on **two** runtimes: a **main thread** (uses **PrimJS**, a QuickJS
fork; owns layout, rendering, and "main-thread scripts"/MTS) and a **background
thread** (your normal app logic, effects, most event handlers). **[CONFIRMED — docs:
`lynxjs.org/guide/scripting-runtime/main-thread-runtime`, `react/main-thread-script`;
Callstack "dual-thread model" blog]** The engine itself is driven through an **actor**
(`LynxActor<LynxEngine>`) so calls into it are marshaled onto the engine's own thread.
**[CONFIRMED — `core/shell/list_engine_proxy_impl.*`]**

### 3.2 Scroll runs off the JS thread

The path for a finger drag:

```
UIScrollView/NestedScrollView scrolls (platform UI thread)
   → contentOffset reported to ListContainerProxy
   → ListEngineProxy::ScrollByListContainer(tag, dx, dy, ...)
   → engine_actor_->Act([...]{ engine->ScrollByListContainer(...); })   // hop to engine thread
   → ListLayoutManager::ScrollByPlatformContainer / ScrollByInternal
   → recompute visible window, recycle off-screen, layout new ItemHolders
   → emit mount/unmount/setFrame painting ops back to UI thread
```
Source: `core/shell/list_container_proxy.cc`, `core/shell/list_engine_proxy_impl.cc`
(the literal `engine_actor->Act(...)` wrap), `decoupled_list_layout_manager.h`
(`ScrollByPlatformContainer`, `ScrollByInternal(..., bool from_platform)`). **[CONFIRMED]**

Background-thread **app JS is not on this path.** `scroll` events are only surfaced
to JS on a throttle (`scroll-event-throttle`, default 200 ms) and
`scrollstatechange`/`scrollend` are opt-in (`kEnableScrollStateChangeEvent`,
`kEnableScrollEndEvent`). So event delivery is decoupled from the per-frame layout
loop. **[CONFIRMED]**

Smooth `scrollToPosition` toward not-yet-measured items uses an **estimated offset**
that is continuously re-scaled as real sizes arrive (`onSmoothScroll` linearly
rescales the target by `mScrollingEstimatedOffset / mInitialScrollingEstimatedOffset`;
iOS `setContentOffset` clamps to `_scrollEstimatedOffset`). This keeps a smooth
animation converging on a moving target without a JS callback. **[CONFIRMED —
`UIListContainer.java` `CustomScrollHook`, `LynxUIListContainer.mm`]**

### 3.3 Item updates without a JS round-trip

- Realizing/recycling a cell that's already been produced once is pure engine + UI
  work — data re-binds onto a pooled element subtree; no reconcile in app JS.
  **[INFERRED from ListReusePool + painting ops]**
- Producing a *new* cell subtree can be pushed off-thread (next section).

### 3.4 Parallel / batch item rendering — `BatchRenderStrategy`

`ListElement` picks a strategy (`experimental-batch-render-strategy`) —
`kDefault`, `kBatchRender`, `kAsyncResolveProperty`,
`kAsyncResolvePropertyAndElementTree`. **[CONFIRMED — `list_element.cc`,
`list_types.h`]**

- When async, each item gets a `ListItemSchedulerAdapter` with two work queues:
  a **`resolve_property_queue_`** (`base::OnceTaskRefptr` — runnable on worker
  threads, with futures) and a **`resolve_element_tree_queue_`**. **[CONFIRMED —
  `list_item_scheduler_adapter.h`]**
- `ListElement::ParallelFlushAsRoot()` drains the element-manager's
  `ParallelTasks()` and `ParallelResolveTreeTasks()` queues — i.e. item CSS/property
  resolution and full element-tree construction run as parallel tasks, then their
  futures are joined and flushed. Gated by `GetEnableParallelElement()`. **[CONFIRMED
  — `list_element.cc` lines ~146–190]**
- `experimental-continuous-resolve-tree` lets tree resolution proceed across items
  continuously rather than one flush boundary at a time. **[CONFIRMED — flag]**

So: **cull/recycle decision on the engine thread; heavy item construction on parallel
workers; only the final mount touches the UI thread.** That's the scheduling recipe.

Per-item timing is even instrumented: `list_item_update_duration`,
`list_item_render_duration`, `list_item_dispatch_duration`,
`list_item_layout_duration` (`kListItem*Duration` in `list_types.h`). **[CONFIRMED]**

### 3.5 Draw-safe mutation batching (Android)

`ListContainerView` defers child add/remove that would otherwise happen mid-draw:
it uses an `OnPreDrawListener` to open a "draw window," queues mutations
(`runInEndDrawTraversal`), and drains them in an `EndDrawTraversalRunnable` posted
after the draw — explicitly to dodge a known crash path
(`dispatchGetDisplayList → computeScroll → onNestedScroll → removeListItemNode →
removeView`). **[CONFIRMED — `ListContainerView.java`]** Lesson: on Fabric we must
likewise never mutate the mounted view tree synchronously inside a scroll/draw
callback.

---

## 4. Sticky headers, sizing, layout engine

### 4.1 Sticky

- **Decoupled arch:** sticky is computed *inside the layout manager* in C++:
  `UpdateStickyItems()`, `ShouldRecycleStickyItemHolder()`,
  `UpdateStickyItemsAfterLayout(anchor_info)`, `IsItemHolderNotAtStickyPosition()`.
  Props: `sticky`, `sticky-top`, `sticky-bottom`, `sticky-offset`, `full-span`
  (sticky items must span the full cross-axis), `sticky-buffer-count`,
  `experimental-recycle-sticky-item`, `experimental-update-sticky-for-diff`.
  **[CONFIRMED — `decoupled_list_layout_manager.h`, `list_types.h`, docs]**
- **Legacy arch:** `ListStickyManager` (Java) physically re-parents the sticky view
  into an overlay `FrameLayout`, driven by `RecyclerView.OnScrollListener.onScrolled`,
  finding the section header/footer that straddles `mStickyOffset` each scroll tick,
  and restoring it to its holder when scrolled past. **[CONFIRMED — `ListStickyManager.java`]**
  Useful as a reference for the *view-reparenting* approach if you can't push sticky
  into a shadow tree.

### 4.2 Self-sizing cells

- Before an item is measured, the engine sizes it from
  **`estimated-main-axis-size-px`** (older alias `estimated-height-px`) or the
  per-item `estimatedMainAxisSizePx` hint; default fallback
  `kDefaultMainAxisItemSize = 200`. **[CONFIRMED — `list_types.h`, docs]**
- Once the item's real content is laid out, `OnLayoutChildren(is_component_finished,
  component_index)` / `OnComponentFinished` runs with the true measured size, the
  `ItemHolder`'s frame is corrected, content size + offset are re-flushed, and the
  anchor keeps the viewport stable. Comment in `decoupled_list_layout_manager.h`
  confirms `OnLayoutChildren` "will also be invoked within OnComponentFinished" in
  `PART_ON_LAYOUT` or `MULTI_THREAD` modes. **[CONFIRMED]** So sizing is genuinely
  self-measuring; the estimate only sets the pre-measure placeholder and the scroll
  math for far-away items.

### 4.3 Layout engine involvement + layout modes

- `list-type`: **`single`** (linear), **`flow`** (grid, aligned column tops,
  `LayoutType::kFlow`), **`waterfall`** (staggered, fill-shortest-column,
  `kWaterFall`). Implemented as `ListLayoutManager` subclasses:
  `LinearLayoutManager`, `GridLayoutManager`, `StaggeredGridLayoutManager`
  (`core/renderer/ui_component/list/staggered_grid_layout_manager.cc`,
  `grid_layout_manager.h`; decoupled equivalents in `core/list/`). Controlled by
  `span-count`/`column-count`, `list-main-axis-gap`/`list-cross-axis-gap`,
  `enable-dynamic-span-count`, `scroll-orientation`/`vertical-orientation`. **[CONFIRMED]**
- The engine computes item frames itself (it is essentially a mini list layout
  engine); each item's *internal* content is laid out by Lynx's normal flexbox/CSS
  layout when the component finishes. The list manager only owns inter-item main/cross
  positioning via `ListOrientationHelper`. **[INFERRED, well-supported by the helper
  split]**
- `item-snap` (`factor`,`offset`) gives paged snapping (`LynxSnapHelper`). **[CONFIRMED]**

---

## 5. Lessons for `nitrolist`

Our plan: native virtualization/culling/recycling over **React Native's Fabric
shadow tree** — visibility commits via a **shadow-tree mutator**, item frames from a
**post-layout hook**, scroll offset from the **mounted scroll view** — with a
**P/V/PV** model and **interval-tree/binary-search** offset math. Mapping Lynx onto
that:

### 5.1 What maps cleanly (steal these)

1. **Keep the scroll→cull loop entirely off JS.** Lynx's win is
   `nativeScrollView → engine.ScrollBy → recompute window → mount ops`, all without
   waking app JS. Our analogue: subscribe to the mounted ScrollView's offset **on the
   native/UI side** and drive the shadow-tree mutator directly from a C++/native
   culling core. Do **not** route scroll offset up to JS to decide the window. This is
   the single most important lesson. **[from §3.2]**

2. **Compile-time (or mount-time) reuse keys, not runtime `getItemType`.** Lynx's
   `reuse-identifier` from template shape is why reuse is cheap and correct. On RN we
   can't compile templates, but we can approximate: derive a stable "shape key" per
   item renderer (e.g. component identity / a declared `recycleType`) and pool by it,
   so PV recycling adopts an existing mounted subtree instead of remount. Model the
   pool exactly like `ListReusePool`: `reuseId → orderedSet<itemKey>` + `Action{CREATE,
   REUSE, UPDATE}`. Our P/V/PV states map onto this: **P** (virtual/known-frame,
   unmounted) = not in pool as live; **V** (visible/mounted) = live in
   `key→component`; **PV** (recyclable, transitioning) = enqueued in the pool for
   `REUSE`. Adopt the CREATE/REUSE/UPDATE trichotomy verbatim — it's cleaner than a
   binary mount/unmount. **[from §2.2]**

3. **Anchor manager for jump-free diffs.** Before committing an insert/remove/move to
   the shadow tree, capture an anchor (visible item + its offset) and re-derive
   content offset after relayout — Lynx's `ListAnchorManager` /
   `UpdateDiffAnchorReference`. Expose the same knobs (`anchorAlign`,
   `anchorPriority`, `initialScrollIndex`). Without this, our interval-tree updates
   will visibly jump when rows above the viewport change. **[from §2.3]** This is
   orthogonal to (and required alongside) the interval tree.

4. **Estimated size + self-measure correction.** Seed each item's frame from an
   `estimatedMainAxisSize` (per-item override + list default), realize, then correct
   from the **post-layout hook** and re-flush content size + anchor-corrected offset.
   Lynx's `OnComponentFinished → OnLayoutChildren(is_component_finished)` is exactly
   our post-layout hook path. **[from §4.2]**

5. **Build heavy item subtrees off the commit thread.** Lynx's
   `ListItemSchedulerAdapter` + `ParallelFlushAsRoot` resolve props/tree on workers,
   then flush. On Fabric, prefer building/cloning the item's shadow subtree off the UI
   thread and committing the finished node, rather than constructing under the mutator
   lock during a fling. Even a two-phase "prepare (async) → commit (mutator)" split
   captures most of the benefit. **[from §3.4]**

6. **Never mutate the view tree inside a scroll/draw callback.** Copy the Android
   `OnPreDrawListener`/`EndDrawTraversalRunnable` deferral: queue visibility mutations
   and drain them at a safe point in the frame. Fabric commits are already
   double-buffered, but the same discipline avoids re-entrancy when scroll callbacks
   trigger culling that triggers commits. **[from §3.5]**

7. **Directional fill from the anchor.** Lynx lays out from the anchor outward in the
   scroll direction (`LayoutDirection::kToStart/kToEnd`) rather than always index-0
   forward. Our binary-search should locate the anchor, then expand the realized
   window bidirectionally to `viewport ± preloadBuffer`. **[from §2.1]**

8. **A `preloadBufferCount` knob (≈ one screen), plus opt-in throttled scroll
   events.** Match Lynx's default posture: cull aggressively, prerender ~one screen,
   surface `onScroll` to JS only on a throttle and make state-change/end events
   opt-in. Keeps JS quiet during flings. **[from §2.1, §3.2]**

### 5.2 Where our approach can differ / improve

- **Interval-tree/binary-search vs. Lynx's incremental frames.** Lynx's decoupled
  manager largely walks/accumulates `ItemHolder` frames incrementally (anchor +
  directional layout) rather than a global interval tree. Our **interval tree over
  item offsets gives O(log n) "which items intersect [scrollTop, scrollBottom]"**,
  which is strictly better than incremental scanning for random `scrollToIndex` and
  for very large lists — **keep it**. Pair it with Lynx's anchor concept: interval
  tree answers *what's visible*; anchor answers *what stays put across a diff*. They
  compose. **[INFERRED — supported by absence of a global index in the manager headers]**

- **P/V/PV is a fine superset of CREATE/REUSE/UPDATE.** Keep P/V/PV as the *lifecycle*
  state and use CREATE/REUSE/UPDATE as the *transition action* the recycler emits.
  Don't collapse them.

- **We own the shadow tree; Lynx owns a bespoke tree.** Advantage for us: Fabric's
  diff/commit and off-thread shadow tree are already built. We should lean on Fabric's
  existing commit pipeline for the "flush," and only implement the culling brain +
  recycle pool + anchor + interval tree — i.e. *don't* rebuild a layout engine, just a
  virtualization/positioning layer over Fabric. **[INFERRED]**

### 5.3 Concrete build order suggestion

1. Native scroll-offset tap → culling core (no JS). 2. Interval tree of item frames
seeded by estimates. 3. Shadow-tree mutator emitting mount/unmount from the visible
window ± buffer. 4. Recycle pool (`reuseId → keys`, CREATE/REUSE/UPDATE) feeding PV
recycling. 5. Post-layout hook → correct frames + re-flush. 6. Anchor manager for
diffs. 7. Off-thread item prepare → commit split. 8. Sticky (prefer shadow-tree
positioning; view-reparent overlay as fallback, per `ListStickyManager`).

---

## Open questions / not fully confirmed

- Exact thread identity of the "engine actor" relative to Lynx's PrimJS main thread
  vs. a dedicated TASM/layout thread — the actor abstraction hides it; **[INFERRED]**
  it is *not* the background app-JS thread, which is the point that matters for us.
- Whether the decoupled manager keeps any global index structure (interval-tree-like)
  internally, or purely incremental holders — headers suggest incremental +
  anchor. **[INFERRED]**
- iOS legacy list backing view (UICollectionView vs custom) — current decoupled iOS
  container is confirmed `LynxUIScroller` (UIScrollView), so it doesn't matter for us.

---

## Sources

**Lynx source (`github.com/lynx-family/lynx`, read via GitHub API):**
- `core/public/list_engine_proxy.h` — platform→engine scroll/command surface.
- `core/shell/list_container_proxy.cc`, `core/shell/list_engine_proxy_impl.{h,cc}` — actor hop into the engine.
- `core/list/decoupled_list_layout_manager.h` — layout/anchor/recycle/sticky brain (decoupled arch).
- `core/list/` (dir) — `decoupled_list_anchor_manager.*`, `decoupled_item_holder.cc`, `decoupled_list_children_helper.*`, `decoupled_grid_layout_manager.h`, `decoupled_staggered_grid_layout_manager.*`.
- `core/renderer/ui_component/list/list_types.h` — all prop/const/enum strings (list-type, span-count, preload-buffer-count, estimated-main-axis-size-px, recyclable, sticky-*, anchor-*, experimental-batch-render-strategy, timing metrics).
- `core/renderer/ui_component/list/` — `staggered_grid_layout_manager.cc`, `grid_layout_manager.h`, `list_layout_manager.cc`, `item_holder.h`, `list_adapter.*`.
- `core/renderer/dom/fiber/list_element.{h,cc}` — `ParallelFlushAsRoot`, `NeedAsyncResolveListItem`, batch-render strategy selection.
- `core/renderer/dom/fiber/list_item_scheduler_adapter.h` — per-item async property/tree resolve queues.
- `core/renderer/dom/vdom/radon/list_reuse_pool.h` — reuse pool (`reuseId→itemKeys`, CREATE/REUSE/UPDATE).
- `platform/android/lynx_android/src/main/java/com/lynx/tasm/behavior/ui/list/container/UIListContainer.java`, `ListContainerView.java` (extends `NestedScrollContainerView`), `ListContainerProxy.java`.
- `platform/android/.../ui/list/ListStickyManager.java` — legacy RecyclerView-based sticky.
- `platform/darwin/ios/lynx/public/ui/list/container/LynxUIListContainer.h` (`: LynxUIScroller`), `.../ui/list/container/LynxUIListContainer.mm`.

**Lynx docs (`lynxjs.org`):**
- `<list>` component — https://lynxjs.org/api/elements/built-in/list
- Main Thread Runtime / PrimJS — https://lynxjs.org/guide/scripting-runtime/main-thread-runtime
- Main Thread Script (ReactLynx) — https://lynxjs.org/react/main-thread-script.html
- JavaScript Runtime & WebAssembly — https://lynxjs.org/guide/scripting-runtime/

**Secondary:**
- Callstack — "Visualizing the Dual-Thread Model of Lynx JS": https://www.callstack.com/blog/visualizing-the-dual-thread-model-of-lynx-js
- Comparison (context only): https://www.rutvikbhatt.com/lynx-vs-react-native-performance-implications-and-benchmarking/

STATUS: DONE
