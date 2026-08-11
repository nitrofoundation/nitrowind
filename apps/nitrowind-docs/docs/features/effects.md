---
title: Effects
description: Shadows, text shadows, filters, clip paths, transforms, and font variants.
---

# Effects

Nitrocss has dedicated parsers for React Native effect shapes.

## Supported effect families

| Feature | Notes |
| --- | --- |
| Transform | Individual transform utilities are folded into React Native `transform` arrays. |
| Box shadow | CSS shadow declarations become native shadow styles where supported. |
| Text shadow | CSS text-shadow maps to React Native text shadow props. |
| Filter | Supported filter entries are parsed into native filter descriptors. |
| Backdrop filter | Uses a native backdrop view path where available. |
| Clip path | Supported clip paths are parsed and applied natively. |
| Font variant | CSS font-variant values map to React Native `fontVariant`. |

```tsx
<Text className="text-xl font-bold shadow-lg [text-shadow:0_2px_4px_rgba(0,0,0,0.25)]">
  Polished text
</Text>
```

Unsupported browser-only declarations are ignored rather than leaking invalid props into React Native.

## Clip paths

Nitrowind sends `clip-path` through Nitrocss as a compact shape descriptor. iOS
builds a `UIBezierPath`; Android builds an `android.graphics.Path`. The shape is
updated by the native engine without creating an SVG component or causing a
React rerender.

```css
@utility clip-trapezoid {
  clip-path: polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%);
}
```

```tsx
<View className="h-32 bg-violet-500 clip-trapezoid" />
```

| Shape function | Supported syntax |
| --- | --- |
| `polygon()` | Three or more percentage or pixel point pairs. |
| `circle()` | Percentage/pixel radius and optional `at x y` center. |
| `ellipse()` | Percentage/pixel radii and optional `at x y` center. |
| `inset()` | One to four percentage/pixel edges and optional uniform `round` radius. |
| `path()` | Absolute SVG `M`, `L`, `C`, and `Z` commands; optional `evenodd` fill rule. |

Convex shapes clip the complete view on Android, including its children.
Android falls back to exact background clipping for concave polygons and paths
because the platform outline API cannot mask an entire View with a concave
path. iOS masks the complete layer for every supported shape.

`url()`, `shape()`, `xywh()`, and `rect()` are not currently compiled. Unsupported
shape functions are ignored instead of passing an invalid style to React Native.
