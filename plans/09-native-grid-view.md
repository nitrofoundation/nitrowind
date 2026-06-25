# Native NitrowindGridView / ShadowNode

## Goal

Implement a true pre-Yoga grid layout surface for Nitrowind by adding a custom Fabric component (`NitrowindGridView`) with a native ShadowNode/layout implementation. This replaces the temporary JS/grid-status examples once React Native exposes equivalent built-in grid behavior or once Nitrowind owns the native grid component end to end.

## Why a Custom Component Is Required

The current C++ engine mutates props after Fabric/Yoga has already produced layout. That is enough for colors, transforms, filters, container-query style swaps, and other view props, but not enough for CSS Grid. Layout properties must be understood before Yoga computes child frames.

Unknown props such as `gridTemplateColumns`, `gridColumn`, and `gridRow` are ignored by core React Native view layout. A true grid therefore needs a custom component descriptor + ShadowNode that participates in layout.

## Component Contract

JS component:

```tsx
<NitrowindGridView className="grid grid-cols-3 gap-3 auto-rows-[64px]">
  <View className="col-span-2" />
  <View />
  <View className="col-start-2 row-span-2" />
</NitrowindGridView>
```

Generated native props:

```ts
export type GridTrack =
  | { type: "fr"; value: number }
  | { type: "px"; value: number }
  | { type: "auto" };

export type GridItemPlacement = {
  columnStart?: number;
  columnSpan?: number;
  rowStart?: number;
  rowSpan?: number;
};

export type NitrowindGridViewProps = ViewProps & {
  columns?: GridTrack[];
  rows?: GridTrack[];
  autoRows?: GridTrack;
  columnGap?: number;
  rowGap?: number;
  placements?: Record<string, GridItemPlacement>;
};
```

## Compiler Work

1. Parse grid container utilities into metadata instead of normal RN style props:
   - `grid`
   - `grid-cols-N`
   - `grid-rows-N`
   - `auto-rows-[...]`
   - `gap-*`, `gap-x-*`, `gap-y-*`
   - `[grid-template-columns:...]` for explicit repeat/fr/px subsets

2. Parse grid item utilities:
   - `col-span-N`
   - `row-span-N`
   - `col-start-N`
   - `row-start-N`
   - `[grid-column:1_/_span_2]`
   - `[grid-row:1_/_span_2]`

3. Keep unsupported browser-grid grammar inert with diagnostics:
   - `min-content`
   - `max-content`
   - `fit-content()`
   - `subgrid`
   - `masonry`
   - dense auto-placement

## Native Architecture

### Shared C++

Add:

- `cpp/grid/GridTypes.hpp`
- `cpp/grid/GridLayoutEngine.hpp`
- `cpp/grid/GridLayoutEngine.cpp`
- `cpp/fabric/NitrowindGridShadowNode.hpp`
- `cpp/fabric/NitrowindGridShadowNode.cpp`

The grid layout engine should be independent from React Native types where possible:

```cpp
struct GridTrack {
  enum class Type { Fr, Px, Auto } type;
  double value;
};

struct GridPlacement {
  int columnStart = 0;
  int columnSpan = 1;
  int rowStart = 0;
  int rowSpan = 1;
};

struct GridItemLayout {
  double x;
  double y;
  double width;
  double height;
};
```

This makes unit testing possible without booting React Native.

### Fabric ShadowNode

The custom ShadowNode must calculate child layout before mount. Implementation should follow the RN version's supported custom component descriptor APIs for 0.85/0.86:

- generated component descriptor from Codegen
- custom ShadowNode type using `ConcreteViewShadowNode`
- layout override or Yoga measure hook depending on RN internals available in this version

### Android

Add component registration in `NitrowindPackage.kt` once Codegen emits the manager/delegate. CMake already globs `cpp/**/*.cpp`, so shared C++ grid sources are automatically compiled.

### iOS

Add Codegen component provider registration through the pod's generated component descriptors. The podspec already includes `cpp/**/*.{hpp,cpp}`.

## MVP Semantics

Supported first:

- equal `fr` columns
- fixed px columns
- fixed `autoRows`
- `gap`, `rowGap`, `columnGap`
- explicit `colStart`, `rowStart`
- `colSpan`, `rowSpan`
- sparse row-major auto placement

Deferred:

- intrinsic content measurement tracks
- dense placement
- baseline alignment
- `subgrid`
- named grid lines
- full CSS parser parity

## Replacement Plan

When React Native exposes native grid style props, keep the class syntax and switch the compiler from `NitrowindGridView` metadata to normal RN style props behind a feature flag:

```ts
nativeGridMode: "nitrowind" | "react-native";
```

Default to `react-native` once built-in support is stable across iOS and Android.
