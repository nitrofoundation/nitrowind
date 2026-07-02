# NitroList — The Three Variants

> Companions: [list-plan.md](./list-plan.md) (base product plan), [architecture.md](./architecture.md)
> (core internals). This doc: three concrete list architectures, each planned to implementation
> depth, sharing one C++ core. Research basis: LynxJS `<list>` + Starlight (source-verified),
> Snapchat Valdi/Composer (source-verified — including the finding that **Valdi has no list
> component at all**), RN `unstable_VirtualView`/VirtualCollection "Fling" (RN 0.86 shipped source),
> FlashList v2, Legend List, Wishlist post-mortem, Shadowlist, Texture, Litho, Fabric
> commit/mount internals, react-native-worklets `runSync`, and the Reanimated/RNGH integration
> contracts.

## Why three variants

The research converged on a hard truth: **there is no single best list architecture** — there is a
three-way trade among scroll-perf ceiling, ecosystem compatibility, and memory. Each corner has a
production-proven exemplar (Lynx, Valdi, FlashList/VirtualView respectively), and each maps to a
different app profile. All three share one C++ core, so building them is mostly additive.

| | **A — NitroListLynx** | **B — NitroListValdi** | **C — NitroListVirtual** |
|---|---|---|---|
| Model | Engine-owned sync fill via **compiled template cells** + React hydration | **Virtualize views, not components** — all fibers alive, native views detach/pool | React-owned cells + C++ windowing/measure/anchor over a real RCTScrollView |
| Exemplar | Lynx `componentAtIndex` | Valdi `limitToViewport` + global pools | FlashList v2 + VirtualView mechanisms |
| Best for | Fling-critical template-able feeds/chat; blanks are product defects | State-heavy cells (video, forms, swipeables, editors); ≤~2k items eager | General purpose; unbounded lists; ships first |

## The shared C++ core (~8 engineer-weeks, built once)

All variants consume the same `packages/nitrolist/cpp` core, which extends nitrocss assets
(ShadowTreeMutator, LayoutObserver mount hook, GridLayoutEngine, DependencyIndex, the
GradientApplier engine→platform push channel, Nitro/nitrogen scaffolding):

- **Virtualizer + Fenwick frame store** — per-span sorted frames + Fenwick (BIT) prefix sums over
  main-axis sizes. `offset(index)` and `indexAt(offset)` in O(log n); a size correction is one point
  update; window diffs are range arithmetic (O(changed)). Beats both of RN's VirtualView containers
  (iOS O(n) set scan; Android interval tree) because *we own layout* — frames are non-overlapping
  and monotonic per span. This store IS the index→offset map that powers `scrollToIndex`, mVCP and
  bidirectional growth. Property-tested against a naive O(n) oracle.
- **LayoutManagers** — linear / grid(flow) / staggered(waterfall) over absolute frames; `fullSpan`
  column barriers; RTL mirrored engine-side.
- **AnchorManager** — anchor deltas applied to contentOffset **in the same commit** as size
  corrections (pre-paint, unanimated; non-React commits mount synchronously — verified RN 0.86);
  two-phase contentSize (measured prefix + frozen per-type average); iOS preserve-offset-while-
  tracking, Android fling re-aim; `maintainVisibleContentPosition` + `startRenderingFromBottom`.
- **MeasureCoordinator** — off-thread pre-measure of cloned ShadowNode subtrees
  (`SurfaceHandler::measure` precedent; Yoga thread-safe per tree; text measure `@AnyThread` on
  Android, per-call TextKit on iOS); serial editing queue + work-stealing parallel-for (Texture).
- **DiffApplier** — Myers diff on itemKeys off-thread (latest-wins) → index changesets → window
  updates, native update animations (our `MountingOverrideDelegate`, chained with Reanimated's),
  `eventSource: 'diff'|'layout'|'scroll'` tagging (Lynx).
- **Budgeting** — GapWorker-style per-itemType create/bind running averages (¾/¼ blend) capping
  per-frame work; velocity-directional buffers (Texture defaults: preload 2.5/1.5, display 1.0/0.5
  screenfuls); Minimum/LowMemory range modes on memory pressure.
- **Scroll-event conformance** — bit-compatible `NativeScrollEvent` + `scrollEventThrottle`, tested
  by diffing our stream against RCTScrollView's for recorded gesture traces.

---

# Variant A — NitroListLynx

**Sync fill on the UI thread with zero JS on the hot path.** The only RN architecture that can fill
cells inside the scroll callback itself — Lynx's zero-blank guarantee — without Wishlist's fatal DX.

## How

- **Template cells, compiled by our Metro transformer** (we own it in nitrocss). A cell component
  marked `'use template'` (or `<NitroList.Item template>`) is compiled to: (1) a static
  element-tree descriptor `{type, styleTableId | styleBindingSlot, staticProps, bindings, children}`;
  (2) a binding-table bytecode for a ~200-line C++ BindingVM (whitelisted expressions only: member
  access, ternary, concat, `??`/`&&`/`||`, comparisons); (3) an auto `reuse-identifier` (descriptor
  hash); (4) a field manifest so JS marshals only the item fields templates read. The **same JSX**
  remains the React component used for hydration — one source of truth.
  Rejections are build errors with code frames (`NL-T001 unsupported expression`, …) or, with
  `templateStrict: false`, runtime fallback to the `defer` path + `onTemplateFallback` event.
  nitrocss `className` styles are precompiled style tables, so a conditional class is a
  **table-index select evaluable in pure C++** — no JS ever runs for styling.
- **Dumb native scroller** (`NitroListScrollView`): plain UIScrollView / FrameLayout+OverScroller
  (Lynx abandoned UICollectionView/RecyclerView for consistency; we inherit that). contentSize /
  offset / sticky frames pushed from C++ via the GradientApplier-style channel.
- **Per scroll frame (UI thread, zero JS):** scroll callback → Virtualizer window diff → per missing
  index: pool hit → BindingVM slot delta → clone-commit only changed nodes; pool miss → instantiate
  descriptor via `ComponentDescriptorRegistry`; no template → native placeholder at engine frame +
  async React render (Lynx `defer` handshake). One `ShadowTree::commit` per frame batches cells +
  positions + contentSize + anchor corrections; `mountSynchronously=true` (default for non-React
  commits) mounts re-entrantly before the callback returns.
- **Hydration handoff (no flicker by construction):** cell containers are React-owned from birth
  with empty children; the engine commits template children into the container's family. React's
  hydration commit never contained the template children — the commit that mounts the real children
  **is** the commit that drops the template ones: one atomic mount transaction. Layout parity is
  guaranteed by compiling both from one JSX + one style table (dev-mode LayoutObserver assertion);
  Image handles carry over so Fabric's mount diff reuses the platform view (no re-decode flash).
  Policies: `hydrationPolicy="idle" | "visible" | "never" | {budgetMs}` + **eager**: touch-down on
  an interactive template cell fires the VirtualView recipe (Discrete RawEvent +
  `experimental_flushSync`) → sync React render → gesture proceeds on the hydrated tree.
- **Phase-2 escape hatch:** `WorkletRuntime::runSync` (react-native-worklets ships it as public
  C++ API) for binding *formatters* only — data in, slot values out, never element construction.
  This keeps the entire Wishlist failure surface permanently out of scope.

## API sketch

```tsx
'use template';
export function MessageBubble({ item }: { item: Message }) {
  return (
    <View className={item.mine ? 'row-reverse px-4 py-1' : 'row px-4 py-1'}>
      <Image source={{ uri: item.avatarUrl }} className="w-8 h-8 rounded-full" />
      <View className={'bubble ' + (item.mine ? 'bg-blue-500' : 'bg-gray-200')}>
        <Text className="text-[15px]">{item.text}</Text>
        <Text className="text-xs opacity-60">{item.pending ? 'sending…' : item.timeLabel}</Text>
      </View>
    </View>
  );
}
// <NitroList engine="lynx" data renderItem getItemType listType spanCount sticky itemSnap
//   estimatedItemSize preloadBufferItems drawDistance maintainVisibleContentPosition
//   updateAnimation hydrationPolicy onTemplateFallback ... />
// hooks: useHydrated(), useListItemContext() → {index, itemKey, recycleGeneration, isHydrated}
```

## Compat, effort, risks

- Template cells non-interactive until hydration (~1–3 frames at rest; eager path covers
  tap-as-scroll-stops). RNGH/Reanimated attach post-hydration. Dumb scroller puts the **RNGH
  native-container checklist on the critical path** (iOS `retrieveScrollView` whitelist/protocol,
  Android `NativeViewGestureHandlerHook` + disallow-intercept orchestration +
  `onChildStartedNativeGesture`) — ships without it through Phase A3 with degraded scroll-vs-pan
  arbitration only. Reanimated layout animations in cells: impossible (any recycled list); replaced
  by native `updateAnimation`. a11y is an *advantage*: engine container can emit CollectionInfo and
  serve VoiceOver traversal past the window via template instantiation.
- **Effort ≈ 32–42 ew** (A0 scroller+engine 7–9, A1 template compiler+sync fill 9–11, A2 hydration
  6–8, A3 layout parity 6–8, A4 RNGH upstream + runSync hatch 4–6).
- Top risks: Fabric churn (per-RN adapters + nightly CI), template-subset creep (versioned tiny
  subset; extensions must be BindingVM-evaluable or routed to runSync; rejections degrade to defer),
  two-owners-of-children invariant (state machine + dev asserts), Android scroller parity.

**Scorecard:** scroll ceiling **5** · blanks **5**(templates)/3(fallback) · ecosystem **3** ·
cost **2** · maintenance **2** · chat/mVCP **5** · TTI **5**

---

# Variant B — NitroListValdi

**Nothing ever recycles at the React level.** Valdi's 8-years-in-Snapchat model: every item's fiber
tree stays alive; scrolling only attaches/detaches *native views* from global pools via a JS-free
C++ scroll path. The entire recycle-bug class (state leaks, Swipeable ghosts, image flashes,
`useRecyclingState` hygiene) is eliminated **by construction** — there is deliberately no
`useRecyclingState` in this API.

## How

- **Detach mechanism — staged (a)→(b):**
  - *(a) Phase 1 (ships first):* cell wrappers freeze to last-measured size and hide children via
    `<Activity mode="hidden">` (fibers/state preserved, host views deleted → **iOS's always-on
    mounting pool recycles them for free**). Scroll-back is a React render (mitigated by sync
    Discrete reveal + fat `viewportExtension`).
  - *(b) End state (`experimental_nativeDetach`):* all cells stay **committed in the ShadowTree**
    (exact Yoga layout for everything → exact contentSize, always). Our `MountingOverrideDelegate`
    suppresses Create/Insert for out-of-extension cells; scroll drives a pure native loop —
    C++ visibility diff → synthesized attach/detach mutation batches through the mounting layer,
    same frame. **Scroll-back needs zero React/JS work — Valdi's actual property.** React commits
    targeting detached cells queue per-cell and replay merged on attach. Mechanism (a) remains the
    per-RN-version fallback behind the same API.
- **Android view pools** (OSS pools are flag-off): global class-keyed `NativeViewPool` with
  framework-enforced apply/reset pairs (prop-diff-against-defaults — "never trust user cleanup",
  Valdi's rule), per-cell veto (focused TextInput, active gesture, `pinned`), idle pre-warm
  (ViewPreloader analog), memory-pressure trim. iOS rides `RCTComponentViewRegistry`.
- **Windowing:** `viewportExtension={{top, bottom}}` in **px per edge** (Valdi's primitive — better
  than windowSize multiples: directional, unit-stable), velocity-skewed.
- **`preserveScrollPosition` — Valdi's chat algorithm ported verbatim:** anchor = item at the
  **viewport center line** (leading edge lands on chrome); refresh anchor every scroll frame + every
  layout pass; on reflow re-derive **absolutely** (`newOffset = newAnchorTop − recordedScreenPos`,
  never `+= delta`); apply only while stationary; skip anchors that lost layout. Separate
  `maintainScrollAnchor: 'top'|'bottom'` edge pinning for pagination/chat-tail.
- **Scroll signals as SharedValues:** C++ writes `scrollOffset` + a header-frames table into the
  Reanimated UI runtime per frame — sticky headers/parallax are worklets, beating Valdi's own
  documented "sticky via JS scroll events: jank vs ANR" tradeoff. Snap = sync `onDragEnding`
  worklet + native offset-override channel (engine asks "override this settle target?" per drag-end).
- **Tiers:** eager (exact layout, O(N) nodes; progressive `initialRenderCount`+`renderIncrement`
  first paint) and per-item `lazy` (1 placeholder node until `lazyExtension`; escalates to sync
  Discrete flush with a strict time budget; once inflated, eager forever). **Honest ceiling:**
  ~500–2,000 items eager on mid-range devices (~30–80 KB/cell); 10k requires the lazy tier;
  dev-mode memory telemetry + threshold warning built in.

## Compat, effort, risks

- **Strongest compat of the three** — the variant's raison d'être: running Reanimated animations
  survive detach; **entering/exiting layout animations actually work** (real mounts only on data
  changes — impossible in any recycling list); Swipeable open-state survives scroll-away; video
  keeps position; TextInput focus vetoes detach; no `recyclingKey` needed. Caveats: a11y for
  detached views (CollectionInfo + widen extension under screen readers + attach-on-focus-request),
  Suspense in lazy cells (transition-first rule), delegate-ordering contract with Reanimated (b).
- **Effort ≈ 18–23 ew** (V0 API on mechanism-a 3–4, V1 C++ visibility+anchoring 4–5, V2 iOS native
  detach 5–6, V3 Android pools+detach 3–4, V4 lazy tier+polish 3–4). **V0+V1 (~8 ew) independently
  shippable** as the compat-first list.
- Top risks: memory at scale (structural; don't stretch it — point users to C), mounting-layer
  coupling in (b) (per-RN adapters + (a) fallback + StubViewTree feeding), pending-mutation replay
  correctness (property tests; degrade to (a) per cell).

**Scorecard:** scroll ceiling **4** · blanks **5** · ecosystem **5** · cost **2** ·
maintenance **2** · chat/mVCP **5** · TTI **4** · memory@10k **2**

---

# Variant C — NitroListVirtual

**The default.** Real `RCTScrollView`, React-owned cells (zero compat asterisks), C++ engine doing
what no JS list can: off-thread pre-measure, exact two-phase contentSize, in-commit anchoring, and
our own both-platform mode container borrowing VirtualView's verified mechanisms while fixing its
gaps (per-list prerender distance, velocity-directional, **coalesced** sync dispatch, index→offset
map instead of Fling's tail spacer).

## How

- **Hybrid `recycleMode` (default), prop-selectable:** cells leaving the window are **shed** first
  (VirtualView-style: children → null under a frozen *engine-frame* style; fibers/state preserved —
  the chat/forms sweet spot) and only **recycled** (FlashList-style key reassignment,
  `recycleGeneration++`, reset hooks) beyond a per-type `fiberBudget`. State-hygiene burden becomes
  *proportional to list size*: small lists behave like pure `shed` (no hygiene at all), 10k flings
  behave like pure `recycle` (bounded memory). Pure `'shed'`/`'recycle'` modes available.
- **Mode protocol per scroll tick (UI thread):** engine computes visible/prerender rects
  (velocity-weighted) → range arithmetic yields `revealNow` / `prerender` / `hide` deltas →
  **one event per tick, not per cell**: `revealNow` rides Discrete + `experimental_flushSync`
  (render + commit + mount before the frame presents), `prerender` rides async + `startTransition`,
  with renderState dedup (a Prerender-committed cell's reveal is pure engine bookkeeping, zero JS).
  Cell positions flow through per-cell Fabric state slots — the list root never re-renders on scroll.
- **Stale-hidden-size fix (VirtualView's known hole):** the frozen style is the *engine's* Fenwick
  frame, not a cached snapshot; a hidden cell whose data changes is briefly promoted to Prerender →
  background commit → Fenwick update + anchor correction in-commit → demoted with the new frame.
  The engine, not the cell, owns frozen sizes — the stale-`minHeight` bug class cannot occur.
- **First paint:** clone-measure the initial viewport **before** first mount — first frames are
  final frames (beats FlashList v2's empty first render cycle).
- **Time-boxed sync reveal:** ~4 ms budget; predicted overrun (per-type running bind cost) →
  async + native placeholder at the exact engine frame; chronically heavy types auto-blacklist.
  `syncReveal: 'off'` degrades to FlashList-class blank resistance — churn in experimental APIs can
  reduce blank resistance but never correctness.

## API sketch

FlatList/FlashList-familiar + Lynx parity (see list-plan.md §3), plus:
`recycleMode="hybrid" fiberBudget={40} prerenderDistance={1.5} syncReveal="auto" hiddenStyle={…}`;
hooks add `renderPhase: 'visible'|'prerender'` to `useListItemContext()` (heavy cells self-degrade
during background prerender); `scrollToIndex` returns a Promise and **re-aims mid-flight** as real
measurements land (structurally impossible in Fling's spacer model).

## Compat, effort, risks

- **Zero asterisks**: Reanimated styles/scroll handlers, RNGH, RefreshControl, keyboard libs,
  react-navigation, expo-image (`recycleGeneration`), a11y via real views under a real ScrollView.
  Entering/exiting animations work in shed/hybrid-within-budget regions — documented boundary
  beyond. Only RN couplings: `experimental_flushSync`/Discrete + commit hooks, isolated behind thin
  per-RN adapters that degrade rather than break.
- **Effort ≈ 24 ew total, ~16 after the shared core** (C0 bench 1.5, C1 core+recycle-mode list 4,
  C2 shed/hybrid + freeze 3, C3 sync reveal + sticky/snap/RTL 3.5, C4 waterfall/defer/animations 4).
  **C1 is independently shippable.**
- Top risks: experimental API churn (adapters, CI on RN latest+previous), sync-reveal budget
  (hard time box + placeholder fallback), Fenwick/window edge cases (property-tested vs O(n) oracle).

**Scorecard:** scroll ceiling **4** · blanks **4** · ecosystem **5** · cost **3** ·
maintenance **4** · chat/mVCP **5** · TTI **5** · memory@10k **4**

---

# Comparison & recommendation

| Axis (1–5) | A · Lynx | B · Valdi | C · Virtual |
|---|---|---|---|
| Scroll perf ceiling | **5** | 4 | 4 |
| Blank-cell resistance | **5**/3 | **5** | 4 |
| Ecosystem compat | 3 | **5** | **5** |
| Implementation cost | 2 | 2 | **3** |
| Maintenance risk | 2 | 2 | **4** |
| Chat / mVCP quality | **5** | **5** | **5** |
| First-paint TTI | **5** | 4 | **5** |
| Memory @ 10k items | 4 | 2 | 4 |
| Effort (ew) | 32–42 | 18–23 | ~24 (16 + shared core) |

**Build order:**

1. **Shared C++ core + Variant C** first. C is the only variant with no compatibility asterisks and
   the best maintenance profile; its C1 phase ships a competitive list on its own, and the core
   (Fenwick store, layout managers, AnchorManager, MeasureCoordinator, DiffApplier) is the
   foundation the other two consume. It also forces the benchmark harness into existence (C0).
2. **Variant B's V0+V1 next** (~8 ew on top): same core, same ScrollView host — it is nearly "C with
   `recycleMode: 'shed'` + Valdi anchoring + px-based viewportExtension". In fact **C's hybrid mode
   already delivers most of B's promise**; B earns separate existence only when V2/V3 (native
   detach via MountingOverrideDelegate — the JS-free scroll-back) proves its worth in benchmarks.
   Decision gate: if C-hybrid's shed mode + sync reveal already hits the blank/state targets, fold B
   into C as `recycleMode: 'shed'` + `preserveScrollPosition` and skip V2/V3 entirely.
3. **Variant A last**, as the performance crown: its A0 scroller and engine reuse the core; the
   Metro template compiler (A1) is the genuinely new work. Ship `engine="lynx"` for the apps that
   need it (chat/feeds at Lynx fidelity), never as the default. The template compiler's
   style-table binding is uniquely cheap for us because nitrocss already compiles className styles
   to native tables at build time.

**Packaging:** one package (`@nitrofoundation/nitrolist`), one `<NitroList>` component; variants as
`engine="virtual" | "valdi" | "lynx"` (default `virtual`) — or `recycleMode` absorbing B per the
decision gate above. All variants share the hooks, events, ref contract, and the compat checklist
from list-plan.md §4, so switching engines is a one-prop migration.
