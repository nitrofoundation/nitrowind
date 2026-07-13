---
name: nitrowind-theming
description: "Create named themes and adaptive light, dark, and system-driven styling. Use this skill whenever the user mentions \"add a theme\", \"dark mode\", \"adaptive theme\", \"theme variables\" in a Nitrowind or Nitrocss React Native project."
---

# Nitrowind Theming

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Define semantic CSS variables before consuming them from className utilities.
1. Use setTheme for an explicit named theme and setColorScheme for light, dark, or system behavior.
1. Treat theme changes as runtime state; do not add React state unless the UI also needs its own state.

## Canonical docs

- [Theming](/core-concepts/theming)
- [Adaptive Theming](/core-concepts/adaptive-theming)
- [Runtime API](/api/runtime)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
