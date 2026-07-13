---
title: Safe Area
description: Safe-area utility families for padding, margin, inset, and screen height.
---

# Safe Area

Nitrowind generates safe-area utilities and resolves them against live runtime insets.

```tsx
<View className="flex-1 pt-safe px-safe-or-4 pb-safe-offset-3">
  <Text>Inset-aware layout</Text>
</View>
```

## Utility families

| Family | Meaning | Example |
| --- | --- | --- |
| `*-safe` | Use the raw safe-area inset. | `pt-safe` |
| `*-safe-or-n` | Use `max(inset, n)`. | `px-safe-or-4` |
| `*-safe-offset-n` | Use `inset + n`. | `mb-safe-offset-2` |
| `h-screen-safe` | Screen height minus top and bottom insets. | `h-screen-safe` |

The `*` covers margin, padding, and inset sides: all, x, y, top, right, bottom, and left.

Safe-area classes carry the `Insets` dependency, so inset changes update affected native styles without React re-rendering.
