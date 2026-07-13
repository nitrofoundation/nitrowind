---
name: nitrowind-safe-area
description: "Apply safe-area-aware spacing and screen layouts without manually threading inset values through every component. Use this skill whenever the user mentions \"safe area\", \"notch padding\", \"screen safe\", \"inset utilities\" in a Nitrowind or Nitrocss React Native project."
---

# Safe Area Layout

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Use the safe-area utility family for edges that are part of the visual layout.
1. Combine safe-area values with spacing utilities when an edge needs both a device inset and design spacing.
1. Confirm the app provides safe-area information before debugging native inset values.

## Canonical docs

- [Safe Area](/features/safe-area)
- [Runtime State](/core-concepts/runtime-state)
- [Global CSS](/getting-started/global-css)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
