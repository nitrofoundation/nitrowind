---
name: nitrowind-migration
description: "Move a NativeWind or Uniwind project to Nitrowind without guessing at configuration changes. Use this skill whenever the user mentions \"migrate from NativeWind\", \"replace Uniwind\", \"remove NativeWind config\" in a Nitrowind or Nitrocss React Native project."
---

# Migrate to Nitrowind

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Inventory the current dependencies, Babel setup, Metro configuration, and CSS entry points first.
1. Apply the Nitrowind Metro and CSS configuration while preserving working component class names where possible.
1. Call out unsupported browser-only CSS instead of silently promising parity.

## Canonical docs

- [Migration](/getting-started/migration)
- [Installation](/getting-started/installation)
- [Compatibility](/core-concepts/compatibility)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
