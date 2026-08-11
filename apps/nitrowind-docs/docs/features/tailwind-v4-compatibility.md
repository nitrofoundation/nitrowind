---
title: Tailwind CSS v4 Compatibility
description: Native 3D transforms, new state variants, starting styles, and wide-gamut P3 and OKLCH colors.
---

# Tailwind CSS v4 Compatibility

Nitrowind's Tailwind v4 layer preserves modern utility semantics as typed native descriptors. The compiler understands bracketed values and variants without splitting colons or spaces inside arbitrary syntax.

## 3D transform parsing

```tsx
<View className="perspective-near perspective-origin-top-right">
  <View className="origin-[50%_50%_24px] transform-3d translate-z-4 rotate-y-45 backface-hidden">
    <Text>Native 3D card</Text>
  </View>
</View>
```

The compiler recognizes these primitives and preserves them as typed descriptors:

- `perspective-none`, `perspective-dramatic`, `perspective-near`, `perspective-normal`, `perspective-midrange`, and `perspective-distant`
- arbitrary perspective values such as `perspective-[650px]`
- transform and perspective origins
- `transform-3d`, `transform-flat`, `backface-hidden`, and `backface-visible`
- `translate-z-*`, `rotate-x-*`, `rotate-y-*`, and `rotate-z-*`

Today, React Native's direct style path lowers perspective, `rotateX`, `rotateY`, `rotateZ`, transform origin, and backface visibility natively. `translate-z-*`, `transform-3d`, and perspective-origin descriptors are retained for diagnostics and future native layer/matrix adapters; they are not silently emitted as invalid React Native style properties.

## State variants

```tsx
<Pressable
  accessibilityState={{ disabled: false, expanded: true }}
  dataSet={{ state: 'open' }}
  className="not-disabled:data-[state=open]:aria-[expanded=true]:bg-emerald-500"
>
  <Text className="starting:opacity-0">Ready</Text>
</Pressable>
```

The compiler recognizes `not-*`, `starting:`, `data-[name=value]`, `aria-[name=value]`, and arbitrary state selectors such as `[&:pressed]`. Unsupported selectors remain visible in diagnostics instead of silently becoming base styles.

## Wide-gamut colors

Display P3 and OKLCH values stay typed until the final color-lowering boundary:

```css
.p3-accent {
  background-color: color(display-p3 1 0.2 0 / 80%);
}

.perceptual-accent {
  color: oklch(72% 0.18 40 / 90%);
}
```

Preserving the descriptor avoids early clipping and produces stable cache keys. The JavaScript fallback performs a deterministic sRGB conversion. Native wide-gamut display adapters are represented by the descriptor contract and can be added without changing compiled styles.
