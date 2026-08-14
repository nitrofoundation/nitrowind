---
title: Effects
description: Shadows, filters, native masks, clip paths, transforms, and font variants.
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
| Mask image | URL and gradient alpha masks support native sizing, positioning, repeating, and animation. |
| Clip path | Supported clip paths are parsed and applied natively. |
| Font variant | CSS font-variant values map to React Native `fontVariant`. |

```tsx
<Text className="text-xl font-bold shadow-lg [text-shadow:0_2px_4px_rgba(0,0,0,0.25)]">
  Polished text
</Text>
```

Unsupported browser-only declarations are ignored rather than leaking invalid props into React Native.

## Native masks and clip paths

Use a mask when an image or gradient should control the alpha of the painted
view. Mask size, position, and repeat are committed through the native iOS and
Android appliers. Use a clip path when a geometric circle, inset, or polygon
should define the visible region instead.

```css
.photo-star {
  mask-image: url("./star.svg");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}
```

Mask animation updates the mask transform or opacity track. It does not rotate
the underlying photo, gradient view, or outer border.
