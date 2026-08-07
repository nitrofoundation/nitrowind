---
name: nitrowind-safe-area
description: "Apply safe-area-aware spacing and screen layouts without manually threading inset values through every component. Use this skill whenever the user mentions \"safe area\", \"notch padding\", \"screen safe\", \"inset utilities\" in a Nitrowind or Nitrocss React Native project."
---

# Safe Area Layout

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Apply the safe-area utility family to a non-grid screen parent, not to the grid container itself.
1. Place the grid in a child View, then apply `grid`, `grid-cols-*`, and `gap-*` only on that child so the grid arranges content within the already-safe region.
1. Combine safe-area values with spacing utilities when an edge needs both a device inset and design spacing.
1. Use a native development client or production build to validate insets; safe-area utilities read native insets and do not require a `useSafeAreaInsets` fallback.

## Recommended pattern

```tsx
<View className="flex-1 pt-safe pb-safe">
  <View className="flex-1 grid grid-cols-2 gap-4">
    <View className="bg-violet-400" />
    <View className="bg-violet-500" />
  </View>
</View>
```

## Canonical docs

- [Safe Area](/features/safe-area)
- [Runtime State](/core-concepts/runtime-state)
- [Global CSS](/getting-started/global-css)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
