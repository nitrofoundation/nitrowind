# Sticky positioning: LynxJS, Web, and NitroCSS

## Executive summary

`position: sticky` is a layout-and-scroll behavior, not merely a style value.
The compiler can identify the intent (`position`, inset, z-index, axis), but it
cannot make a native view stick without knowing:

1. the nearest scrolling container;
2. the element's normal-flow frame;
3. the container viewport and content bounds; and
4. the live scroll offset.

The recommended NitroCSS strategy is therefore split by platform:

- **Web:** preserve `position: sticky` and its inset values as browser CSS. The
  existing web path already forwards class names to the DOM-backed scrollable
  component, so the browser owns sticky layout.
- **Native v1:** support sticky items in NitroCSS-owned `ScrollView` and
  `SectionList`/`FlatList` contracts, using the platform's native sticky-header
  capability where it exactly matches the CSS case. Do not claim arbitrary
  descendant sticky support yet.
- **Native v2:** add a native-driven sticky coordinator over Fabric. It reads
  layout metrics and scroll offsets off the JS path, computes clamped frames, and
  commits batched position updates through the existing `ShadowTreeMutator` /
  `CommitBatcher` path. This is the general solution and belongs next to the
  future `nitrolist` engine, not in the CSS parser.

## What LynxJS does

### General CSS `position: sticky`

Lynx documents `sticky` as participating in normal flow until the containing
block crosses an inset threshold, after which it is offset relative to the
scrolling container and containing block. The relevant offsets are `top`,
`right`, `bottom`, and `left`.

There are two important Lynx differences from the Web:

- Lynx's initial value for `position` is `relative`; Web CSS uses `static`.
- Lynx does not make arbitrary `view` elements scrollable with
  `overflow: scroll`. Scrolling is provided by dedicated `<scroll-view>` and
  `<list>` components.

The Lynx documentation has changed across versions. Older documentation says
CSS sticky is only supported for direct children of `<scroll-view>`; the current
position reference describes nearest-scroll-container behavior and notes that
the direct-child restriction applied before 3.9. The practical native contract
still matters: a sticky element needs to be under a real Lynx scrolling
container, and `<list>` has its own sticky implementation.

### `<scroll-view>` sticky

For basic scrolling, Lynx supports a sticky child of `<scroll-view>`. The
native scroll container knows its viewport and scroll offset, so sticky is
handled without a JavaScript scroll callback. The documented older contract
requires the sticky node to be a direct child; Android also requires
`flatten={false}` for sticky nodes.

The scroll view itself is linear-layout oriented. Lynx recommends putting a
complex layout inside one child view rather than making many complex direct
children sticky.

### `<list>` sticky

Large data sets use `<list>`, not `<scroll-view>`. Its sticky behavior is a
specialized list feature:

- enable sticky behavior on the list;
- mark a list item as `sticky-top` or `sticky-bottom`;
- provide `sticky-offset` when a non-zero threshold is needed; and
- use `full-span` because a sticky item must occupy the full cross-axis row.

This is not just CSS position resolution. Lynx's list layout manager computes
sticky candidates and positions inside the C++ list engine. In the decoupled
architecture, sticky is updated during list layout and can recycle old sticky
items. In the legacy Android implementation, the sticky view is temporarily
placed in an overlay `FrameLayout` while scrolling and restored when it leaves
the sticky range.

The key architectural lesson is that Lynx keeps scroll → sticky calculation off
application JS. The native scroll view feeds the layout/list engine directly.

## Web behavior to preserve

On Web, browser CSS already implements the complete sticky model:

```css
.section-title {
  position: sticky;
  top: 0;
  z-index: 1;
}
```

The browser keeps the element in normal flow, clamps its visual position to the
nearest scrollport, and stops it at the containing block's opposite edge. The
usual browser constraints still apply: at least one non-`auto` inset is needed
on the scrolling axis; an ancestor with scrolling overflow changes the
scrollport; and the containing block must provide room for the sticky item.

NitroCSS should not translate this into a React Native `position` value on Web.
The existing `ScrollView`, `FlatList`, and `SectionList` wrappers already pass
class names through on Web. Keep `className` / `contentContainerClassName`
untouched and add Web tests proving the generated CSS is retained.

## NitroCSS gap analysis

The compiler currently converts CSS declarations into RN-style keys through
`toRNProperty` / `toRNValue`. That is sufficient for `position: relative`,
`absolute`, and `fixed` because React Native can consume those values during
layout. It is not sufficient for sticky because RN's generic style system does
not expose browser-style sticky layout for arbitrary descendants.

NitroCSS already has the infrastructure needed for a native implementation:

- `LayoutObserver` can inspect committed Fabric `LayoutMetrics`;
- `ShadowTreeMutator` can commit layout-affecting props without a React
  re-render;
- `CommitBatcher` can coalesce same-frame mutations;
- `ScrollView` / `FlatList` / `SectionList` wrappers are the natural place to
  register a scroll container; and
- the deferred `nitrolist` design already calls for native scroll-offset taps,
  post-layout metrics, and batched shadow-tree commits.

What is missing is a sticky registry and a platform-native source of scroll
offsets. There is currently no `position`-specific compiler metadata, sticky
registration, or iOS/Android scroll listener in NitroCSS.

## Proposed design

### Phase 0: preserve Web and make native behavior explicit

1. Add compiler tests for `position: sticky`, `top`, `bottom`, `left`, `right`,
   logical insets, and `z-index`.
2. Add a `position: sticky` classification to the compiled artifact. Keep the
   ordinary RN style output for first paint, but also retain a marker such as:

   ```ts
   interface StickySpec {
     axis: "vertical" | "horizontal" | "both";
     top?: number | InsetValue;
     right?: number | InsetValue;
     bottom?: number | InsetValue;
     left?: number | InsetValue;
     zIndex?: number;
   }
   ```

   Do not infer the axis from `position` alone; it comes from which insets are
   non-auto and from the scroll container.
3. On Web, strip no marker into the DOM path: emit normal CSS and let the
   browser implement sticky.
4. On native, if `position: sticky` is used outside a registered NitroCSS
   scroll/list container, keep normal-flow behavior and expose a development
   warning. This is safer than silently emulating a false fixed position.

### Phase 1: native list/header fast paths

Implement the common cases first:

- a sticky element is a direct child/header of a NitroCSS `ScrollView`;
- vertical `top` sticky with one active inset;
- `SectionList` section headers; and
- `FlatList`/list items when the caller provides an explicit sticky index or
  sticky item contract.

For `ScrollView`, map the discovered direct-child sticky nodes to RN's
`stickyHeaderIndices` where possible. This gives native scrolling behavior and
avoids a per-frame JS implementation. Because RN's API is index-based, the
wrapper must know child order; arbitrary nested descendants cannot be mapped
reliably without a native coordinator.

For `SectionList`, use its native section-header sticky behavior when the CSS
sticky node is the section header. Preserve the CSS inset as a configurable
header offset only if the target RN version/platform supports it; otherwise
document `top: 0` as the fast-path limit.

### Phase 2: general native sticky coordinator

Add a `StickyRegistry` beside `LayoutObserver`:

```text
Fabric mount hook / link registration
        │
        ├─ register sticky node: family, scroll-container, spec
        ├─ post-layout: read normal-flow frame + container bounds
        └─ native scroll callback: read offset (iOS/Android)
                         │
                         ▼
              StickyCoordinator::update
                         │
                         ├─ compute clamped frame
                         ├─ resolve collisions between sticky siblings
                         └─ enqueue one batched shadow-tree mutation
```

For a vertical top-sticky item, the essential calculation is:

```text
normalY = item frame in scroll-content coordinates
lowerY  = containing-block bottom - item height
stuckY  = clamp(normalY - scrollOffsetY, topInset, lowerY)
```

The coordinator must keep the item's flow allocation unchanged while applying
the visual offset. It must also account for the scroll container's viewport
origin, content inset/safe area, RTL, horizontal scrolling, and multiple sticky
items. A later sticky header pushes an earlier one out by using the next
header's normal-flow position as an additional upper bound.

Preferred implementation order:

1. commit a translated/positioned shadow-node frame through the existing
   mutator, if Fabric permits this without changing Yoga's normal-flow size;
2. otherwise use a native overlay/reparenting layer, matching Lynx's legacy
   `FrameLayout` fallback; and
3. never call React state updates or JS `onScroll` handlers to drive the frame.

The scroll listener must schedule/coalesce updates at the native frame boundary
and must not mutate the mounted view tree re-entrantly inside a draw callback.

### Phase 3: integrate with `nitrolist`

Sticky list headers should eventually live in the future `nitrolist` engine,
where item frames, recycling, anchor correction, and scroll offsets already
belong. The list engine should expose a small sticky contract:

```text
registerSticky(itemKey, mode, inset, fullSpan)
updateScrollOffset(scrollViewTag, x, y)
updateMeasuredFrames(itemFrames)
```

Sticky state must be part of the culling/recycling model. A sticky item that is
outside the normal viewport may remain mounted or be represented by an overlay
until the next sticky candidate takes over. Recycling must not duplicate the
same visual item in both its normal slot and sticky slot.

## Compatibility and scope decisions

- Support `top`/`bottom` for vertical containers and `left`/`right` for
  horizontal containers first.
- Treat both-axis sticky as a later feature.
- Support numeric px, rem, safe-area values, and already-resolved CSS variables
  in the first native implementation. Defer percentages and container-relative
  dynamic offsets until a measured-value contract exists.
- Preserve `z-index` and require an opaque background in documentation when a
  sticky header is expected to cover content beneath it.
- Do not implement sticky using `setNativeProps` on every scroll event; that
  would be JS-driven, prone to tearing, and inconsistent with the existing
  native engine direction.
- Do not silently convert sticky to `fixed`: fixed has different containing
  block and lifecycle semantics.

## Test plan

### Compiler/runtime tests

- Web artifact retains `position: sticky` and all inset declarations.
- Native artifact records a sticky marker and resolves safe-area/top values.
- Missing inset produces a warning or normal-flow fallback.
- Platform variants and theme changes do not lose sticky metadata.
- `z-index` and opaque background styles survive sticky resolution.

### Native integration tests

- Direct-child `ScrollView` header sticks at `top: 0`.
- Non-zero top inset and safe-area top inset are honored.
- Header releases at the containing block's bottom.
- Two headers hand off without overlap or flicker.
- Horizontal sticky honors RTL and left/right insets.
- Content/layout changes remeasure without a viewport jump.
- Recycled list headers do not remain in the overlay after leaving range.
- No JS `onScroll` callback is required for visual updates.

### Web parity fixtures

Use the same fixture on Web and native with cases for:

- a simple sticky section header;
- nested overflow containers;
- a sticky node inside a flex/grid parent;
- safe-area-like top offset;
- multiple headers; and
- a short containing block where sticky must stop early.

## Sources

- Lynx position reference: <https://lynxjs.org/api/css/properties/position>
- Lynx scroll-view sticky capability: <https://lynxjs.org/api/elements/built-in/scroll-view.html>
- Lynx scrolling guidance and scroll container model: <https://lynxjs.org/guide/ui/scrolling>
- Lynx list sticky items: <https://lynxjs.org/api/elements/built-in/list.html>
- MDN sticky positioning: <https://developer.mozilla.org/en-US/docs/Web/CSS/position>
- React Native ScrollView sticky headers: <https://reactnative.dev/docs/scrollview>
- React Native Fabric architecture: <https://reactnative.dev/architecture/fabric-renderer>
