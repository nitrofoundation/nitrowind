---
name: nitrowind-native-engine
description: "Work with the native C++ ShadowTree engine, runtime dependencies, diagnostics, and safe fallbacks. Use this skill whenever the user mentions \"Nitrowind engine\", \"ShadowTree\", \"native style update\", \"runtime fallback\" in a Nitrowind or Nitrocss React Native project."
---

# Nitrowind Native Engine

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Trace a styling problem from CSS compilation through the runtime dependency that should update it.
1. Prefer native resolver behavior for supported capabilities and clearly preserve the JS fallback boundary.
1. Validate against the target platform and new-architecture requirements before diagnosing engine behavior.

## Canonical docs

- [How It Works](/core-concepts/how-it-works)
- [Native Architecture](/native-engine/architecture)
- [Fallbacks](/native-engine/fallbacks)
- [Compatibility](/core-concepts/compatibility)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
