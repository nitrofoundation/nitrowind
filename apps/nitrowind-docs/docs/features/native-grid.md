---
title: Native Grid
---

# Native Grid

Nitrowind serializes grid metadata once and lays out grid items in the shared C++ engine. On Fabric builds this avoids the `onLayout` → React state → render loop used by a JavaScript fallback.

```tsx
<View className="grid grid-cols-[40%_60%] grid-flow-row-dense place-items-center gap-3">
  <View className="col-start-2 row-start-1 row-span-2" />
  <View className="self-center justify-self-end" />
</View>
```

The native path supports:

- fixed, fractional, percentage, `auto`, `min-content`, and `max-content` tracks;
- `minmax()` minimums and measured intrinsic contributions, including spanning items;
- explicit starts, row and column spans, template areas, and implicit rows;
- normal and dense row auto-placement;
- `place-items`, `items-*`, `justify-items-*`, `self-*`, and `justify-self-*` alignment;
- row/column gaps and container padding.

Intrinsic `min-content` and `max-content` currently use React Native's Yoga measurement because React Native does not expose the browser's separate min-content and max-content measurement modes. Subgrid, masonry, named line placement, and column-direction auto-flow remain future work.
