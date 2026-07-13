---
name: nitrowind-native-props
description: "Map className styles to native component props such as colors, indicators, and component-specific visual settings. Use this skill whenever the user mentions \"native prop\", \"className prop mapping\", \"style component props\" in a Nitrowind or Nitrocss React Native project."
---

# Native Props

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Identify whether the target exposes a style prop or a dedicated native visual prop.
1. Use a component wrapper or prop mapping when a value cannot live in the ordinary style object.
1. Keep prop mapping narrow so it does not accidentally pass unrelated classes to unsupported props.

## Canonical docs

- [Native Props](/features/native-props)
- [Components](/features/components)
- [cssInterop](/api/css-interop)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
