---
name: nitrowind-accessibility
description: "Adapt styles to reduced motion, increased contrast, reduced transparency, bold text, screen readers, and font scale. Use this skill whenever the user mentions \"reduced motion\", \"increased contrast\", \"screen reader styles\", \"font scale variant\", \"accessibility variant\" in a Nitrowind or Nitrocss React Native project."
---

# Accessibility Variants

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Start with an accessible base style, then use accessibility variants only for the visual or motion changes requested by the live native environment.
1. Use `motion-reduce:`, `contrast-more:`, `reduce-transparency:`, `bold-text:`, and `screen-reader:` for boolean platform signals.
1. Use `font-scale-[<condition>]:` when typography or layout must adapt at a measured native font scale.
1. Test signal changes on a device or simulator and keep content order, labels, and touch targets accessible independently of styling.

## Canonical docs

- [Platforms](/core-concepts/platforms)
- [Runtime State](/core-concepts/runtime-state)
- [Animations](/features/animations)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
