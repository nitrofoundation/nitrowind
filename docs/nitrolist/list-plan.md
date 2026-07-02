# NitroList (`@nitrofoundation/nitrolist`) — Product & API Plan

> Companion doc: [architecture.md](./architecture.md) (how it's built). This doc: what we ship, the API,
> the compatibility contract, and the phased path. Based on deep research into LynxJS `<list>`,
> FlashList v2, Legend List, Wishlist (post-mortem), Shadowlist, Meta's experimental `VirtualView`
> ("Fling"), Texture/AsyncDisplayKit, Litho, UICollectionView/RecyclerView internals, and the
> Reanimated/Gesture-Handler integration contracts.

## 1. Goal & the honest feasibility answer

**Goal:** a list with the Lynx `<list>` API (but better), running on React Native, with native layout
features (grid/waterfall/sticky/snap computed natively, measurement off the JS thread), and **usable
with Reanimated, Gesture Handler, and the rest of the RN ecosystem**.

**Is "fully native cells + works with every RN library" possible? No — proven by evidence, not opinion:**
- Reanimated attaches by ShadowNode/viewTag; RNGH attaches by React view tag. Natively-created
  cells have neither → `useAnimatedStyle`, CSS animations, `GestureDetector`, `Swipeable`, expo-image
  recycling hooks are all structurally unavailable inside native-born cells.
- Everyone who tried template/native cells retreated: RN core's `RecyclerViewBackedScrollView`
  (removed 2016, "maintenance cost not worth the risk"), **Wishlist** (Margelo × SWM — fast, zero
  blanks, archived anyway because every component needed rewriting: no hooks, no RNGH, no Reanimated),
  Lynx itself only works because the *whole framework* was co-designed around it.
- The two healthiest lists (FlashList v2, Legend List) both deleted/avoided native code and render a
  real RN ScrollView precisely to keep ecosystem compat.

**So NitroList's thesis:** keep **cells as ordinary React subtrees** (100% ecosystem compat) and put
the native power where nobody else has it — a **C++ layout/virtualization engine** (we already own
one in nitrocss) that does off-JS-thread measurement, exact content size, anchor-stable corrections,
native grid/waterfall math, and UI-thread scroll processing. That's the gap none of the JS lists can
close: they are all JS-thread-bound (a busy JS thread blanks FlashList and Legend List equally), and
Meta's own answer (`VirtualView`) validates the direction but ships no list on top of it yet.

**Alternatives ladder (as requested):** if/where full native behavior isn't possible, each feature has
a defined fallback — see §6.

## 2. Package & positioning

- **npm:** `@nitrofoundation/nitrolist`. Depends on `@nitrofoundation/nitrocss` native infra
  (Nitro module scaffolding, C++ engine build, ShadowTree access already proven in-tree).
- New-Architecture-only (Fabric, RN ≥ 0.85). No old-arch mode (FlashList v2 set the precedent).
- Works standalone (plain RN styles) and integrates with nitrocss/nitrowind `className` styling.

## 3. API surface (Lynx-parity, RN-idiomatic)

### 3.1 Components

```tsx
<NitroList
  data={items}                      // identity-driven; changesets diffed in C++
  keyExtractor={(it) => it.id}      // Lynx item-key (REQUIRED, stable, unique)
  renderItem={({ item, index }) => <Card item={item} />}
  getItemType={(it) => it.kind}     // Lynx reuse-identifier (recycle pools per type)

  listType="waterfall"              // 'single' | 'flow' | 'waterfall'   (Lynx list-type)
  spanCount={2}                     // Lynx span-count
  horizontal={false}                // Lynx scroll-orientation
  mainAxisGap={10} crossAxisGap={10}// Lynx list-*-axis-gap (CSS gap also works via className)

  stickyEnabled sticky-offset...    // stickyOffset={50}
  itemSnap={{ factor: 0, offset: 0 }}         // Lynx item-snap (paging)
  preloadBufferItems={6}            // Lynx preload-buffer-count
  drawDistance={250}                // px overscan (velocity-scaled internally)
  initialScrollIndex={0}
  maintainVisibleContentPosition    // default ON (chat-safe), {disabled, autoscrollToTopThreshold,
                                    //  autoscrollToBottomThreshold, startRenderingFromBottom}
  inverted={false}                  // prefer startRenderingFromBottom + alignItemsAtEnd (Legend-style)
  updateAnimation="default"         // 'default' | 'none' | ItemAnimationConfig — NATIVE insert/remove
                                    //  animations (replaces Reanimated entering/exiting in lists, §5)
  refreshControl={<RefreshControl …/>}
  onEndReached / onEndReachedThreshold          // px or…
  onStartReached / endReachedItemCount={3}      // Lynx lower-threshold-item-count (item-based)
/>
```

Per-item control (props on the rendered item wrapper or via `overrideItemLayout`):
- `estimatedItemSize` (list-level) + `getEstimatedItemSize(index, item)` — Lynx
  `estimated-main-axis-size-px`. Optional hint only; engine self-tunes per-type averages
  (FlashList-v2 style) and corrects pre-paint. **Never a correctness requirement.**
- `fullSpan` (Lynx full-span), `stickyTop` / `stickyBottom` (Lynx sticky, both edges),
  `recyclable={false}` (Lynx opt-out — heavy cells keep their subtree).

### 3.2 Events (all worklet-compatible)

| Event | Lynx equivalent | Notes |
|---|---|---|
| `onScroll` | `bindscroll` | **Bit-compatible `NativeScrollEvent`** (contentOffset/contentSize/layoutMeasurement/contentInset/velocity/zoomScale) → `useAnimatedScrollHandler` just works. `eventSource: 'scroll' \| 'diff' \| 'layout'` extra field (Lynx `ListEventSource`). |
| `onScrollStateChange` | `bindscrollstatechange` | idle / dragging / fling / animating |
| `onStartReached`/`onEndReached` | `scrolltoupper/lower` | item-count thresholds supported |
| `onSnap` | `bindsnap` | fired before settle, with target offset |
| `onLayoutComplete` | `bindlayoutcomplete` | `{ layoutId, diffResult {insertions,removals,moves,updates}, visibleCellsBefore/After, isBinding flags }` |
| `onVisibleItemsChanged` | `need-visible-item-info` | attached cells `{itemKey,index,frame}` |

### 3.3 Imperative ref (duck-typed to the ScrollView contract — react-navigation/keyboard libs work)

`scrollToIndex({index | itemKey, align: 'top'|'middle'|'bottom', offset, animated})` (Lynx
`scrollToPosition` incl. 3.6's itemKey variant, but **async — returns a Promise** like Legend v3),
`scrollToOffset`, `scrollToEnd`, `scrollBy → {consumed, unconsumed}`, `autoScroll({ratePxPerSec,
start, autoStop})`, `getVisibleCells()`, `getScrollInfo()`, plus the compat trio
`getScrollResponder() / getScrollableNode() / getNativeScrollRef()` and RCTScrollView-compatible
native commands (hard requirement for Reanimated `scrollTo`, `useScrollToTop`, keyboard-aware libs).

### 3.4 Recycling-hygiene hooks (day-one, FlashList-v2 lessons)

- `useRecyclingState(initial, deps, onReset?)` — state that resets on recycle without an extra render.
- `useRecyclingEffect(cb)` — runs on container reassignment (Legend-style prev/next info).
- `useMappingHelper()` — recycling-safe keys for `.map()` content.
- `useListItemContext()` — `{index, itemKey, recycleGeneration}`; `recycleGeneration` feeds
  `expo-image`'s `recyclingKey` and Swipeable resets.
- `defer` per item (Lynx `defer`): item renders async off the critical path with an estimated
  placeholder; `{ unmountRecycled: true }` unmounts on recycle.

### 3.5 What we deliberately do NOT ship (v1)

- No Wishlist-style worklet/template cell DSL as the general API (its post-mortem is unambiguous).
  A **static template fast path** (`<NitroList.TemplateItem>` with keypath bindings, e.g. for
  homogeneous feeds/tickers) is a possible opt-in v3 experiment — never marketed as generally compatible.
- No `renderScrollComponent` in native-container mode (structurally impossible there); provided in
  Phase-1 mode only.

## 4. Compatibility contract (the checklist that makes "works with everything" true)

1. Cells are React subtrees mounted by the reconciler; cell wrappers are custom host components
   (never view-flattened).
2. Scroll events bit-compatible with `RCTScrollView` (`topScroll` family + throttle) — Reanimated,
   collapsible headers, Animated.event all keep working.
3. Ref duck-typing per §3.3 — react-navigation `useScrollToTop`, keyboard-aware libs.
4. `RefreshControl` adoption: iOS `RCTCustomRefreshControlProtocol` path + Android
   SwipeRefreshLayout wrap; plus first-class `onRefresh`/`refreshing` props.
5. RNGH: Phase 1 inherits full compat (real RCTScrollView). Phase 2 (native container) requires the
   upstream work we've scoped: iOS `retrieveScrollView` whitelist / state-mirroring handler; Android
   `NativeViewGestureHandlerHook` + orchestrated `requestDisallowInterceptTouchEvent` +
   `onChildStartedNativeGesture` dispatch. Phase 2 does not ship until these land.
6. Reanimated layout animations **cannot work in any recycled list** (attach at mount/unmount —
   FlashList closed it "not planned"). Replacement: native `updateAnimation` item animations driven
   by the C++ diff (UICollectionView batch updates / RecyclerView ItemAnimator semantics, or
   ShadowTree-side via MountingOverrideDelegate). Documented loudly.
7. Accessibility: item-position-in-collection info, a11y state reset on rebind, pre-rendered next
   focus target (the class of bugs RN's JS lists have never fixed — native container mode wins here).
8. RTL: engine mirrors offsets/scrollToIndex/paging (chronic JS-list failure class — we own the math).

## 5. Milestones

| Phase | Deliverable | Gate |
|---|---|---|
| **P0 — Bench harness** | FlashList v2's own stress suite + Lynx gallery ported; FPS/blank-area/TTI/memory baselines vs FlashList v2, Legend v3, FlatList | numbers published in repo |
| **P1 — Core list** (arch Phase 1, see architecture.md) | single/flow layouts, C++ virtualizer + off-thread pre-measure, exact contentSize, mVCP default-on, sticky, snap, chat props, hooks, full compat contract §4 | beats FlashList v2 on blank-area under JS-thread load; zero compat regressions in an example app using Reanimated+RNGH+expo-image |
| **P2 — Waterfall + native container mode** | staggered layout; opt-in native scroller (UICollectionView/RecyclerView-class) behind `experimental_nativeContainer`; RNGH upstream PRs | parity checklist §4.5 green |
| **P3 — Extras** | `defer` items, native update animations, autoScroll, a11y CollectionInfo, template fast-path experiment | — |

## 6. Fallback ladder (per feature, when native isn't possible)

| Feature | Native ideal | Fallback that still ships |
|---|---|---|
| Off-thread measure | C++ clone+layout of ShadowNode subtrees (proven: `SurfaceHandler::measure`) | per-type running averages + pre-paint `useLayoutEffect` correction (FlashList-v2 semantics) |
| Native container scroll | UICollectionView/RecyclerView-class custom scroller | real `RCTScrollView` + C++ assists (Phase 1 IS this) |
| Item animations | native diff-driven animator | JS opacity/transform presets via the same diff events |
| Blank-free fast fling | UI-thread sync prerender (VirtualView-style `experimental_flushSync` + Discrete events) | velocity-scaled draw buffer + `defer` placeholders |
| Gestures in cells during Phase 2 | RNGH hooks upstreamed | stay in Phase-1 mode (full RNGH compat) |

## 7. Risks

- **Fabric internals churn** (MountingOverrideDelegate, commit branching, VirtualView graduating):
  pin per-RN-version adapters; the engine core is RN-agnostic C++.
- **Meta ships "Fling" VirtualCollection** as the official list: our differentiators remain native
  layout managers (waterfall/grid/sticky/snap), Lynx-parity API, and chat ergonomics; re-base the
  windowing on VirtualView if/when it stabilizes (it's designed for exactly our prerender model).
- **RNGH upstream latency** for Phase 2: Phase 1 is fully shippable without it.
- Recycle-state leakage is a permanent education burden (even Reanimated's internal caching,
  issue #6203) — hooks + docs + lint rule.
