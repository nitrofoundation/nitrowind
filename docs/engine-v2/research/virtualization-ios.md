# Virtualization on iOS — how RN 0.86 does it, and how the list engine mirrors it

Research target: `node_modules/react-native` @ **0.86.0**. This documents how React
Native's Fabric `VirtualView` machinery hides offscreen views on iOS and drives
visibility from the ScrollView, then maps that onto the list engine's own
shadow-node-based virtualization (`ShadowTreeMutator` + `LayoutObserver` + linked
`ShadowNodeFamily`s), which will **not** rely on RN's `VirtualView` component or its
feature flags.

Everything below is rename-agnostic: "the list engine" == the future `nitrolist`
package; "the container" == whatever component owns the scroll surface.

---

## 1. RN 0.86 iOS VirtualView / offscreen hiding

RN's approach is a component-per-item model: each virtualizable item is wrapped in a
native `VirtualView` host view. A per-scrollview coordinator computes each item's
rect relative to the scroll view, classifies it into one of three **modes**
(Visible / Prerender / Hidden), and (a) fires a JS event so React can mount/unmount
children, and (b) optionally sets `hidden` on the native view directly.

### 1a. The three modes and render states

`React/Fabric/Mounting/ComponentViews/VirtualView/RCTVirtualViewMode.h`:

```objc
using RCTVirtualViewMode = NS_ENUM(NSInteger){
    RCTVirtualViewModeVisible   = 0,
    RCTVirtualViewModePrerender = 1,
    RCTVirtualViewModeHidden    = 2,
};
```

`.../VirtualView/RCTVirtualViewRenderState.h`:

```objc
using RCTVirtualViewRenderState = NS_ENUM(NSInteger){
    RCTVirtualViewRenderStateUnknown  = 0,
    RCTVirtualViewRenderStateRendered = 1,
    RCTVirtualViewRenderStateNone     = 2,
};
```

`mode` = where the item is relative to the viewport (native-computed). `renderState`
= whether JS currently has real children mounted (JS-reported back down as a prop).
The pair is used to avoid redundant sync round-trips (see §1e).

### 1b. The coordinator: `RCTVirtualViewContainerState`

Path: `React/Fabric/Mounting/ComponentViews/ScrollView/RCTVirtualViewContainerState.mm`

One instance per ScrollView. It holds a set of registered virtual views, subscribes
itself to the scroll view as a `UIScrollViewDelegate`, and recomputes modes on every
scroll tick.

```objc
- (instancetype)initWithScrollView:(RCTScrollViewComponentView *)scrollView {
  ...
  _virtualViews    = [NSMutableSet set];
  _prerenderRect   = CGRectZero;
  _scrollViewComponentView = scrollView;
  _prerenderRatio  = ReactNativeFeatureFlags::virtualViewPrerenderRatio(); // default 5.0
  [_scrollViewComponentView addScrollListener:self];
}

- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
  [self _updateModes:nil];   // nil == recompute ALL registered views
}
```

Registration is pull-based: a virtual view calls `onChange:self` (on layout / on
attach) to add itself and get an immediate mode computation; `remove:` on recycle.

### 1c. Visible rect + prerender rect calculation

The heart of it (`_updateModes:`):

```objc
- (void)_updateModes:(id<RCTVirtualViewProtocol>)virtualView {
  auto scrollView = _scrollViewComponentView.scrollView;
  CGRect visibleRect = CGRectMake(
      scrollView.contentOffset.x,
      scrollView.contentOffset.y,
      scrollView.frame.size.width,
      scrollView.frame.size.height);

  _prerenderRect = visibleRect;
  _prerenderRect = CGRectInset(
      _prerenderRect,
      -_prerenderRect.size.width  * _prerenderRatio,
      -_prerenderRect.size.height * _prerenderRatio);   // grow outward by ratio * size

  NSArray *virtualViewsIt =
      (virtualView != nullptr) ? @[ virtualView ] : [_virtualViews allObjects];

  for (id<RCTVirtualViewProtocol> vv in virtualViewsIt) {
    CGRect rect = [vv containerRelativeRect:scrollView];   // item frame in scrollview coords

    RCTVirtualViewMode mode = RCTVirtualViewModeHidden;
    CGRect thresholdRect = _emptyRect;

    if (CGRectOverlaps(rect, visibleRect)) {
      thresholdRect = visibleRect;
      mode = RCTVirtualViewModeVisible;
    } else if (CGRectOverlaps(rect, _prerenderRect)) {
      mode = RCTVirtualViewModePrerender;
      thresholdRect = _prerenderRect;
    }
    [vv onModeChange:mode targetRect:rect thresholdRect:thresholdRect];
  }
}
```

Key facts:
- **visibleRect** = the viewport in content coordinates: origin at `contentOffset`,
  size = scroll view's own frame. (Note: it uses `frame.size`, not `bounds.size` /
  `adjustedContentInset`; safe-area insets are not accounted for here.)
- **prerenderRect** = visibleRect inflated by `prerenderRatio * size` on each axis
  (default ratio **5.0**, i.e. the prerender band is ~5 viewport-widths/heights of
  margin on every side — very generous). `CGRectInset` with negative insets grows.
- Classification is a plain overlap test against the two rects, in that priority
  order: Visible wins, else Prerender, else Hidden.
- `CGRectOverlaps` (file-local) differs from `CGRectIntersectsRect`: shared
  boundaries do **not** count as overlap, and zero-size line/point rects can still
  overlap. This is the exact predicate to copy if we want frame-boundary parity.

The item's own rect comes from the view side:

```objc
// RCTVirtualViewComponentView.mm
- (CGRect)containerRelativeRect:(UIView *)scrollView {
  return [self convertRect:self.bounds toView:scrollView];  // UIKit geometry, not shadow tree
}
```

So RN reads geometry from the **mounted UIView tree** at scroll time, not from
LayoutMetrics. That is a meaningful divergence from our plan (see §2).

### 1d. How offscreen views actually get `hidden = YES`

Consumption of the flag `hideOffscreenVirtualViewsOnIOS()` lives in
`RCTVirtualViewComponentView.mm`. Default is **false**
(`ReactNativeFeatureFlagsDefaults.h`: `hideOffscreenVirtualViewsOnIOS() { return false; }`),
so out of the box RN does NOT hide the native view — it only fires the JS event and
lets React unmount `children`. When the flag is on, the native view is toggled
directly, in two places:

Initial state, in `updateProps:` (first prop application):

```objc
if (!_mode.has_value()) {
  _mode = newViewProps.initialHidden ? RCTVirtualViewModeHidden : RCTVirtualViewModeVisible;
  if (ReactNativeFeatureFlags::hideOffscreenVirtualViewsOnIOS()) {
    self.hidden = newViewProps.initialHidden && !sIsAccessibilityUsed;
  }
}
```

On every mode transition, in `onModeChange:targetRect:thresholdRect:`:

```objc
if (ReactNativeFeatureFlags::hideOffscreenVirtualViewsOnIOS()) {
  switch (newMode) {
    case RCTVirtualViewModeVisible:   self.hidden = NO;                    break;
    case RCTVirtualViewModePrerender: self.hidden = !sIsAccessibilityUsed; break;
    case RCTVirtualViewModeHidden:    self.hidden = YES;                   break;
  }
}
```

Accessibility escape hatch: `sIsAccessibilityUsed` is a static BOOL flipped to YES
the first time `accessibilityElementCount` or `focusItemsInRect:` is called (VoiceOver
/ keyboard focus). Once set, prerender views stay visible and `_unhideIfNeeded`
un-hides on demand, so hidden items remain reachable by assistive tech. Any
visibility scheme we ship needs an equivalent, or offscreen items become invisible to
VoiceOver.

Recycling reset (`prepareForRecycle`): un-registers from the container, `self.hidden
= NO`, resets `_mode` / `_targetRect` / `_didLayout`. Important — the view is handed
back to the recycle pool in a *visible* state.

### 1e. Event dispatch: sync vs async (why two paths)

`onModeChange:` also emits a JS event so React can mount/unmount `children`. The
mode → dispatch policy:

- **Visible** → `_dispatchSyncModeChange` (synchronous, `experimental_flushSync`,
  `RawEvent::Category::Discrete`). Scrolling something into view must mount its real
  content *before* the next frame is presented, so there's no blank flash. It skips
  the sync dispatch only if we were already Prerendered *and* JS already committed
  rendered content (`_renderState == Rendered`).
- **Prerender** → `_dispatchAsyncModeChange` (normal async event), and only if we're
  not already Visible. JS handles it under `startTransition` so mounting is
  low-priority / interruptible.
- **Hidden** → `_dispatchAsyncModeChange` async; JS swaps children for `null` under
  `startTransition`.

JS side (`src/private/components/virtualview/VirtualView.js`): on Visible it
`setState(NotHidden)` and renders real `children`; on Hidden it renders `null` and
sets a placeholder style (`defaultHiddenStyle` → `{minHeight, minWidth}` of the last
known rect) so the item keeps its size and scroll position doesn't jump. It reports
`renderState` back down as a prop (`Rendered` / `None`), closing the loop the native
side reads in `updateProps:`.

**Takeaway for us:** RN's "virtualization" is really *content mounting/unmounting*
driven by native geometry, with an optional native `hidden` toggle layered on top.
The placeholder-keeps-size trick and the sync-on-enter/async-on-leave split are the
two behaviors most worth replicating regardless of mechanism.

### 1f. How the ScrollView wires it all together

Path: `.../ScrollView/RCTScrollViewComponentView.{h,mm}`

- Conforms to `RCTVirtualViewContainerProtocol` (`.h` line ~29). Single accessor,
  lazily constructing the coordinator:

```objc
- (RCTVirtualViewContainerState *)virtualViewContainerState {
  if (!_virtualViewContainerState) {
    _virtualViewContainerState = [[RCTVirtualViewContainerState alloc] initWithScrollView:self];
  }
  return _virtualViewContainerState;
}
```

- Scroll listeners multiplex through a delegate splitter, so the coordinator can
  observe scroll without stealing the delegate:

```objc
- (void)addScrollListener:(NSObject<UIScrollViewDelegate> *)l    { [self.scrollViewDelegateSplitter addDelegate:l]; }
- (void)removeScrollListener:(NSObject<UIScrollViewDelegate> *)l { [self.scrollViewDelegateSplitter removeDelegate:l]; }
```

  (`scrollViewDelegateSplitter` is an `RCTGenericDelegateSplitter<id<UIScrollViewDelegate>>`;
  the component view itself is also a delegate. This is the clean seam for *our* scroll
  source — see open questions.)

- A `VirtualView` finds its container by walking `superview` until it hits a view that
  responds to `virtualViewContainerState` (`_getParentVirtualViewContainer` in the
  component view). So the association is discovered structurally through the mounted
  view hierarchy, established in `didMoveToWindow`.

Related flags (`ReactNativeFeatureFlags.cpp` / `...Defaults.h`):
`virtualViewPrerenderRatio` (default `5.0`), `hideOffscreenVirtualViewsOnIOS`
(default `false`), `enableVirtualViewDebugFeatures` (default `false`, gates
`debugLog`). There is also `enableViewCulling`, a separate/lower-level Fabric feature
referenced in `RCTScrollViewComponentView.mm` (`_adjustForMaintainVisibleContentPosition`)
— not part of VirtualView; note it exists but treat as out of scope here.

---

## 2. Mapping onto the list engine

Our engine already has the three primitives this needs. Confirmed in-repo:

- **`ShadowTreeMutator`** — `packages/nitro-css/cpp/fabric/ShadowTreeMutator.hpp`:
  `static bool commit(const std::vector<NodeMutation>&)`, where
  `struct NodeMutation { Tag tag; folly::dynamic props; }`. It opens one
  `ShadowTree::commit` per surface and `ShadowNode::cloneTree`s the path from root to
  each mutated node, merging props via the component descriptor. **This is our
  visibility toggle** — no UIView `hidden` poke needed; we mutate props on the shadow
  node.
- **`LayoutObserver`** — `packages/nitro-css/cpp/fabric/LayoutObserver.{hpp,cpp}`:
  a `UIManagerMountHook` (`shadowTreeDidMount`) that walks the committed tree and reads
  `layoutable->getLayoutMetrics().frame` (size + origin) straight off shadow nodes.
  **This is our geometry source** — and, unlike RN, it's shadow-tree geometry, not
  UIKit `convertRect:`.
- **`LinkedNode`** — `packages/nitro-css/cpp/registry/LinkedNode.hpp`: keyed by
  `Tag`, holds the stable `ShadowNodeFamily::Shared` (survives per-commit
  ShadowNode replacement). **This is our per-item handle** and our registration set.

### 2a. The design (mode-parity, RN-flag-free)

We reproduce RN's Visible/Prerender/Hidden classification, but the entire loop lives
in C++ against the shadow tree, and the "hide" action is a **shadow-tree prop
commit**, not `self.hidden = YES`. Concretely:

1. **Container identification.** A linked node is tagged as a scroll container (same
   way `LayoutObserver` already discovers containers structurally during its walk).
   Its children (or a designated linked child range) are the virtualizable items.
2. **Item frames.** For each item family, read `getLayoutMetrics().frame` (origin +
   size) during the `LayoutObserver` walk. Frames are in the container's coordinate
   space already — no `convertRect:` needed. Cache per Tag.
3. **Viewport in content coords.** Need `contentOffset` + viewport size for the
   container. LayoutMetrics gives the container's frame (viewport size). The scroll
   *offset* is dynamic and is **not** in the committed shadow tree on every scroll
   tick — this is the one piece we must source from the mounted ScrollView (see open
   questions). `visibleRect = { offset.x, offset.y, containerFrame.width,
   containerFrame.height }`. Add safe-area/inset handling that RN skips.
4. **Prerender band.** `prerenderRect = visibleRect` inflated by
   `prerenderRatio * size` per axis. Make `prerenderRatio` a container-level prop
   (RN's global 5.0 default is huge; we can default lower per-item-cost, e.g. 1.0–2.0).
5. **Classify.** Port `CGRectOverlaps` exactly (boundary-exclusive) and apply the
   Visible > Prerender > Hidden priority against `visibleRect` / `prerenderRect`.
6. **Diff + commit.** Track each item's current mode. On change, batch a
   `NodeMutation` per transitioned item into one `ShadowTreeMutator::commit(...)`:
   - Hidden: commit props that unmount/detach content (or set a `hidden`-equivalent
     prop / zero-out children) while preserving a placeholder size so layout /
     scroll offset stays stable — mirror RN's `{minHeight,minWidth}` placeholder.
   - Prerender: commit props that mount content but keep it non-interactive/invisible
     if desired (or treat prerender == mount, matching RN's low-priority path).
   - Visible: commit props that mount + show real content.
   Because `ShadowTreeMutator` already coalesces mutations into a single commit per
   surface, an entire scroll-tick's worth of transitions is one commit.

### 2b. Where we intentionally diverge from RN

- **No per-item native `VirtualView` component, no JS round-trip for mode.** RN fires
  a JS event, waits for React to mount `children`, and reads `renderState` back. We
  compute mode and mutate the shadow tree directly in C++. That removes the
  sync/async dispatch dance (§1e) but also removes React's involvement — so *what*
  gets mounted/unmounted on Hidden has to be expressible as a shadow-tree prop
  mutation, not "render `null`". Decide early: do we detach subtrees, or just toggle a
  visibility/opacity/display prop and keep them laid out? (RN unmounts; cheaper memory,
  but re-mount cost on scroll-back. A display/hidden toggle keeps them resident.)
- **Geometry from LayoutMetrics, not UIKit.** More correct and available off the main
  UIView tree, but LayoutMetrics only updates on commit. Between commits, item frames
  are static (fine — items don't move relative to the container while scrolling); only
  the *offset* changes, which we get from the scroll source.
- **No feature flag.** `hideOffscreenVirtualViewsOnIOS` / `virtualViewPrerenderRatio`
  are RN-internal; we own our own container prop for prerender ratio and always-on
  behavior gated by our own per-container opt-in.
- **Accessibility.** We must add our own equivalent of `sIsAccessibilityUsed` /
  `_unhideIfNeeded`. If we detach subtrees on Hidden, VoiceOver can't reach them at
  all — worse than RN's `hidden` toggle. This is a real design constraint, not a
  nicety: decide whether Hidden detaches or merely visually hides.

---

## 3. Ordered build steps (iOS side) + open questions

### Build order

1. **Item-frame cache in `LayoutObserver`.** Extend the existing walk so that, for a
   node marked as a scroll container, it records `{ Tag → frame(origin,size) }` for
   each virtualizable child, plus the container's own frame. Store keyed by Tag on
   the container's linked state. No behavior change yet — just data.
2. **Scroll-offset source.** Get live `contentOffset` for the container's mounted
   `UIScrollView`. Cheapest parity path: on the iOS component-view side, attach a
   `UIScrollViewDelegate` via the ScrollView's delegate splitter (RN already exposes
   `addScrollListener:` / `removeScrollListener:` — see §1f) and forward
   `scrollViewDidScroll:` offset into C++. Resolve the container's `UIScrollView` from
   its Tag via the mounting layer. (Alternative: a Nitro/JSI callback pushing offset —
   heavier per frame.)
3. **Classifier module (C++).** Port `CGRectOverlaps` (boundary-exclusive) and the
   `visibleRect` / `prerenderRect` / Visible>Prerender>Hidden logic from
   `RCTVirtualViewContainerState._updateModes`. Pure function:
   `(offset, containerFrame, itemFrame, prerenderRatio) → Mode`. Unit-testable
   without a device.
4. **Mode state + diff.** Per container, keep `Tag → Mode`. On each scroll tick (and
   on each `shadowTreeDidMount` re-measure, to catch item resize like RN's
   `updateLayoutMetrics` → `onChange`), reclassify all items, collect transitions.
5. **Commit transitions via `ShadowTreeMutator`.** Translate each transition to a
   `NodeMutation { tag, props }` and `ShadowTreeMutator::commit(batch)`. Start with
   the simplest visible/hidden prop (e.g. a display/hidden-equivalent + placeholder
   size) before attempting subtree detach. Verify offset stability (placeholder must
   preserve item extent — RN's `{minHeight,minWidth}`).
6. **Debounce / coalesce.** One commit per scroll tick max; skip commit if no
   transitions. Consider a small hysteresis band so an item straddling the boundary
   doesn't flip Visible/Hidden every frame (RN leans on its 5.0 ratio + discrete
   thresholdRect for this; we should add explicit hysteresis).
7. **Accessibility pass.** Add the `sIsAccessibilityUsed`-equivalent un-hide path
   before shipping detach-on-Hidden.
8. **Container prop surface.** Expose `prerenderRatio` (and on/off) as a container
   prop; thread through to the classifier.

### Open questions

- **Scroll event source on iOS.** Delegate-splitter forwarding (RN's own seam) vs a
  JSI/Nitro scroll callback vs observing `contentOffset` via KVO. Delegate splitter is
  the least-surprising and matches RN, but it couples us to the mounted
  `RCTScrollViewComponentView`; a Nitro callback is engine-owned but fires on the JS
  thread. Which thread do we want to run the classifier + commit on? (RN's
  `_updateModes` runs on the main thread inside `scrollViewDidScroll:`.)
- **Prerender margins.** RN's default ratio 5.0 is enormous (mounts ~11 viewports of
  content). What's our default? Fixed px margin vs ratio? Directional (bias in scroll
  direction) vs symmetric? RN is symmetric and non-directional.
- **Recycling interplay.** RN pairs VirtualView with view recycling (`prepareForRecycle`
  resets `hidden=NO`, un-registers). If our engine also recycles host views, the
  virtualization mode state is keyed by `Tag`/family — need to define what happens when
  a family is recycled/re-used: reset mode to unknown, re-classify on next mount. Also:
  does Hidden detach the subtree (frees memory, plays badly with recycle pools and
  a11y) or just toggle visibility (keeps it resident)? Pick one before step 5.
- **Coordinate/inset correctness.** RN ignores `adjustedContentInset` / safe area
  (uses raw `contentOffset` + `frame.size`). Do we match RN (simpler) or correct it
  (better with headers / safe areas)? Correcting requires the inset from the mounted
  scroll view too.
- **When frames are unknown.** RN's `_didLayout` guard defers registration until the
  first layout. Our equivalent: don't classify an item until `LayoutObserver` has a
  cached frame for its Tag; treat unmeasured items as Prerender/Visible conservatively
  to avoid blanking content that hasn't laid out yet.

---

### Key source paths (RN 0.86, all under `node_modules/react-native/`)

- `React/Fabric/Mounting/ComponentViews/ScrollView/RCTVirtualViewContainerState.mm` — coordinator, visible/prerender rect + classification (`_updateModes`), scroll delegate.
- `React/Fabric/Mounting/ComponentViews/ScrollView/RCTVirtualViewContainerState.h`
- `React/Fabric/Mounting/ComponentViews/ScrollView/RCTVirtualViewContainerProtocol.h` — `virtualViewContainerState` accessor.
- `React/Fabric/Mounting/ComponentViews/ScrollView/RCTVirtualViewProtocol.h` — `containerRelativeRect:` / `onModeChange:`.
- `React/Fabric/Mounting/ComponentViews/VirtualView/RCTVirtualViewComponentView.mm` — `hidden` toggle, flag consumption, sync/async dispatch, a11y, recycle.
- `React/Fabric/Mounting/ComponentViews/VirtualView/RCTVirtualViewMode.h`, `RCTVirtualViewRenderState.h` — enums.
- `React/Fabric/Mounting/ComponentViews/ScrollView/RCTScrollViewComponentView.{h,mm}` — container conformance, delegate splitter, `addScrollListener:`.
- `ReactCommon/react/featureflags/ReactNativeFeatureFlags.cpp` + `ReactNativeFeatureFlagsDefaults.h` — `hideOffscreenVirtualViewsOnIOS` (false), `virtualViewPrerenderRatio` (5.0), `enableVirtualViewDebugFeatures` (false).
- `src/private/components/virtualview/VirtualView.js` — JS mount/unmount + placeholder-size behavior, `renderState` reporting.

### Engine primitives to build on (in-repo)

- `packages/nitro-css/cpp/fabric/ShadowTreeMutator.hpp` — `commit(vector<NodeMutation{Tag,folly::dynamic props}>)`.
- `packages/nitro-css/cpp/fabric/LayoutObserver.{hpp,cpp}` — `shadowTreeDidMount` walk reading `getLayoutMetrics().frame`.
- `packages/nitro-css/cpp/registry/LinkedNode.hpp` — `Tag` → `ShadowNodeFamily::Shared` per-item handle.

STATUS: DONE
