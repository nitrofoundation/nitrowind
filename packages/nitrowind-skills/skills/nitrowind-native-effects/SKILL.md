---
name: nitrowind-native-effects
description: "Use native gradients, gradient borders, shadows, filters, text shadows, and clip paths with deliberate platform fallbacks. Use this skill whenever the user mentions \"gradient border\", \"clip path\", \"backdrop blur\", \"text shadow\", \"native effects\" in a Nitrowind or Nitrocss React Native project."
---

# Native Visual Effects

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Start with a supported CSS declaration and preserve a readable base style for fallbacks.
1. Use theme variables for visual tokens that should react to theme changes.
1. Avoid web-only effect assumptions and explain the supported native boundary in the final implementation.

## Canonical docs

- [Gradients and Backgrounds](/features/gradients-and-backgrounds)
- [Effects](/features/effects)
- [Nitrowind-Specific Features](/features/nitrowind-specific)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
