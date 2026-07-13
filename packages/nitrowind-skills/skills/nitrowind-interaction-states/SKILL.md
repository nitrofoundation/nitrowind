---
name: nitrowind-interaction-states
description: "Build pressed, focused, disabled, hover, and group-state UI with native state-aware variants. Use this skill whenever the user mentions \"pressed styles\", \"disabled state\", \"group hover\", \"focus styling\" in a Nitrowind or Nitrocss React Native project."
---

# Interaction States

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Use supported state variants on the component that owns the interaction.
1. Choose Pressable-compatible primitives when a state needs native press feedback.
1. Use group markers only when a parent state should drive descendants.

## Canonical docs

- [States and Groups](/features/states-and-groups)
- [Components](/features/components)
- [Runtime State](/core-concepts/runtime-state)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
