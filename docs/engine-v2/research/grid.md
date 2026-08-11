X# engine-v2 research: native CSS grid

Goal: move CSS grid fully native by wiring the already-existing C++
`GridLayoutEngine` into the post-layout observer hook, so grid item geometry is
computed in C++ and committed straight into the Fabric ShadowTree — eliminating
the JS `onLayout` → `setState` → re-render reflow (visible flicker) that
`useGridFallback` performs today.

All paths are absolute. This is rename-agnostic: names like `gridTags_`,
`syncGrids`, `GridRegistration` are suggested, not prescribed.

---

## 0. TL;DR of current state

- **JS path (`grid.tsx`) is the only thing that lays grid out on native.** It
  measures container width via `onLayout`, computes track/item sizes in JS, and
  re-renders children with injected `width`/`height`/`left`/`top` styles. This
  is a measure → `setState` → re-render loop (one frame of flicker minimum,
  usually reflow on every resize).
- **The C++ `GridLayoutEngine` already exists and is already compiled** (iOS
  podspec glob `cpp/**/*.{hpp,cpp}`; Android `GLOB_RECURSE .../cpp/*.cpp`), but
  **nothing calls it.** `grep -rn "GridLayoutEngine::layout"` finds only the
  definition. It is dead code today.
- **The exact wiring precedent already exists for container queries:** the
  `LayoutObserver` mount hook reads `LayoutableShadowNode::getLayoutMetrics()
  .frame.size` after Yoga, and `NitrowindCore::syncContainers` →
  `ShadowTreeMutator::commit` writes follow-up props into the tree with no JS
  round-trip and no re-render. Grid should ride the same rails: measure the grid
  container, run `GridLayoutEngine::layout`, commit each item's absolute frame.

---

## 1. Current JS grid — `packages/nitro-css/src/components/grid.tsx`

File: `/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/components/grid.tsx` (790 lines).

### 1a. `useGridFallback` — the measure→setState→re-render loop (lines 747-789)

```ts
export function useGridFallback(children, parentClassName, onLayout, parentStyle) {
  const isGrid = /(?:^|\s)grid(?:\s|$)/.test(parentClassName);
  const enabled =
    Platform.OS !== "web" && isGrid && hasGridFallbackTracks(parentClassName);
  const [containerWidth, setContainerWidth] = useState(0);          // <-- state
  const handleLayout = useCallback((event) => {
    if (enabled) {
      const nextWidth = calculateGridContentWidth({
        containerWidth: event.nativeEvent.layout.width,             // <-- onLayout read
        parentClassName, parentStyle,
      });
      setContainerWidth((current) =>                                // <-- triggers re-render
        Math.abs(current - nextWidth) < 0.5 ? current : nextWidth);
    }
    onLayout?.(event);
  }, [enabled, onLayout, parentClassName, parentStyle]);

  const nextChildren = useMemo(
    () => enabled ? withGridFallback(children, parentClassName, containerWidth) : children,
    [children, parentClassName, containerWidth, enabled]);

  return { children: nextChildren, onLayout: enabled || onLayout ? handleLayout : undefined };
}
```

The loop: first render has `containerWidth === 0` → `withGridFallback` emits
**percentage** widths (line 369 `return \`${(clampedSpan / columns) * 100}%\``).
After mount, `onLayout` fires → `setContainerWidth(measured)` → React re-renders
→ `withGridFallback` re-runs with the real width → items get **absolute px**
widths. That is the flicker: percentages first paint, pixels one frame later,
and any container resize repeats the cycle. `web` short-circuits (`Platform.OS
!== "web"`), leaving `className` for browser CSS grid.

Consumers:
- `/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/components/View.tsx:61`
  — `useGridFallback(children, className, handleLayout, [...])`, wires
  `gridFallback.onLayout` onto the host (`View.tsx:86`) and renders
  `gridFallback.children` (`View.tsx:91`).
- `/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/hoc/withNitroCss.tsx:397`
  — same, for any `withNitrowind`-wrapped component (Stacks, etc.).

### 1b. `withGridFallback` — the JS layout algorithm (lines 629-745)

Signature: `withGridFallback(children, parentClassName, containerWidth = 0)`.
Walks `Children.toArray(children)`, and for each element:
- reads child `className` (`classNameOf`, line 58);
- `span = spanFor(className)` (`col-span-N`, line 68);
- resolves `areaName` from `area-[…]`/`grid-area-…` or auto-assigns the next
  named area (lines 670-672);
- computes a `gridItemStyle: ViewStyle` with `width` (from template sizes,
  `fallbackWidth`, or auto-cols), `height` (`applyRowTemplateStyle` /
  auto-rows), and — only for placed areas under a `relative` container — `left`/
  `top` + `position:"absolute"` (lines 696-739);
- `cloneElement(child, { style: [style, gridItemStyle] })` (line 741).

Auto-flow cursor state (`columnCursor`, `rowIndex`, `autoAreaIndex`, lines
662-664) advances as items consume columns and wraps rows — the JS mirror of the
C++ `autoPlace`.

### 1c. Grid class parsing (the "compiled bucket shape" for grid)

Grid classes are parsed **in JS at render time** (there is no compiled grid
bucket in the native style tables today — grid is purely a runtime JS concern).
Regexes at the top of `grid.tsx`:

| Class | Regex (line) | Parsed to |
|---|---|---|
| `grid` (marker) | `/(?:^|\s)grid(?:\s|$)/` (756, 637) | enables fallback |
| `grid-cols-N` | `GRID_COLS_RE` (12) | `columnsFor` → integer column count (79) |
| `grid-cols-[…]` | `GRID_COLS_TEMPLATE_RE` (13) | `Track[]` via `parseTrackList` (247) |
| `grid-rows-[…]` | `GRID_ROWS_TEMPLATE_RE` (14) | `Track[]` (251) |
| `grid-template-[…]` | `GRID_TEMPLATE_RE` (15) | `GridTemplate {areas,rows,columns}` (232) |
| `col-span-N` | `COL_SPAN_RE` (16) | `spanFor` → int span (68) |
| `area-[…]`, `grid-area-[…]` | `GRID_AREA_ARBITRARY_RE` (17) | area name string (73) |
| `area-name`, `grid-area-name` | `GRID_AREA_RE` (19) | area name (73) |
| `auto-rows-*`, `auto-cols-*` | lines 20-25 | track value string (325/334) |
| `gap-N` | `GAP_RE` (26) | `gapFor` → `N * 4` px (255) |
| `p-*/px-*/pl-*/pr-*` | lines 27-34 | horizontal padding subtracted from width (517-586) |

Key JS types (lines 39-56):

```ts
type Track =
  | { kind: "fixed"; value: number; min?: number }
  | { kind: "percent"; value: number; min?: number }
  | { kind: "fr"; value: number; min?: number }
  | { kind: "auto"; min?: number };

type GridTemplate = { areas?: string[][]; columns: Track[]; rows: Track[] };
type AreaPlacement = { columnStart; columnSpan; rowStart; rowSpan };  // all 0-based
```

Track grammar handled by `parseTrack` (135): `auto`/`min-content`/`max-content`
→ `auto`; `minmax(min,max)` → track + `min` (274); `Nfr` → `fr`; `N%` →
`percent` (value/100); `Npx`/`Nrem`/`Nem` → `fixed` (rem/em × 16). `repeat(n,
track)` expanded by `expandRepeatTrack` (126). Arbitrary values decode `_`→space
(`decodeArbitraryTrack`, 270). `SPACING_UNIT = 4` (line 35).

Note the **JS `Track` is richer than the C++ `Track`** (JS has `percent`, `min`,
`auto`-with-min; C++ has only `Fr | Px | Auto` with a single `value`). §4
addresses how to serialize down / extend the C++ type.

Padding handling: `calculateGridContentWidth` (588) subtracts the larger of
inline-style horizontal padding and className horizontal padding from the
measured container width before dividing into tracks. The native path must do the
same or grid items will overflow their padded container.

### 1d. Pure helpers already exported (reusable oracle for tests / parity)

- `calculateGridFallbackWidth({containerWidth, columns, gap, span})` (607) — the
  equal-track formula. **Its C++ twin already exists:**
  `GridLayoutEngine::spannedTrackWidth(width, columns, gap, span)` (see §2) is
  line-for-line the same math. Good parity anchor for a test.
- `calculateGridContentWidth(...)` (588) — padding subtraction.

Test coverage today:
`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/components/__tests__/grid.test.ts`
exercises `withGridFallback` output shapes (widths, spans, areas, templates).

---

## 2. Existing native engine — `packages/nitro-css/cpp/grid/`

Files:
- `/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/grid/GridTypes.hpp`
- `/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/grid/GridLayoutEngine.hpp`
- `/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/grid/GridLayoutEngine.cpp`

Namespace `nitrowind::grid`.

### 2a. Types — `GridTypes.hpp`

```cpp
enum class TrackType { Fr, Px, Auto };
struct Track   { TrackType type = TrackType::Fr; double value = 1.0; };
struct Placement { int columnStart=0; int columnSpan=1; int rowStart=0; int rowSpan=1; }; // 1-based, 0 = auto
struct ItemLayout { double x=0, y=0, width=0, height=0; };
struct GridInput {
  double width = 0.0;
  std::vector<Track> columns;
  std::vector<Track> rows;
  Track  autoRow{TrackType::Px, 64.0};   // implicit-row size for overflow rows
  double columnGap = 0.0;
  double rowGap = 0.0;
  std::vector<Placement> items;          // one per grid item, in child order
};
struct GridOutput { std::vector<ItemLayout> items; double width=0.0; double height=0.0; };
```

Notes / gaps vs. the JS model:
- C++ `Track` has **no `percent` and no `min`** (no `minmax`). Percent and
  minmax tracks are supported in JS but would be lost on serialization unless the
  C++ type is extended (see §5).
- `autoRow` default is `64.0` px — matches nothing in particular; implicit rows
  in JS come from `auto-rows-*`. Must be fed the parsed `auto-rows` value.
- `Placement` is 1-based with `0 == auto` (comment lines 15-18); the JS
  `AreaPlacement` is 0-based. Serialization must convert (add 1, or send 0 for
  auto-flow).

### 2b. Algorithm — `GridLayoutEngine::layout` (cpp lines 141-188)

```cpp
GridOutput GridLayoutEngine::layout(const GridInput& input) {
  output.width = max(0, input.width);
  if (input.columns.empty()) return output;
  const int columnCount = input.columns.size();
  const auto columns = resolveTracks(input.columns, output.width,
                                     input.columnGap, output.width / columnCount);
  std::vector<std::vector<bool>> occupied;   // row-major occupancy grid
  for (const auto& item : input.items) {
    const int columnSpan = clampSpan(item.columnSpan, columnCount);
    const int rowSpan    = max(1, item.rowSpan);
    int row    = item.rowStart    > 0 ? item.rowStart    - 1 : -1;  // 1-based -> 0-based
    int column = item.columnStart > 0 ? item.columnStart - 1 : -1;
    if (column >= columnCount) column = columnCount - 1;
    if (column < 0 || row < 0 || !fits(...)) {        // explicit placement invalid/absent
      auto placed = autoPlace(occupied, rowSpan, columnSpan, columnCount);
      row = placed.first; column = placed.second;
    }
    mark(occupied, row, column, rowSpan, columnSpan, columnCount);
    // grow rows to occupancy height using autoRow, resolve, emit frame:
    std::vector<Track> rows = input.rows;
    while (rows.size() < occupied.size()) rows.push_back(input.autoRow);
    const auto rowTracks = resolveTracks(rows, 0.0, input.rowGap, input.autoRow.value);
    output.items.push_back({
      offsetFor(columns, column, input.columnGap),   // x
      offsetFor(rowTracks, row, input.rowGap),       // y
      spanSize(columns, column, columnSpan, input.columnGap),  // width
      spanSize(rowTracks, row, rowSpan, input.rowGap),         // height
    });
  }
  // final content height from the fully-populated occupancy grid:
  std::vector<Track> rows = input.rows;
  while (rows.size() < occupied.size()) rows.push_back(input.autoRow);
  const auto rowTracks = resolveTracks(rows, 0.0, input.rowGap, input.autoRow.value);
  output.height = rowTracks.empty() ? 0.0
      : offsetFor(rowTracks, rowTracks.size(), input.rowGap);
  return output;
}
```

Track resolution — `resolveTracks` (cpp 25-56): sum `fixed = Σ trackBaseSize`
(Px/Auto use `track.value`, else `fallback`), `fr = Σ fr values`; `free = max(0,
available − fixed − totalGap)`; each fr track gets `free/fr × value`, each
non-fr track gets its base size. `totalGap = gap × (count−1)`.

Auto-placement — `autoPlace` (110-124): first-fit scan (row-major, top-left)
over the occupancy grid, growing rows as needed. `fits`/`mark` (76-108) handle
span rectangles and column-overflow rejection.

Offsets — `offsetFor` (58-65): sums track sizes + gaps up to `start`. `spanSize`
(67-74): sums `span` track sizes + `(span−1)` gaps.

Bugs/quirks worth noting for wiring (do **not** fix silently — flag in review):
- **`offsetFor` gap accounting looks off:** `for i in [0,start): offset +=
  tracks[i]; if (i+1 < start) offset += gap;` adds `gap` only `start−1` times but
  *between* the first `start` tracks it should add `start` gaps (one before the
  target track). Compare `templateOffset` in JS (grid.tsx:422) which adds
  `gap * start`. Likely off-by-one-gap in item `x`/`y`. **Verify against
  `grid.test.ts` expectations before shipping.**
- Column resolution uses `available = output.width`; **row resolution passes
  `available = 0.0`** (cpp:171, 183), so `fr` rows collapse to 0 and `percent`
  rows are unsupported. Rows are effectively px/auto-only. Height comes purely
  from fixed/auto/autoRow tracks. This matches the JS `resolvedRowSizes` (446)
  which also only takes `fixedTrackSize ?? min`.

### 2c. Static helpers (already parity-tested against JS)

`equalTrackWidth(width, columns, gap)` (128) and `spannedTrackWidth(width,
columns, gap, span)` (134) — the equal-track path used by simple `grid-cols-N`.
`spannedTrackWidth` == JS `calculateGridFallbackWidth`.

---

## 3. The wiring layer (how nitrowind links nodes and commits)

### 3a. Link path (JS → C++ registry)

1. `View`/HOC render → `useLinkedRef` (`internal.ts:227`) ref callback →
   `linkNode` (`internal.ts:92`).
2. `linkNode` extracts the Fabric `ShadowNodeWrapper` from the ref
   (`shadowNodeWrapperFromRef`, 63), builds a `ShadowNodeHandle`, and calls
   `engine.Registry.link(handle, className, componentName, dependencies, accents,
   inline, state, undefined, context)` (`internal.ts:131`).
3. Nitro spec: `/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/specs/ShadowRegistry.nitro.ts:38`
   → C++ `HybridShadowRegistry::link`
   (`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/HybridShadowRegistry.hpp:30`)
   → `NitrowindCore::link` (`NitrowindCore.cpp:214`).
4. `NitrowindCore::link` builds a `LinkedNode`, folds in the engine's own
   dependency mask (line 232), and — crucially for us — **classifies the node**:
   `isContainer` / `isGroupRoot` are detected and recorded in side registries
   `containerTags_` (line 253) / `groupTags_` (260). Then it **kicks a
   measurement pass** via `LayoutObserver::shared().remeasure()` (line 278) when
   the node is a container / query / group / structural node, and finally
   commits first-paint props (`commitResolvedNode`, 283).

**This is the exact insertion point for a `gridTags_` registry** (see §4): detect
`grid` + track classes in `link`, record the node's parsed grid config keyed by
`Tag`, and trigger a measure/layout pass.

The registry itself: `DependencyIndex index_` +
`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/registry/LinkedNode.hpp`
(the `LinkedNode` struct — add grid fields here, mirroring `isContainer` /
`containerName`).

### 3b. Post-layout observer — `packages/nitro-css/cpp/fabric/LayoutObserver.*`

This is the hook the prompt refers to. File
`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/fabric/LayoutObserver.cpp`.

- `LayoutObserver` is a Fabric `UIManagerMountHook`; `registerWith` calls
  `uiManager.registerMountHook(*this)` (line 26).
- `shadowTreeDidMount` (149) fires **after Yoga layout + mount** and calls
  `measureAndSync(*rootShadowNode, false)`.
- `remeasure` (163) does the same out-of-band by pulling the current revision
  from the `ShadowTreeRegistry` (used by the link path for static screens).
- **The measurement read the grid path needs is already here** — `walk` (44),
  for every container tag:

```cpp
if (auto* layoutable = dynamic_cast<const LayoutableShadowNode*>(&node)) {
  const auto size = layoutable->getLayoutMetrics().frame.size;   // <-- post-Yoga size
  measurements.push_back({tag, containerIt->second,
                          (double)size.width, (double)size.height});
}
```

`walk` is a single DFS carrying nearest-container/group tags and building
`measurements` + `nodeToContainer` + `nodeToGroup` + `structuralState`, then
`measureAndSync` (118) dispatches to `core.syncContainers/syncGroups/
syncStructuralPseudos`. **Grid slots in as a fourth concern in this same walk:**
when `node.getTag()` is in `gridTags`, read `frame.size.width`, and (from the
same `node.getChildren()` already iterated at line 88/104) collect the child
tags/families in order, then call a new `core.syncGrids(...)`.

Early-out guard to update: line 123 `if (containers.empty() && groups.empty() &&
structuralPseudoTags.empty()) return;` — add `&& gridTags.empty()` so grid still
runs when no containers exist. Same in `remeasure` line 172.

### 3c. Commit path — `packages/nitro-css/cpp/fabric/ShadowTreeMutator`

`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/fabric/ShadowTreeMutator.cpp`.

`ShadowTreeMutator::commit(std::vector<NodeMutation>)` (line 19): groups
mutations by `SurfaceId`, opens **one** `shadowTree.commit` per surface, and
`cloneTree`s from root down to each mutated family, merging new props via
`descriptor.cloneProps(ctx, node.getProps(), RawProps(mutation->props))` (62).
`enableStateReconciliation = false` (73) → **no React re-render**.

`NodeMutation` (`ShadowTreeMutator.hpp:10`): `{ ShadowNodeFamily::Shared family;
SurfaceId surfaceId; folly::dynamic props; }`.

So each grid item is committed as a `NodeMutation` whose `props` is a
`folly::dynamic` object of layout props. To let Yoga not fight the commit, item
props must be **absolute-positioned**:

```cpp
folly::dynamic p = folly::dynamic::object;
p["position"] = "absolute";
p["left"]   = item.x;
p["top"]    = item.y;
p["width"]  = item.width;
p["height"] = item.height;
```

**Precedent that this measure→commit works:** container queries do exactly this.
`NitrowindCore::syncContainers` (`NitrowindCore.cpp:391`) stores measured sizes
and calls `recompute(depFlag(Dependency::ContainerSize))` →
`ShadowTreeMutator::commit(batch)` (line 575). `setContainerSize`
(`NitrowindCore.cpp:361`, the "~line 326" region the prompt points at — the
container-size sink) is the single-node variant. Grid mirrors this: a
`syncGrids` that runs `GridLayoutEngine::layout` and commits item frames through
the same mutator.

### 3d. Absolute-positioning: does Yoga fight back?

- Committing `position:absolute` + `left/top/width/height` on the item makes the
  item **out of flow** — Yoga positions it exactly where we said, so our commit
  wins. This is the same trick the JS fallback already uses for *placed areas*
  (`grid.tsx:738` sets `position:"absolute"`). The engine-v2 change generalizes
  it to **all** grid items on native.
- The **grid container** itself then needs an explicit height (children are
  out-of-flow → container would collapse to 0). Commit the container's
  `GridOutput.height` (and it already has a measured width). This is a second
  `NodeMutation` addressed to the container's own family. (JS today leaves the
  container in flow with in-flow item widths + `flexWrap`-ish behavior; native
  absolute needs the explicit container height.)
- **When Yoga remeasures after our commit:** our commit is itself a
  `shadowTree.commit`, which triggers a new Yoga layout + a new
  `shadowTreeDidMount`. Because absolute items don't change the container's
  intrinsic size and we set the container height explicitly, the second layout is
  stable → the follow-up `measureAndSync` sees the same container width →
  `GridLayoutEngine` returns the same frames → no further commit. This is the
  same single-frame convergence container queries rely on (LayoutObserver.hpp
  docblock lines 22-27: "converges in a single extra frame and never loops")
  **provided** grid gates its commit on "container width actually changed" the
  way containers gate on measured-size change.

---

## 4. Exact ordered build steps

### JS side

1. **Parse grid config once, at link time, and pass it to native.** In
   `View.tsx` / `withNitrowind.tsx`, when `Platform.OS !== "web"` and
   `hasGridFallbackTracks(className)`, build a serializable grid config from the
   existing parsers already in `grid.tsx` (export them):
   - `columns: Track[]` from `columnTemplateFor(className)` ?? `grid-template`
     columns ?? `grid-cols-N` (expand to N × `{kind:"fr",value:1}`).
   - `rows: Track[]` from `rowTemplateFor` ?? `grid-template` rows.
   - `columnGap`/`rowGap` from `gapFor` (single `gap-N` → both).
   - `autoRow`/`autoCol` from `autoRowsFor`/`autoColsFor`.
   - `areas: string[][]` from `gridTemplateFor(...).areas`.
   - per-item placements: `{ columnStart, columnSpan, rowStart, rowSpan }`
     resolved from each child's `col-span-N` / `area-*` (reuse `spanFor`,
     `areaFor`, `areaPlacements`).
2. **Serialize down to the C++ `Track`/`Placement` shape.** Emit a JSON-ish
   `folly::dynamic` (or Nitro struct) per §4-data below. Map JS `Track.kind` →
   C++ `TrackType`: `fixed`→`Px`(value px), `fr`→`Fr`(value), `auto`→`Auto`.
   `percent`/`min`/`minmax` are lossy today (see §5) — either extend C++ or
   pre-resolve percent against the last-known width in JS as a stopgap.
   Placements: convert 0-based JS → 1-based C++ (`+1`), `0` = auto-flow.
3. **Pass the config through `link`.** Add a `gridConfig` (optional) parameter to
   `ShadowRegistry.link` (`ShadowRegistry.nitro.ts:38`) and thread it through
   `internal.ts linkNode` → `HybridShadowRegistry::link` → `NitrowindCore::link`.
   Alternatively a dedicated `Registry.linkGrid(handle, gridConfig)` /
   `setGridConfig(handle, config)` call to keep `link` stable (rename-agnostic;
   dedicated call is cleaner given the per-item child list is grid-specific).
4. **Keep `onLayout` only for web.** In `useGridFallback`, gate the entire
   measure→`setState` machinery behind `Platform.OS === "web"` OR "no native
   engine" (`hasNativeEngine()` from `core/native`). On native-with-engine,
   `useGridFallback` should return `{ children, onLayout }` **unchanged** (no
   `withGridFallback` cloneElement, no `containerWidth` state). Web keeps
   `className` on the host for browser CSS grid (already the case). Retain the JS
   path as a fallback when `hasNativeEngine()` is false (old-arch / bridgeless
   off) so grid still works without the C++ engine.

### C++ side

5. **`gridTags_` registry + parsed config in `NitrowindCore`.** Mirror
   `containerTags_`: add `std::unordered_map<Tag, GridConfig> gridTags_;` guarded
   by a `gridMutex_`, plus grid fields on `LinkedNode`
   (`registry/LinkedNode.hpp`) if you prefer per-node storage. In
   `NitrowindCore::link` (`NitrowindCore.cpp:214`), after container/group
   detection, if the node carries a grid config, store it and call
   `LayoutObserver::shared().remeasure()` (extend the guard at line 270 to
   include grid). Add accessor `gridTags()` like `containerTags()` (line 477).
6. **Wire the layout call in the observer walk.** In `LayoutObserver.cpp walk`
   (line 44): if `tag ∈ gridTags`, read `frame.size.width` (line 74 pattern),
   collect ordered child `{tag, family}` from `node.getChildren()` (already
   iterated line 88/104), and stash into a `std::vector<GridMeasurement>`. Extend
   the empty-guard (line 123 / 172) with `gridTags.empty()`. In `measureAndSync`
   (118), after the container/group dispatch, call `core.syncGrids(gridMeas)`.
7. **`NitrowindCore::syncGrids` → `GridLayoutEngine::layout` → commit.** New
   method mirroring `syncContainers` (`NitrowindCore.cpp:391`):
   - gate on "grid container width changed since last run" (cache last width per
     grid tag, like `containerSizes_`) to avoid commit loops;
   - build `grid::GridInput` from the stored config + measured width (subtract
     container horizontal padding — mirror `calculateGridContentWidth`);
   - build `input.items` (one `Placement` per child, in the collected order);
   - `auto out = grid::GridLayoutEngine::layout(input);`
   - for each `out.items[i]`, push a `NodeMutation{childFamily[i], surfaceId,
     {position:"absolute", left:x, top:y, width, height}}`; push one more for the
     container `{height: out.height}`;
   - `ShadowTreeMutator::commit(batch)` (same call as line 575).
8. **Build:** no CMake/podspec change needed — `cpp/grid/*` is already globbed
   (iOS `Nitrowind.podspec:51` `cpp/**/*.{hpp,cpp}`; Android
   `android/CMakeLists.txt:26-27` `GLOB_RECURSE .../cpp/*.cpp`). Only the new
   `syncGrids`/registry code and the `#include "../grid/GridLayoutEngine.hpp"` in
   `NitrowindCore.cpp` are new.

### §4-data — serialized grid config shape (JS → engine)

A single per-grid-container payload; item placements travel with it in child
order (item→child correspondence is positional, matching `input.items` order).

```jsonc
// GridConfig (JS emits; C++ decodes into grid::GridInput + config)
{
  "columns": [ { "type": "fr",  "value": 1 },
               { "type": "px",  "value": 120 },
               { "type": "auto", "value": 0 } ],   // TrackType: "fr"|"px"|"auto"
  "rows":    [ { "type": "px", "value": 80 } ],
  "autoRow": { "type": "px", "value": 64 },        // from auto-rows-*, default 64
  "columnGap": 16, "rowGap": 16,                    // gap-N * 4
  "paddingHorizontal": 0,                           // subtract from measured width
  "items": [
    { "columnStart": 0, "columnSpan": 2, "rowStart": 0, "rowSpan": 1 }, // 0 = auto
    { "columnStart": 0, "columnSpan": 1, "rowStart": 0, "rowSpan": 1 }
  ]
  // areas resolved in JS to per-item column/row start+span before serialization,
  // so C++ never needs the string area grid.
}
```

C++ decode: `columns/rows/autoRow` → `grid::Track` (map `type`); `items[i]` →
`grid::Placement` with `columnStart+1` / `rowStart+1` (JS 0-based → C++ 1-based;
send 1-based directly and keep 0 meaning auto — decide one convention and apply
in the JS serializer). Measured `width = frame.size.width − paddingHorizontal`.

---

## 5. Open questions / risks

1. **`auto` / content-sized tracks need item measurement.** `GridLayoutEngine`
   treats `Auto` as `track.value` (a fixed number) — it does **not** measure item
   content. Real `auto`/`min-content`/`max-content`/`fit-content` columns require
   reading each item's intrinsic size, which is only known after a Yoga pass. The
   current engine can't do CSS-correct auto tracks. Options: (a) run a first
   layout with items in-flow, read `LayoutMetrics` of each item, feed those into
   `autoRow.value`/auto-track sizes, then commit absolute — a two-pass measure
   (extra frame, mild flicker risk); (b) restrict native grid to
   `fr`/`px`/`%`/explicit tracks and keep JS/degraded behavior for `auto`. JS
   today also punts on auto (`resolvedRowSizes` only uses fixed/min), so parity
   is achievable, CSS-correctness is not.
2. **Nested grids.** `LayoutObserver.walk` is a full DFS; a grid inside a grid
   would be measured/committed independently. Order matters: the inner grid's
   width depends on the outer commit landing first. Because each commit triggers a
   fresh mount → fresh walk, nested grids should converge over ≤ depth frames,
   but this needs testing (and the loop-guard must be per-tag so an inner change
   doesn't re-fire the outer forever).
3. **Gap units.** JS `gapFor` is `N * 4` px only (`gap-N`); arbitrary/`rem`/`%`
   gaps aren't parsed. C++ `columnGap`/`rowGap` are raw doubles. Percent gaps and
   `gap-[…]` arbitrary values are unsupported end-to-end today — either extend the
   JS parser or document the limit.
4. **Percent / minmax tracks are lossy.** JS `Track` has `percent` and `min`
   (minmax); C++ `TrackType` has only `Fr|Px|Auto`. Either extend
   `grid::TrackType` (+ `resolveTracks` to handle `Percent = width * value` and a
   `min` floor) — cheap and worth doing — or pre-resolve percent in JS against the
   last measured width (stale on resize). Recommend extending C++.
5. **RTL.** `GridLayoutEngine` lays out left-to-right (`offsetFor` accumulates
   from column 0). Under RTL, item `x` must mirror (`containerWidth − x −
   width`). RTL is a runtime dependency (`StyleDependency.Rtl = 5`,
   `RuntimeState.rtl`); `syncGrids` must read it and flip x, and re-run on RTL
   change (add to the recompute trigger). Not handled today in either path.
6. **When Yoga remeasures after our commit / loop safety.** Our absolute commit
   re-triggers Yoga + `shadowTreeDidMount`. Must gate `syncGrids` on "measured
   container width changed" (cache per grid tag) exactly like `syncContainers`
   gates on measured-size change, or every mount re-commits and we loop. Setting
   the container height explicitly is required (absolute children give 0
   intrinsic height); if that height feeds back into the parent's layout and
   changes *our* container's width, convergence isn't guaranteed — watch grids
   whose own width depends on their content height (rare, but possible in a column
   flex parent).
7. **`offsetFor` gap off-by-one (see §2b).** The C++ offset appears to under-count
   gaps vs. the JS `templateOffset`. Because grid was never wired, this has never
   run against the JS test oracle. Add a parity test (`GridLayoutEngine::layout`
   vs. `withGridFallback` expectations in `grid.test.ts`) before enabling; fix the
   gap accounting if it diverges.
8. **Fallback when no native engine.** `linkNode` returns `undefined` when
   `!hasNativeEngine()` (`internal.ts:102`). The JS grid path must stay alive for
   that case (old arch, engine disabled), so the `useGridFallback` gate in step 4
   should be `web || hasNativeEngine()` disables JS layout, everything else keeps
   it.
9. **Item child identity.** `walk` collects children by `getChildren()` order;
   the JS serializer builds placements by `Children.toArray` order. These must
   line up 1:1 including `null`/text children — `Children.toArray` drops
   null/false but the shadow tree may include text/raw nodes. Filter to linked
   host children on the C++ side (there's already a `linkedTags` filter at
   `LayoutObserver.cpp:91` for structural pseudos — reuse that to select grid
   items).

STATUS: DONE
