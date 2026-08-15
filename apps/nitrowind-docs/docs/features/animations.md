---
title: Animations
description: Reanimated presets, CSS keyframes, and native scroll-driven animations.
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

## Scroll-driven animations

On iOS, a Nitrowind `ScrollView` can drive CSS keyframes directly from its
native scroll position. Give the scroll container a named timeline, then point
any descendant animation at that timeline:

```tsx
import { ScrollView, View } from "@nitrofoundation/nitrocss/components";

export function Feed() {
  return (
    <ScrollView className="feed">
      <View className="reveal-card" />
    </ScrollView>
  );
}
```

```css
@keyframes reveal-card {
  from {
    opacity: 0;
    transform: translateY(32px) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.feed {
  scroll-timeline: --feed block;
}

.reveal-card {
  animation: reveal-card 1s linear both;
  animation-timeline: --feed;
  animation-range: 10% 70%;
}
```

The animation is evaluated natively while the user scrolls; it does not add a
JavaScript `onScroll` handler or require Reanimated. The first iOS release
supports named `scroll-timeline` sources, `block`, `inline`, `x`, and `y` axes,
percentage animation ranges, and keyframes containing opacity, translate,
scale, and Z rotation. Use Nitrowind's `ScrollView` as the timeline source.
Android, list-based sources, view timelines, named range keywords, and more
animatable properties will follow in later releases.
