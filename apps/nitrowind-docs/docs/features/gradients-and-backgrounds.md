---
title: Gradients and Backgrounds
description: Native gradient, border gradient, and background image support.
---

# Gradients and Backgrounds

Nitrocss includes dedicated parsers and native appliers for gradient and background-related CSS that React Native does not expose as ordinary style props.

For URL rasters such as `background-image: url(...)`, see [Background Images](./background-images).

## Gradients

Tailwind gradient utilities compile into compact native descriptors:

```tsx
<View className="h-40 rounded-xl bg-linear-to-br from-teal-400 via-cyan-500 to-blue-600" />
```

Theme-aware gradient stops depend on theme variables and update when the theme changes.

Linear, radial, and conic gradients are supported. Conic geometry accepts CSS
`from <angle> at <position>` and renders with the platform-native gradient
layer/shader:

```css
.dial {
  background-image: conic-gradient(
    from 45deg at 50% 50%,
    #14b8a6,
    #3b82f6 60%,
    #8b5cf6
  );
}
```

On iOS versions before 12, conic gradients use a deterministic linear fallback.

## Color mixing

Native color properties can use `color-mix()` with `oklab`, `srgb`, or
`srgb-linear`. Nitrocss resolves live theme variables first and then lowers the
mixed value, including percentages and alpha, to a native color:

```css
.themed-card {
  background-color: color-mix(in oklab, var(--color-brand) 75%, black);
}
```

## Border gradients

The compiler recognizes the common CSS border-gradient recipe:

```css
.gradient-border {
  border: 2px solid transparent;
  background:
    linear-gradient(#fff, #fff) padding-box,
    linear-gradient(135deg, #14b8a6, #3b82f6) border-box;
}
```

## Background images

Native iOS and Android background image appliers live in the core package. The compiler skips CSS that cannot be represented safely in React Native yet.
