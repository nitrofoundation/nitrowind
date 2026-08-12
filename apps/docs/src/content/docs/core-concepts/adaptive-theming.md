---
title: Adaptive Theming
description: Use light, dark, system, and named themes with Nitrowind.
---


Nitrowind is not limited to light and dark. The compiler extracts every theme it can find, registers those theme names with the runtime, and lets the native engine update linked nodes when the active theme changes.

## Theme sources

Theme variables can come from several CSS shapes:

```css title="global.css"
@theme {
  --color-surface: #ffffff;
  --color-text: #111827;
  --color-accent: #0f766e;
}

.dark {
  --color-surface: #09090b;
  --color-text: #f9fafb;
}

.theme-ocean {
  --color-surface: #ecfeff;
  --color-text: #083344;
  --color-accent: #0891b2;
}

[data-theme="sunset"] {
  --color-surface: #fff7ed;
  --color-text: #431407;
  --color-accent: #ea580c;
}
```

Supported theme selectors:

| Selector | Theme name |
| --- | --- |
| `@theme { ... }` | Base theme, normally `light` |
| `:root { ... }` | Base theme |
| `.light { ... }` | `light` |
| `.dark { ... }` | `dark` |
| `.theme-ocean { ... }` | `ocean` |
| `[data-theme="sunset"] { ... }` | `sunset` |
| `@media (prefers-color-scheme: dark) { :root { ... } }` | `dark` |

## Adaptive mode

By default, the runtime follows the system color scheme and maps it to `light` or `dark`.

```tsx
import { useNitrowind } from "@nitrofoundation/nitrowind";

function ThemeControls() {
  const { themeName, setTheme, setColorScheme } = useNitrowind();

  return (
    <View className="gap-3">
      <Text className="text-text">Current theme: {themeName}</Text>
      <Button title="Ocean" onPress={() => setTheme("ocean")} />
      <Button title="Sunset" onPress={() => setTheme("sunset")} />
      <Button title="Follow system" onPress={() => setColorScheme("system")} />
    </View>
  );
}
```

Calling `setTheme("ocean")` selects a named theme and stops following color-scheme changes. Calling `setColorScheme("light" | "dark" | "system")` returns to adaptive behavior.

## Theme merging

Named themes inherit from the base theme. Define common tokens once in `@theme`, then override only the tokens that change in `.theme-name` or `[data-theme="name"]`.

When a class reads a theme variable, that class carries a `Theme` dependency. Theme changes can be resolved by the native engine and committed to the ShadowTree without React re-rendering the component tree.
