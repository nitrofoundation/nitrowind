---
title: Native Effects Pack
description: Layered shadows, filters, blend modes, outlines, continuous corners, and backdrop effects compiled for native views.
---

# Native Effects Pack

The Native Effects Pack compiles browser-style effect declarations into one
compact `--nitrocss-native-effects` descriptor. Nitrocss applies that descriptor
to the existing native view: it does not add a React wrapper and an effect update
does not require a React rerender.

```tsx
<View
  className="[
    box-shadow:0_12px_32px_rgb(15_23_42_/_24%),inset_0_1px_0_rgb(255_255_255_/_35%)
  ] [filter:saturate(1.15)_contrast(1.05)] [border-curve:continuous]"
/>
```

## Effect families

| CSS | Native descriptor | Notes |
| --- | --- | --- |
| `box-shadow` | Ordered outer and `inset` layers | Multiple comma-separated layers are preserved. |
| `filter` | Ordered filter pipeline | `blur`, `brightness`, `contrast`, `grayscale`, `hue-rotate`, `invert`, `opacity`, `saturate`, `sepia`, and `drop-shadow`. |
| `backdrop-filter` | Separate backdrop pipeline | Never filters the view's own content. Non-blur functions remain in the descriptor for native capability handling. |
| `mix-blend-mode` | Blend mode | Includes the standard separable and non-separable CSS modes. |
| `isolation` | `auto` or `isolate` | Creates an explicit compositing group where the platform supports it. |
| `outline` / `outline-*` | Width, style, color, offset | `solid`, `dashed`, `dotted`, and `double` descriptors are accepted. |
| `border-curve` | `circular` or `continuous` | `continuous` maps to `CALayer.cornerCurve` on iOS. |

```css
@utility glass-card {
  backdrop-filter: blur(20px) saturate(140%) contrast(105%);
  outline: 1px solid rgb(255 255 255 / 25%);
  outline-offset: -1px;
  border-curve: continuous;
}

@utility elevated-inset {
  box-shadow:
    0 18px 45px rgb(15 23 42 / 30%),
    0 2px 8px rgb(15 23 42 / 16%),
    inset 0 1px 0 rgb(255 255 255 / 40%);
}
```

## Platform behavior

The compiler output is identical on both platforms. Painting is capability
based so unsupported native primitives are reported by diagnostics instead of
silently changing the CSS meaning.

| Capability | iOS | Android |
| --- | --- | --- |
| Layered and inset shadow descriptor | Native effect layers | Native effect overlay |
| Outline and offset | `CAShapeLayer` | Native overlay drawable |
| Foreground color/blur filters | Platform-dependent | API 31+ `RenderEffect` |
| Blend modes | Core Animation compositing filters | Reported unsupported until a safe per-view blend primitive is available |
| Isolated group | Core Animation group | Hardware compositing layer |
| Continuous corner curve | iOS 13+ | Circular fallback |
| Backdrop pipeline | Native backdrop view; capability-filtered | Descriptor retained; blur/color support depends on OS pipeline |

Use `ios:` and `android:` variants when exact pixels depend on a platform-only
primitive. The original descriptor remains visible in the style inspector,
including functions that the current OS cannot paint.

## Values and variables

Lengths are device-independent CSS pixels. Angles accept `deg`, `rad`, and
`turn`; percentage filter values are normalized (`125%` becomes `1.25`). CSS
variables and fallbacks are resolved before the descriptor is produced.

```css
@theme {
  --panel-effects: blur(18px) saturate(135%);
}

@utility frosted-panel {
  backdrop-filter: var(--panel-effects, blur(12px));
}
```

Invalid comma-separated shadow lists and malformed filter pipelines are rejected
atomically. Nitrocss will not partially paint a declaration whose remaining
tokens could not be understood.
