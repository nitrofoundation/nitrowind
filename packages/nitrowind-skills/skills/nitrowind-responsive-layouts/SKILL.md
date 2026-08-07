---
name: nitrowind-responsive-layouts
description: "Adapt React Native layouts to screen dimensions, orientation, platform, RTL, and font scale. Use this skill whenever the user mentions \"responsive layout\", \"orientation styles\", \"platform variant\", \"font scale\" in a Nitrowind or Nitrocss React Native project."
---

# Responsive Layouts

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Use responsive utilities for screen-level changes and keep structural layout simple.
1. Put safe-area spacing on the screen parent; keep a grid as a child layout so its columns only arrange content inside the safe region.
1. Use platform variants for native platform differences instead of runtime conditionals where possible.
1. Use container queries when the parent size, not the screen, defines the layout.

## Canonical docs

- [Responsive and Containers](/features/responsive-and-containers)
- [Platforms](/core-concepts/platforms)
- [Runtime State](/core-concepts/runtime-state)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
