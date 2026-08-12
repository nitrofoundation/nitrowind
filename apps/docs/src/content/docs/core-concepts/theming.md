---
title: React Native Theming
description: Define Nitrowind theme tokens and switch light, dark, system, or named themes in React Native without React re-renders.
---


Themes are CSS variable maps extracted from your stylesheet.

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
```

```tsx
<View className="bg-surface">
  <Text className="text-text">Theme-aware text</Text>
</View>
```

When the theme changes, the native engine recomputes classes that read theme variables and commits updated props to linked nodes.

For named themes and system-following behavior, see [Adaptive Theming](/core-concepts/adaptive-theming/).

## Switching themes

```tsx
import { useNitrowind } from "@nitrofoundation/nitrowind";

function ThemeButton() {
  const { setTheme, setColorScheme } = useNitrowind();

  return (
    <>
      <Button title="Brand" onPress={() => setTheme("brand")} />
      <Button title="System" onPress={() => setColorScheme("system")} />
    </>
  );
}
```

`setColorScheme("light" | "dark" | "system")` controls color-scheme driven theme behavior. `setTheme(name)` selects a named theme directly.
