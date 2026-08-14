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
<View className="h-40 rounded-xl bg-radial from-white to-sky-500" />
<View className="h-40 rounded-xl bg-conic-45 from-rose-500 via-violet-500 to-cyan-400" />
```

Linear, radial, and conic gradients share the same theme-aware stop descriptor.
Conic gradients support `from <angle>` and `at <position>` geometry and paint
with Android `SweepGradient` or iOS conic `CAGradientLayer`.

The native parser also supports:

- all `bg-linear-to-*` directions and positive/negative CSS angles;
- `deg`, `grad`, `rad`, `turn`, and Tailwind's negative `calc()` form;
- arbitrary literal gradients and arbitrary stop lists;
- runtime `var()`-backed raster or gradient images;
- percentage `from-*`, `via-*`, and `to-*` positions;
- radial circle/ellipse closest/farthest side/corner geometry;
- Tailwind's default OKLab interpolation through sampled native stops; and
- cascade-correct `bg-none` clearing of already-mounted native paint.

```tsx
<View className="-bg-linear-45 from-red-500 to-blue-600" />
<View className="bg-radial-[circle_closest-side_at_25%_25%] from-white to-rose-600" />
<View className="bg-[linear-gradient(0.25turn_in_oklab,red_0%,lime_45%,blue_100%)]" />
<View className="bg-(image:--hero-gradient)" />
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
