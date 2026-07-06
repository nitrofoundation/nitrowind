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
