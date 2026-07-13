---
name: nitrowind-components-interop
description: "Style React Native primitives and third-party components with className-aware wrappers. Use this skill whenever the user mentions \"style a third-party component\", \"cssInterop\", \"add className to component\" in a Nitrowind or Nitrocss React Native project."
---

# Components and Interop

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Prefer Nitrowind's exported wrappers for supported React Native primitives.
1. Use cssInterop or withNitroCss to map className output to the component props that actually accept styles.
1. Separate container, content-container, and text style props when the target component has more than one styling surface.

## Canonical docs

- [Components](/features/components)
- [cssInterop](/api/css-interop)
- [Native Props](/features/native-props)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
