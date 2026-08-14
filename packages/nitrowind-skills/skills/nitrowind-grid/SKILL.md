---
name: nitrowind-grid
description: "Create native grids with intrinsic tracks, auto and dense placement, named lines, spans, template areas, and masonry rows. Use this skill whenever the user mentions \"native grid\", \"grid auto placement\", \"named grid lines\", \"masonry layout\", \"min-content\" in a Nitrowind or Nitrocss React Native project."
---

# Native Grid Layout

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Put safe-area padding on a parent view and keep `grid` on its child so device insets do not alter track placement.
1. Define explicit tracks first, then use auto rows or columns for implicit tracks and dense flow only when visual backfilling is acceptable.
1. Use named lines or template areas for semantic placement, and use `min-content` or `max-content` when content should determine the intrinsic track size.
1. Use masonry only for intentionally staggered content and verify item order remains understandable for accessibility.

## Canonical docs

- [Nitrowind-Specific Features](/features/nitrowind-specific)
- [Responsive Layouts](/features/responsive-and-containers)
- [Safe Area](/features/safe-area)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
