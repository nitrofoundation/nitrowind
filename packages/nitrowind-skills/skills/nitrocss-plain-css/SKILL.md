---
name: nitrocss-plain-css
description: "Use the native Nitrowind engine directly with authored CSS classes instead of Tailwind utilities. Use this skill whenever the user mentions \"use plain CSS\", \"configure NitroCSS\", \"no Tailwind\" in a Nitrowind or Nitrocss React Native project."
---

# Nitrocss Plain CSS

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Use the Nitrocss Metro entry point and a single source CSS file.
1. Keep authored classes aligned with native React Native capabilities and describe any intentional platform fallback.
1. Verify that the class candidates are scanned by Metro before debugging runtime styles.

## Canonical docs

- [Plain CSS](/getting-started/plain-css)
- [Metro API](/api/metro)
- [Compatibility](/core-concepts/compatibility)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
