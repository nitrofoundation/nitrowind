# Engine v2 — Lynx-informed performance roadmap

Maps each lesson from the Lynx research (`docs/lynxjs/architecture.md`,
`backgrounds-filters.md`, `list-performance.md`) onto **our** engine — the C++
`StyleEngine`/`NitrowindCore` bucket resolver committing into RN Fabric via
`ShadowTreeMutator` + `LayoutObserver` — with concrete, prioritized actions.
File references are to the tree as of the grid + gradient landings on
`feat/nitrocss-engine-v2`.

---

## 0. Current state (honest baseline)

Already native / already matching the Lynx shape:

- **C++ resolve + commit.** Class buckets are resolved in C++
  (`cpp/core/StyleEngine.cpp`, `NitrowindCore.cpp`) and committed into Fabric's
  shadow tree (`cpp/fabric/ShadowTreeMutator.cpp`). Theme / scheme / inset /
  dimension changes restyle **without a React re-render** — this is the
  Lynx "style resolution off the UI thread, platform views are leaves" split,
  built on Fabric instead of a bespoke tree.
- **Native grid.** `cpp/grid/GridLayoutEngine` is wired: `LayoutObserver` reads
  the container's `LayoutMetrics`, the engine computes item frames, and
  `ShadowTreeMutator` commits absolute boxes — converges in one frame, no
  `onLayout` JS round-trip on native (JS fallback remains for web only).
- **Numeric gradient descriptor.** The compiler fold emits a compact numeric
  `GradientDescriptor` (`packages/nitro-css/src/compiler/parsers/gradient.ts`,
  `target === "descriptor"`); the native gradient view paints with **zero CSS
  string parsing at paint time**. This is exactly Lynx's `lepus::CArray`
  gradient IR (their cleanest idea) — independently validated.
- **Batch commit primitive exists.** `ShadowTreeMutator::commit(vector<NodeMutation>)`
  opens a *single* `ShadowTree::commit` per surface for a batch, and respects
  RN's commit-exhaustion strategy.
- **Animation** rides Reanimated (their UI-thread runtime is our analog of
  Lynx's main-thread worklets); C++ AnimationBackend adoption is deferred.

Still JS / still string-shaped (the gap this roadmap closes):

- First-paint resolution is mirrored in JS (`src/core/store.ts`) and runs per
  component render; its cache-key construction is string-heavy (see §3).
- Commits are **event-granular, not frame-granular**: `commitResolvedNode`
  commits a *single node* per call (`NitrowindCore.cpp:766`) on link and on
  pressable-state changes; several triggers in one frame each open their own
  `ShadowTree::commit`.
- Filters still flow as parsed-object lists, not a packed numeric descriptor;
  the C++ CSS value parser (build-order step 3) is not started.
- `nitrolist` is documented (`docs/engine-v2/nitrolist.md`) but not built.

---

## 1. P0 — vsync-batched, coalesced `ShadowTreeMutator` commits

**Lynx lesson** (`architecture.md` §1.2, §2): producers never touch platform
views; UI ops are enqueued (`lynx_ui_operation_async_queue`,
`dynamic_ui_operation_queue`) and flushed **once per vsync** on the platform
thread (`vsync_observer_impl`).

**Our gap.** The batch *primitive* exists, but callers don't coalesce:
- `commitResolvedNode` = one commit per node (link, accent update, pressable
  state → group descendants can mean several commits in one interaction frame);
- a runtime change followed by a container-query re-evaluation and a grid
  `syncGrids` in the same frame = three separate `ShadowTree::commit`s, each
  paying the clone-reseat-diff-mount cost and each risking a commit-conflict
  retry.

**Actions**
1. Add a `CommitBatcher` in `cpp/fabric/`: a per-surface pending map
   `family → folly::dynamic props` with **last-writer-wins per prop key**;
   all engine paths (`commitResolvedNode`, `recompute`, container queries,
   `syncGrids`, group/pressable state) enqueue instead of committing.
2. Flush once per frame. Tick source options, in preference order:
   RN's `RuntimeScheduler`/UIScheduler hook if reachable; else a
   `CADisplayLink` / `Choreographer` tap exposed through a tiny Nitro binding.
   Flush = one `ShadowTreeMutator::commit` per surface. Keep the existing
   3-attempt + mutex exhaustion behavior at the flush site only.
3. Escape hatch: synchronous flush for first-link (first paint must not wait a
   frame) and for anything Reanimated needs same-frame.
4. Measure before/after: commit count + total commit µs for (a) theme toggle on
   the example Home screen, (b) a pressable press with group descendants,
   (c) grid remeasure. Diagnostics module (`HybridNitrowindDiagnostics`) already
   exists to surface counters.

**Effort:** medium. **Risk:** must respect Fabric's commit threading — batch on
our side, never introduce our own mount thread (see §6).

---

## 2. P0/P1 — versioned, stage-skipping pipeline over C++ bucket resolution

**Lynx lesson** (`architecture.md` §2): the pixel pipeline is an explicit state
machine `StyleResolve → Layout → UIOpFlush` where each run carries
`PipelineOptions{resolve, layout, flush}` to **skip stages**, and
`{major, minor}` versions let stale runs be discarded.

**Our mapping**
- *Resolve* = bucket resolution (`StyleEngine`), *Layout* = anything that needs
  Fabric relayout (grid `syncGrids`, container-query re-eval, layout-affecting
  props), *Flush* = the batched mutator commit (§1).

**Actions**
1. **Compile-time dirty classification.** Extend the compiled bucket metadata
   with an `affectsLayout` bit derived from the style keys (width/height/
   margin/padding/flex/position/… vs paint-only color/opacity/gradient/shadow).
   The dependency **mask** infrastructure already exists
   (`bucket.dependencies`); this is one more bit, computed in
   `nitrocss` `parseStyles` and carried through `serializeArtifact`.
2. **Stage skipping in `recompute(changedMask)`.** A theme/scheme change whose
   touched buckets are all paint-only never touches `LayoutObserver` /
   grid resync; today's code can re-walk more than it must. Conversely a
   dimension change can skip nodes whose masks don't include Dimensions
   (already partly true via masks — make it uniform and explicit).
3. **Versioning.** Stamp each runtime-state change with a monotonic version;
   enqueued-but-unflushed batches from version N are dropped when N+1's
   resolution completes within the same frame (coalescing in §1 gives this
   almost for free — the version makes it correct, not just likely).
4. Keep it **above** Fabric: we version our resolve/flush, we do not attempt to
   version or schedule Fabric's layout.

**Effort:** medium (1 is small; 2–3 ride on §1's batcher).

---

## 3. P1 — resolve-cache & string-churn reductions in `src/core/store.ts`

**Lynx lesson** (`backgrounds-filters.md` §4): parse once into reusable typed
structures; keep the per-frame path free of string work. Our JS mirror resolver
is on the render path of every className component (first paint + fallback),
and its *cache-hit* path — the common case — is dominated by string
construction. Actual hotspots, from the code:

1. **Cache-key construction on every call** (`resolveStyles`, store.ts:374):
   `snapshotKey(snapshot)` joins **16 fields** into a string and `stateKey`
   builds a 10-char string *per call*, even on hits.
   *Fix:* memoize `snapshotKey` per snapshot identity (WeakMap — snapshots are
   immutable per runtime change), reduce `stateKey` to a 10-bit integer, and
   key the cache on `` `${cachedSnapKey}|${stateBits}|${className}` ``. Cheap,
   pure win.
2. **LRU churn on hit** (`cacheGet`, store.ts:114): every hit does
   `Map.delete` + `Map.set` to refresh recency.
   *Fix:* generation-based (two-map hot/cold) or clock eviction — hits become a
   single lookup.
3. **Token re-splitting.** `className.split(/\s+/)` runs in
   `resolveStylesUncached` (store.ts:238), and *again* per render in
   `hasInteractiveVariant` / `hasGroupMarker` (`withNitrowind.tsx`) and
   `serializeGridConfig`.
   *Fix:* a small interned `className → tokens[]` cache shared by all of them.
4. **`effectiveVars` rebuilds the theme var table** (`{...defaultTheme,
   ...activeTheme}` spread) on every *uncached* resolve (store.ts:135).
   *Fix:* cache per `(artifactVersion, themeName, colorScheme)`.
5. **Per-bucket `Object.entries` + `var()` regex scan** in `applyBucketStyle`
   (store.ts:257): entries arrays are allocated per bucket per resolve, and
   every string value is regex-scanned for `var(`.
   *Fix:* at registration time (`registry.ts`), precompute each bucket's
   entry list and a `hasVar` flag (or pre-split var segments), so resolve only
   does the substitution when needed.
6. **`toList(dependencyMask)`** allocates a fresh dependency array per resolve
   — memoize per mask value (masks are small integers).

None of this changes resolution semantics; all are cache/representation
changes with existing vitest coverage (`store`-adjacent tests) to lean on.

**Effort:** small-medium, high leverage on list-heavy screens (every FlatList
row resolves through this path on first paint).

---

## 4. P1 — numeric descriptors everywhere (gradient done; filters next)

**Lynx lesson** (`backgrounds-filters.md` §2, §5): parse to a compact numeric
IR in the shared engine; platforms consume numbers. Also their *mistakes*:
single-filter-only, `uint32` sRGB-only color.

**Status:** gradient **done** (`GradientDescriptor`, numeric, stops normalized
at fold time). Port notes already captured for the paint side: `fixPoints()`
angle correction if the iOS `CAGradientLayer` fast path is used; ellipse =
circle + axis scale.

**Actions**
1. **Filters next.** Define a `FilterDescriptor`: an **ordered array** of
   `[opCode, amount]` pairs (explicitly avoiding Lynx's `objectAtIndex:0`
   single-filter limitation), folded in `nitrocss`
   (`parsers/filter.ts` — also fix the known `backdrop-filter`→`filter`
   collapse there). Clamp per-op at *apply* time, platform-side, like Lynx.
2. **Color stays wide.** Descriptors carry float RGBA (+ future color-space
   tag) — do **not** copy Lynx's `0xAARRGGBB` dead-end; our `oklch` path is a
   differentiator and gradient stop interpolation in OKLab is the point.
3. **Percent stays symbolic.** Keep `%`/`rem` unresolved in descriptors and
   resolve against measured size at commit (their `CssMeasureContext` lesson);
   the grid engine's `%`-track TODO should reuse the same convention.
4. **Box-shadow / text-shadow / transform** follow the same treatment as they
   move into the C++ value parser (build-order step 3): typed structs out of
   the parser, no re-lowering in JS.

**Effort:** filters = small once the descriptor is agreed; parser step is its
own milestone.

---

## 5. P2 — native-driven scroll for future `nitrolist`

**Lynx lesson** (`list-performance.md`, all of it): the entire scroll → cull →
recycle → mount loop runs with **no JS on the scroll frame** — native scroll
view feeds offset straight into the C++ engine (`ListEngineProxy`, 3 methods),
which emits mount ops back. Recycle keys are structural
(CREATE/REUSE/UPDATE pool), an anchor manager keeps the viewport stable across
diffs, and item subtrees are prepared off the commit thread.

**Actions (groundwork now, package later — per locked build order):**
1. Design the platform→engine surface as small as Lynx's:
   `scrollBy(tag, x, y)`, `scrollToPosition(tag, index, offset, align, smooth)`,
   `scrollStopped(tag)` — offsets tapped from the mounted scroll view
   *natively*, never routed through JS.
2. Culling core in C++ over shadow-node frames: interval tree (ours — better
   than Lynx's incremental walk for random `scrollToIndex`) + Lynx's
   **anchor manager** for jump-free diffs; `display:none` visibility commits
   for v1 as decided in `nitrolist.md`.
3. Reuse pool exactly as `ListReusePool`: `reuseKey → orderedSet<itemKey>` +
   CREATE/REUSE/UPDATE actions layered under our P/V/PV lifecycle.
4. Estimated main-axis size + post-layout correction through the **existing**
   `LayoutObserver` (same hook the grid uses).
5. Discipline items that transfer immediately: never mutate the view tree
   inside a scroll/draw callback (queue + drain at a safe frame point — §1's
   batcher is the drain), throttle scroll events to JS, opt-in state-change
   events.

**Effort:** large; separate package. The §1 batcher and §2 pipeline are its
prerequisites and are why they're P0.

---

## 6. What does NOT transfer (design around, don't fight)

Straight from the research, kept honest:

- **The layout engine.** Lynx replaced Yoga with Starlight and owns the tree.
  We sit on Fabric + Yoga: layout-affecting styles must lower to Yoga props and
  go through Fabric commits. Grid is our one escape hatch and it works *with*
  Fabric (`LayoutObserver` → absolute frames), not around it. No custom layout
  thread, no layout scheduling of our own.
- **The JS runtime / object model.** PrimJS's "JS object model == element
  tree" cheap boundary is unavailable on Hermes/JSC. Our analog is JSI + bulk
  resolution in C++ + fewer, batched crossings — minimize the boundary, don't
  pretend it's gone.
- **IFR (blocking the main thread for first frame).** We don't own app
  startup; the weaker equivalent is precompiled artifacts + synchronous
  first-link flush (§1 escape hatch).
- **Full native CSS animation.** Native-driving transform/opacity via
  Reanimated is in place; animating *layout* props natively would require
  owning layout — route those through commits, accept the cost.
- **A separate main-thread script language (Lepus/MTS).** Reanimated worklets
  already are our UI-thread runtime; build on it rather than inventing one.

---

## 7. Priority summary

| Pri | Item | Where | Size |
|-----|------|-------|------|
| P0 | Vsync-coalesced commit batcher (last-writer-wins per prop, per-surface flush) | `cpp/fabric/` | M |
| P0/P1 | Stage-skipping + versioned resolve pipeline (`affectsLayout` bit, drop stale batches) | `nitrocss` parse + `cpp/core/` | M |
| P1 | store.ts hot-path: memoized snapshot key, int state key, LRU-hit churn, token interning, `effectiveVars`/entries/`toList` caches | `src/core/store.ts`, `registry.ts` | S–M |
| P1 | `FilterDescriptor` (ordered numeric ops; fix `backdrop-filter` fold; wide color) | `nitrocss` `parsers/filter.ts` + native | S |
| P2 | `nitrolist`: native scroll tap → C++ cull/recycle/anchor over `ShadowTreeMutator` | new package | L |
| — | Non-goals: own layout engine, own JS runtime, own mount/layout threads | — | — |
