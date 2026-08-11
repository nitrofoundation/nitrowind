---
title: Responsive and Containers
description: Use responsive utilities and container queries in React Native.
---

# Responsive and Containers

Responsive utilities are compiled from Tailwind CSS and depend on runtime dimensions.

```tsx
<View className="p-4 md:p-8 landscape:flex-row">
  <Text className="text-base md:text-lg">Responsive layout</Text>
</View>
```

## Container queries

Nitrocss can mark a node as a queryable container and apply descendant styles based on measured container size.

```tsx
<View className="@container/card rounded-xl p-4">
  <Text className="@min-[320px]/card:text-lg @max-[240px]/card:text-sm">
    Container-aware text
  </Text>
</View>
```

The compiled bucket receives a `ContainerSize` dependency. After layout, the native engine or JS fallback evaluates the container condition and updates affected styles.

## Custom container tokens

The compiler also scans custom container-like tokens and emits their base utility so the style can be cloned after the condition matches.

For the full width, height, named-container, and `[cq-*]` syntax, see [Container Queries](./container-queries).

## Native grid sizing

The native grid path measures Yoga children and uses their intrinsic width and
height for `auto`, `min-content`, `max-content`, spanning items, and `minmax()`
minimums. Fractional tracks are rebalanced after intrinsic columns are sized,
and the engine invalidates layout when child measurements change without a
React re-render.

```tsx
<View className="grid grid-cols-[auto_minmax(8rem,1fr)_2fr] gap-3">
  <Text>Content-sized label</Text>
  <View className="col-span-2" />
</View>
```

React Native exposes one Yoga intrinsic measurement rather than separate web
min-content and max-content modes, so those two keywords share that measurement.
Percentage grid columns continue through the JS fallback.
