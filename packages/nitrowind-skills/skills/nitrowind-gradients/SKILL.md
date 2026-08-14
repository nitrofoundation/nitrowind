---
name: nitrowind-gradients
description: "Build native linear, radial, and conic gradients with arbitrary values, runtime variables, positioned stops, and animated angles. Use this skill whenever the user mentions \"linear gradient\", \"radial gradient\", \"conic gradient\", \"animate gradient angle\" in a Nitrowind or Nitrocss React Native project."
---

# Native Gradients

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Choose `bg-linear-*`, `bg-radial-*`, or `bg-conic-*` from the geometry the design requires, then provide `from-*`, optional `via-*`, and `to-*` stops.
1. Use arbitrary values or `bg-(image:--token)` only when a standard utility cannot express the gradient; keep runtime custom properties valid CSS image values.
1. Animate the native gradient angle track for a moving conic sweep instead of rotating the entire view, its contents, or its border.
1. Verify gradient rendering independently on iOS and Android because each platform uses its own native gradient layer.

## Recommended pattern

```tsx
<View className="h-40 rounded-3xl bg-conic-45 from-rose-500 via-violet-500 to-cyan-400" />
```

## Canonical docs

- [Gradients and Backgrounds](/features/gradients-and-backgrounds)
- [Animations](/features/animations)
- [Nitrowind-Specific Features](/features/nitrowind-specific)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
