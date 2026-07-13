---
name: nitrowind-svg
description: "Use Tailwind className styles for react-native-svg paint, stroke, fill, and sizing properties. Use this skill whenever the user mentions \"style SVG\", \"fill class\", \"stroke class\", \"react-native-svg\" in a Nitrowind or Nitrocss React Native project."
---

# SVG Styling

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Import supported SVG primitives from the Nitrowind SVG entry point or wrap a compatible export.
1. Apply paint and geometry classes to the SVG element that owns the corresponding prop.
1. Keep structural SVG definitions separate from className-styled painted elements.

## Canonical docs

- [SVG](/features/svg)
- [Components](/features/components)
- [Installation](/getting-started/installation)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
