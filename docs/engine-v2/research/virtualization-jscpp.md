# engine-v2 research — Cross-platform C++ view culling over the Fabric shadow tree

Groundwork for a future separate `nitrolist` package ("the list engine"). This is a
READ-ONLY research writeup: it maps how React Native's built-in view culling works in
C++, how our engine already owns C++ machinery over the same shadow tree, and how the
list engine would compute visibility/virtualization in C++ without depending on RN's
culling flag.

Targets React Native 0.86 Fabric internals (paths below are under
`node_modules/react-native/ReactCommon`, abbreviated `RC/` here).

---

## 1. How React Native's view culling works

RN gained an experimental **view culling** pass that runs *inside the differ*, i.e. at
the point where a new shadow tree is diffed against the old one to produce mount
instructions. Off-screen nodes are dropped from the sliced pair list, so they never
generate Create/Insert mutations and (when they scroll off) generate Remove/Delete
mutations. This is fundamentally different from JS virtualization: there is no JS, no
`onViewableItemsChanged`, no cell recycling — it operates purely on the C++ shadow tree
during diffing.

### 1a. Where it hooks into the mounting pipeline

The entry point is `calculateShadowViewMutations(oldRoot, newRoot)` in
`RC/react/renderer/mounting/Differentiator.cpp:1641`. This is called by the
`MountingCoordinator` after every commit to turn two tree revisions into an
ordered `ShadowViewMutation::List`. The root call seeds an **empty** `CullingContext`:

```cpp
// Differentiator.cpp:1665
auto sliceOne = sliceChildShadowNodeViewPairs(
    ShadowViewNodePair{.shadowNode = &oldRootShadowNode},
    viewNodePairScope, false /* allowFlattened */,
    {} /* layoutOffset */, {} /* cullingContext */);
```

The culling context is then threaded, and re-derived at each level, through:
- `sliceChildShadowNodeViewPairs` / `sliceChildShadowNodeViewPairsRecursively`
  (`RC/.../mounting/internal/sliceChildShadowNodeViewPairs.cpp`) — the *slice* stage
  that decides which children even become mount candidates.
- `calculateShadowViewMutations` and `calculateShadowViewMutationsFlattener`
  (`Differentiator.cpp`), which carry both an `oldCullingContext` and a
  `newCullingContext` and call `adjustCullingContextIfNeeded` on each pair so the two
  tree walks stay aligned (`Differentiator.cpp:209-212`, `:292-295`, `:628-629`).

Key consequence: **the culling decision is made during the slice, so a culled node is
absent from the pair list handed to the differ. The differ then naturally emits
Remove+Delete for nodes present in old-slice but absent from new-slice, and
Insert+Create for the reverse.** Scrolling drives this because the culling *frame*
moves with content offset (below), changing which nodes intersect it between revisions.

### 1b. The `CullingContext` struct

`RC/react/renderer/mounting/internal/CullingContext.h`:

```cpp
struct CullingContext {
  Rect frame;          // the visible viewport (in the current node's coord space)
  Transform transform; // accumulated transform to map descendant frames into it
  bool shouldConsiderCulling() const;
  CullingContext adjustCullingContextIfNeeded(const ShadowViewNodePair &pair) const;
};
```

`shouldConsiderCulling()` is trivially `frame.size.width > 0 && height > 0`
(`CullingContext.cpp:16`). An empty frame (the root default) means "cull nothing" — so
culling is off until a scroll container establishes a real frame.

### 1c. How the culling frame is computed (`adjustCullingContextIfNeeded`)

`CullingContext.cpp:20-79`. Called once per pair as the walk descends. Whole body is
gated on `ReactNativeFeatureFlags::enableViewCulling()`. Three cases:

1. **ScrollView node** (`dynamic_cast<const ScrollViewShadowNode*>`) — this is where a
   real culling frame is born:
   - Only if `yogaStyle.overflow() != yoga::Overflow::Visible` **and**
     `!scrollViewShadowNode->getStateData().disableViewCulling` (an escape hatch on
     `ScrollViewState`, `RC/.../scrollview/ScrollViewState.h:39`). Otherwise the context
     is reset to `{}` (culling disabled for this subtree).
   - `frame.origin = -getContentOriginOffset(includeTransform=true)` — i.e. the negated
     scroll offset, so the frame tracks the scroll position
     (`ScrollViewShadowNode.h:37`).
   - `frame.size = layoutMetrics.frame.size` — the ScrollView's own (visible) size.
   - **Outset**: enlarge the frame by `viewCullingOutsetRatio()` on each axis:
     ```cpp
     // CullingContext.cpp:37-47
     auto outsetRatio = ReactNativeFeatureFlags::viewCullingOutsetRatio();
     if (outsetRatio > 0) {
       auto xOutset = floor(frame.size.width  * outsetRatio);
       auto yOutset = floor(frame.size.height * outsetRatio);
       frame.origin.x -= xOutset;  frame.origin.y -= yOutset;
       frame.size.width  += 2 * xOutset;  frame.size.height += 2 * yOutset;
     }
     ```
     So `outsetRatio = 0.5` keeps roughly half a viewport of pre-rendered content on
     each side. `transform` is reset to `Identity()`.
   - RTL: the origin.x is flipped using `stateData.contentBoundingRect.size.width`
     (`CullingContext.cpp:51-60`).

2. **Root node** (`Trait::RootNodeKind`) — context reset to `{}`.

3. **Any other node** — the frame is *translated into the child's coordinate space*:
   `frame.origin -= pair.shadowView.layoutMetrics.frame.origin`, and the node's own
   transform is composed into `context.transform` (`CullingContext.cpp:64-75`). This is
   how the ScrollView's viewport rect is carried down through intermediate wrappers to
   the actual row nodes.

### 1d. The actual cull test (in the slice)

`sliceChildShadowNodeViewPairs.cpp:70-98`, gated on `enableViewCulling()`:

```cpp
auto isViewCullable =
    !shadowView.traits.check(Trait::Unstable_uncullableView) &&
    !shadowView.traits.check(Trait::Unstable_uncullableTrace);
if (cullingContext.shouldConsiderCulling() && isViewCullable) {
  auto overflowInsetFrame =
      shadowView.layoutMetrics.getOverflowInsetFrame() * cullingContext.transform;
  if (auto l = dynamic_cast<const LayoutableShadowNode*>(&childShadowNode))
    overflowInsetFrame = overflowInsetFrame * l->getTransform();

  auto hasLayout = overflowInsetFrame.size.width > 0 ||
                   overflowInsetFrame.size.height > 0;
  auto doesIntersect =
      Rect::intersect(cullingContext.frame, overflowInsetFrame) != Rect{};
  if (hasLayout && !doesIntersect) {
    continue; // Culling: node is dropped from the pair list entirely.
  }
}
```

Notes:
- It uses `getOverflowInsetFrame()` (the frame extended by children overflow), not the
  bare frame — so a row whose shadow/overflow pokes into view is not culled.
- `hasLayout` guard: empty-layout nodes (e.g. embedded Text fragments that carry react
  tags) are never culled even if they don't intersect.
- The `Hidden` trait is handled just above (`:61-67`): hidden nodes (and their subtrees)
  are `continue`-skipped before culling even runs. On Android this is additionally gated
  on `useTraitHiddenOnAndroid()`.

### 1e. Traits used
- `Trait::Unstable_uncullableView` (`ShadowNodeTraits.h:80`, bit `1<<12`) — set by a
  component author when the view has side effects beyond rendering (opens a modal, etc.)
  so it must never be culled.
- `Trait::Unstable_uncullableTrace` (`:84`, bit `1<<13`) — "must not be set directly";
  propagated up by the culling algorithm so an uncullable descendant keeps its ancestors
  uncullable.
- `Trait::Hidden` (`:42`, bit `1<<2`) — a stronger, separate mechanism: node + subtree
  produce no views at all.

### 1f. Feature flags (`RC/react/featureflags/ReactNativeFeatureFlags.cpp`)
- `enableViewCulling()` (`:213`) — master gate; off by default in stock 0.86.
- `viewCullingOutsetRatio()` (`:385`) — double, default `0.0` (no pre-render margin
  unless set).
- `useTraitHiddenOnAndroid()` (`:369`).
- `preventShadowTreeCommitExhaustion()` (`ShadowTree.cpp:300` etc.) — relevant to §2/§3.

---

## 2. Our engine's machinery and how the list engine would own culling

### 2a. What we already have

**`ShadowTreeMutator`** (`packages/nitrowind/cpp/fabric/ShadowTreeMutator.{hpp,cpp}`) —
our commit model. It applies a batch of `NodeMutation{ family, surfaceId, props }`
straight into the Fabric ShadowTree, bypassing React reconciliation:

- Groups mutations by `SurfaceId` so each surface gets **one** commit
  (`ShadowTreeMutator.cpp:36-46`).
- Looks up the tree via `uiManager->getShadowTreeRegistry().visit(surfaceId, …)`.
- Inside `shadowTree.commit([&](const RootShadowNode& old) { … })` it clones the old
  root, then for each mutation calls `root->cloneTree(family, cloner)` — cloning only the
  path from root to each mutated node (`cloneTree`), and merging new props via
  `descriptor.cloneProps(ctx, node.getProps(), RawProps(mutation.props))`
  (`:56-68`).
- Commits with `{.enableStateReconciliation = false}` (`:73`).
- Nodes are addressed by the **stable `ShadowNodeFamily`**, not by `ShadowNode*` — because
  ShadowNode instances are replaced on every commit but families are not (see
  `LinkedNode.hpp:27-29`).

**`LayoutObserver`** (`packages/nitrowind/cpp/fabric/LayoutObserver.{hpp,cpp}`) — our
post-layout hook. It implements `facebook::react::UIManagerMountHook` and overrides
`shadowTreeDidMount(rootShadowNode, mountTime)` (`LayoutObserver.hpp:58`), which fires
*after* a tree is laid out and mounted. In it we:
- DFS-walk the mounted tree (`walk`, `LayoutObserver.cpp:44`), and
- read `LayoutMetrics` straight off nodes via
  `dynamic_cast<const LayoutableShadowNode*>(&node)->getLayoutMetrics().frame.size`
  (`:73-77`) — this is exactly the same accessor the RN culling path reads.
- Push measurements to `NitrowindCore::syncContainers/...`, which re-resolves gated
  nodes and re-commits via `ShadowTreeMutator` in a follow-up commit.
- There is also an out-of-band `remeasure()` (`LayoutObserver.cpp:163`) that pulls the
  current root from `getShadowTreeRegistry().enumerate(...)` /
  `shadowTree.getCurrentRevision().rootShadowNode` — useful when a container/list is
  linked on a static screen with no subsequent commit.

**Node linking** (`packages/nitrowind/cpp/registry/LinkedNode.hpp`,
`core/NitrowindCore.hpp`): `NitrowindCore::link(tag, family, surfaceId, …)` registers a
node keyed by Fabric `Tag`, holding its stable `ShadowNodeFamily`, surface, and a
`containerTag` (nearest ancestor container). `NitrowindCore` already keeps per-tag maps
under mutexes and drives `recompute → commitResolvedNode → ShadowTreeMutator::commit`
(`NitrowindCore.cpp:283,314,326`). The list engine can reuse this exact registration +
commit spine; it just needs a different "what to compute" (visibility) and a different
recompute trigger (scroll offset + item frames).

### 2b. Design: computing cull/visibility over linked children in C++

The list engine models a list as: one **scroll container** node + an ordered set of
**item** nodes linked as its children. On each relevant event it computes a viewport
frame and tests each item frame against it — mirroring §1c/§1d but in *our* code:

1. **Viewport frame.** From the ScrollView shadow node, exactly as RN does:
   `frame.origin = -scrollNode->getContentOriginOffset(true)`,
   `frame.size = scrollNode->getLayoutMetrics().frame.size`, optionally enlarged by an
   engine-owned `outsetRatio`. We can also skip `getContentOriginOffset` and read
   `ScrollViewState.contentOffset` directly (`ScrollViewState.h:26`) if we want the raw
   offset. Reading state requires the `ScrollViewShadowNode`; we get it by locating the
   list's container node in the current revision root (same walk/enumerate the
   `LayoutObserver` already does).
2. **Item frames.** `item->getLayoutMetrics().frame` (translated into the scroll content
   coord space by subtracting intermediate origins, exactly like
   `CullingContext.cpp:68`). We already do the origin-carry walk in `LayoutObserver`.
3. **Visibility test.** `Rect::intersect(viewport, itemFrame) != Rect{}` — identical to
   `sliceChildShadowNodeViewPairs.cpp:93`.
4. **Act on the result** (two candidate strategies, below).

Because scroll offset is not delivered through the mount hook by default, the primary
recompute trigger is a **JS-side scroll handler** (or a native onScroll bridge) calling
into the engine with the new offset; item frames come from the last mount via the
`LayoutObserver` walk. The mount hook remains the trigger for *re-measuring* item frames
when the tree changes.

### 2c. Two strategies (both WITHOUT RN's culling flag)

**Strategy (b) — visibility/mounted flag via prop commits (recommended, feasible today).**
For each item, commit a prop toggle through the existing `ShadowTreeMutator` path:
- Cheapest: toggle `display: none` ↔ `display: flex` (or `opacity`/`0-height`) in the
  merged style dynamic. Off-screen items collapse to zero layout but their ShadowNodes
  remain in the tree. This is a pure prop mutation — no new native surface needed. Note
  `display:none` still keeps the native view *created* (just not laid out/painted); to
  actually free the native view you need the item to *leave the tree* (Strategy a).
- Or set the `Trait::Hidden` on the item's shadow node — nodes with `Hidden` (and their
  subtree) "will not produce views" (`ShadowNodeTraits.h:40-42`) and are skipped in the
  slice *before* culling (`sliceChildShadowNodeViewPairs.cpp:61-67`). Traits, however,
  are not props: they are set on the ShadowNode (often in its constructor), so toggling
  `Hidden` per-commit means cloning the node with modified traits inside our
  `cloneTree` cloner rather than via `cloneProps`. This is heavier and more coupled to
  internals than a `display` prop, and on Android is gated by `useTraitHiddenOnAndroid()`.
  Recommendation: prefer the `display:none` prop for v1; keep `Hidden`-trait as a v2
  optimization once the commit model is proven.

**Strategy (a) — skip commits / structurally remove off-screen items.** To get the full
memory win (native views destroyed for off-screen rows) the item must be *absent from the
tree*, which means our `cloneTree` mutation would have to remove children from the
container node's child list rather than merge props. This is possible via the same
`shadowTree.commit` mechanism (return a root whose container has a pruned child vector),
but it means **we own the windowing of the child list** and must re-insert on scroll-back
— i.e. we reimplement virtualization structurally. This collides much more with RN's own
diffing (the next JS render re-supplies the full child list) and is the hard version;
treat as a later milestone.

### 2d. Can we influence mount instructions directly, or only via commits?

**We cannot directly emit or edit `ShadowViewMutation`s from our engine.** The
mutation list is produced internally by `calculateShadowViewMutations` inside the
`MountingCoordinator`, from the diff of two committed tree revisions. There is no public
hook to inject/rewrite mutations, and `UIManagerMountHook` is *observe-only* (it fires
after mount). RN's own culling only influences mutations because it runs *inside the
differ's slice*, which is not an extension point.

Therefore the list engine must model culling **purely via commits that change the tree
the differ sees**: either prop/visibility commits (Strategy b) or structural
child-list commits (Strategy a). We change the *input* to the differ; the differ then
naturally produces the corresponding Update / Insert+Create / Remove+Delete mutations.
This is consistent with how `ShadowTreeMutator` already works. The upside: it composes
with RN's built-in culling if the app *also* turns on `enableViewCulling()` — the two are
independent (ours changes props/structure, RN's slices the pair list), but they can
double-count work, so v1 should assume RN culling is **off** and be the sole owner.

---

## 3. Build steps, shared module design, open questions

### 3a. Ordered build steps

1. **Extract a platform-agnostic core.** Create
   `packages/<list-engine>/cpp/virtualization/` with a pure-C++ module (no JNI/ObjC),
   depending only on `react/renderer/...` headers — the same dependency surface
   `LayoutObserver`/`ShadowTreeMutator` already compile against. Both iOS and Android
   build it via their existing CMake/podspec that already pull in ReactCommon.
2. **Container + item registry.** Add a list-scoped registry analogous to
   `NitrowindCore`'s tag→`LinkedNode` maps: a `ListContainer{ containerFamily,
   surfaceId, outsetRatio }` plus ordered `Item{ tag, family, index, lastFrame }`. Reuse
   the `link(tag, family, surfaceId, …)` registration pattern (`NitrowindCore.hpp:62`).
3. **Frame ingestion via the mount hook.** Extend the `LayoutObserver` walk (or add a
   parallel `UIManagerMountHook`) to, when it encounters a registered list container,
   locate the `ScrollViewShadowNode`, read `getLayoutMetrics()` +
   `getContentOriginOffset(true)` / `ScrollViewState.contentOffset`, and record each
   registered item's `getLayoutMetrics().frame` (origin-carried into content space).
4. **Scroll trigger.** Add a JS/native entry point `onScroll(containerTag, offset)` that
   updates the container's viewport origin and runs the visibility pass. Debounce/coalesce
   to at most one pass per frame.
5. **Visibility pass.** For each item compute `intersect(viewport ± outset, itemFrame)`;
   diff against the item's previous visible/hidden state; collect only *changed* items
   into a `std::vector<NodeMutation>`.
6. **Commit.** Hand the batch to `ShadowTreeMutator::commit(batch)` — one commit per
   surface, `enableStateReconciliation=false`. For Strategy (b), each `NodeMutation.props`
   is `{display: "none"}` or `{display: "flex"}`.
7. **Idempotence + convergence.** Only commit when at least one item's visibility
   flipped (mirrors `NitrowindCore`'s "recompute only when a measured value changed" rule,
   `LayoutObserver.hpp` docblock) so we never loop.
8. **(Later) Strategy (a).** Add structural windowing: prune/restore container child
   vectors inside the `cloneTree` cloner, with a recycling handoff (see open questions).

### 3b. Shared C++ virtualization module design

```
<list-engine>/cpp/virtualization/
  ViewportCuller.hpp/.cpp   // pure logic: viewport rect from scroll node + outset;
                            //   intersect items; return changed visibility set.
                            //   No JSI, no platform code. Unit-testable in isolation.
  ListRegistry.hpp/.cpp     // container/item registry keyed by Tag + stable Family.
  ListMountObserver.hpp/.cpp// UIManagerMountHook: measure item/container frames,
                            //   feed ListRegistry (reuses LayoutObserver patterns).
  ListCommitter.hpp/.cpp    // builds NodeMutation batches; delegates to
                            //   ShadowTreeMutator::commit (reused as-is).
```
- iOS and Android share **all** of the above; only the thin JS/native binding that
  delivers `onScroll` and registers containers is per-platform (Nitro HybridObject on
  both, matching the current Nitrowind setup).
- `ViewportCuller` deliberately re-derives the *same* geometry RN uses
  (`getContentOriginOffset`, `getOverflowInsetFrame`, `Rect::intersect`) so behavior is
  predictable and we can later interop with `enableViewCulling()` if desired.

### 3c. Open questions / risks

1. **Interplay with RN's own diffing.** The next JS render re-supplies the item's full
   props/children and would overwrite our `display:none` (or re-insert a pruned child),
   flashing the item back on until our next pass re-hides it. Mitigations: (i) make JS the
   source of truth for the window so it renders items already hidden; or (ii) re-run the
   visibility pass from the mount hook immediately after every mount (we already have the
   `shadowTreeDidMount` hook) so the correction lands in the same frame. Need to confirm
   the second commit converges without visible flicker.
2. **Interplay with `enableViewCulling()`.** If the app also enables RN culling, an item
   we set to `display:none` has zero layout → RN's `hasLayout` guard means it is *not*
   culled by RN (only hidden by us), which is fine; but a `Hidden`-trait item is skipped
   by RN's slice too. Decide v1 policy: assume RN culling **off**, own it entirely.
3. **Thread-safety with ShadowTree commits.** `ShadowTree::commit` retries on
   `CommitStatus::Failed` (a concurrent commit invalidated the base revision); with
   `preventShadowTreeCommitExhaustion()` it caps retries then takes
   `revisionMutexRecursive_` (`ShadowTree.cpp:300-312`). Our visibility pass may run off
   the JS thread (scroll) while RN commits from JS — same concurrency `ShadowTreeMutator`
   already tolerates, but a high-frequency scroll pass could contend/lose races and waste
   commits. Need: coalesce to ≤1 commit/frame, and treat `Failed`/`Cancelled`
   (`ShadowTree.h:32-34`) as "recompute next frame" rather than retry-hammer.
4. **Recycling handoff (Strategy a).** Structural pruning frees native views but loses
   scroll-restore state and item component state. Need a policy: keep a recycled-family
   pool vs. let RN recreate; how to reconcile with JS re-renders that assume stable
   children. This is the biggest unknown and should stay out of v1.
5. **State reads off-thread.** Reading `ScrollViewState`/`getContentOriginOffset` from
   the mount hook is safe (immutable committed revision), but reading the *live* offset
   for a scroll pass should come from the scroll event payload, not by racing the shadow
   tree, to avoid a stale/torn frame.
6. **Coordinate-space correctness.** We must replicate the origin-carry and transform
   composition RN does (`CullingContext.cpp:64-75`) for nested/transformed lists; getting
   this subtly wrong culls visible rows. Reuse `LayoutObserver`'s existing origin walk.

---

STATUS: DONE
