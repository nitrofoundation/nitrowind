---
title: Animations
description: Reanimated preset utilities and CSS animation helpers.
---

# Animations

Nitrowind synthesizes Tailwind utilities for Reanimated entering, exiting, layout, and CSS-keyframe animations.

```tsx
<View className="entering-fade-in entering-duration-300 layout-springify">
  <Text className="animate-wiggle">Animated</Text>
</View>
```

## Preset families

- `entering-*`
- `exiting-*`
- `layout-*`
- `*-duration-*`
- `*-delay-*`
- `*-ease-*`
- `*-springify`
- `*-damping-*`
- `*-stiffness-*`
- `*-mass-*`

## Built-in CSS animations

Built-in `animate-*` utilities include:

- `animate-wiggle`
- `animate-shake`
- `animate-flash`
- `animate-rubber-band`
- `animate-swing`
- `animate-tada`
- `animate-heartbeat`
- `animate-jello`
- `animate-float`
- `animate-breathe`
- `animate-tilt`
- `animate-glitch`

Install `react-native-reanimated` before using animation helpers.
