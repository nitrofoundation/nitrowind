---
title: NitroWind-Specific Features
description: Features in NitroWind and nitrocss that go beyond a standard Tailwind className layer.
---


NitroWind is not only a Tailwind className adapter. The `nitrocss` engine adds native parsing, dependency tracking, and ShadowTree updates for features that are usually handled in JavaScript or left unsupported in React Native.

<img class="docs-feature-image" src="/img/features/native-engine-pipeline.png" alt="NitroWind native engine pipeline illustration" />

## Compared with common RN Tailwind docs

Uniwind documents a strong className layer for React Native primitives, CSS parsing, breakpoints, themes, and component wrapping. NitroWind's differentiator is the native `nitrocss` engine underneath: it turns selected CSS features into native descriptors and tracks the runtime dependencies needed to update them outside React renders.

Useful public reference points:

- [Uniwind ImageBackground](https://docs.uniwind.dev/components/image-background) uses the React Native `ImageBackground` component for background children.
- [Uniwind CSS Parser](https://docs.uniwind.dev/api/css) focuses on CSS that maps to React Native styles.
- [Uniwind Custom Utilities](https://docs.uniwind.dev/theming/custom-utilities) notes that web-only properties like `background-image` and `display: grid` have no native effect there.
- [Uniwind Reanimated Animations](https://docs.uniwind.dev/pro/reanimated-animations) are documented as a Pro feature.

## Feature highlights

| Feature | What NitroWind adds |
| --- | --- |
| Native ShadowTree updates | Theme, color-scheme, safe-area, dimension, RTL, font-scale, group-state, and container-size changes can update linked nodes without React re-rendering the tree. |
| Plain CSS engine | `nitrocss` works without Tailwind. |
| Native background images | `background-image: url(...)` descriptors support cover, contain, stretch, repeat, repeat-x, repeat-y, and focal position. |
| Container queries | Width, height, named containers, and custom `[cq-*]` query tokens. |
| Native gradients | Linear, radial, and conic gradients with themed stops fold into native descriptors. |
| Animated gradient angle | A gradient angle track can be driven from keyframes. |
| Gradient borders | Web-style gradient-border recipes compile into a native descriptor. |
| Clip paths | Supported polygon, circle, and inset masks are applied natively. |
| Text shadow and filters | Dedicated parsers map supported CSS effect values to React Native/native descriptors. |
| Native grid | Auto/dense placement, explicit and named lines, intrinsic content tracks, masonry rows, spans, gaps, and template areas are committed through the C++ layout engine. |
| SVG className primitives | `react-native-svg` paint props are hoisted from className styles. |
| Reanimated utility family | Entering, exiting, layout, spring/easing config, and built-in CSS-keyframe helpers. |

## Native background image

```tsx
<View className="h-44 overflow-hidden rounded-2xl bg-photo bg-cover">
  <Text className="m-4 rounded-lg bg-black/50 px-3 py-1 text-white">
    No extra Image child
  </Text>
</View>
```

## Container size dependency

```tsx
<View className="@container/card rounded-xl p-4">
  <Text className="@min-[320px]/card:text-lg [cq-h>=180px]/card:font-bold">
    Reads width and height from the measured container.
  </Text>
</View>
```

## Theme dependency

```tsx
const { setTheme, setColorScheme } = useNitrowind();

setTheme("ocean");
setColorScheme("system");
```

Classes that read theme variables carry a `Theme` dependency. The engine can recompute those classes when the active named theme changes.
