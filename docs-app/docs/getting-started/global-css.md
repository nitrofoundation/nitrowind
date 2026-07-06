---
title: Global CSS
description: Author Tailwind v4 theme tokens and reusable CSS classes for Nitrowind.
---

# Global CSS

Nitrowind uses Tailwind v4. Your CSS entry file should import Tailwind and define tokens with `@theme`.

```css title="global.css"
@import "tailwindcss";

@theme {
  --color-primary: #0f766e;
  --color-surface: #ffffff;
  --color-on-surface: #111827;
  --radius-card: 12px;
}

.dark {
  --color-surface: #09090b;
  --color-on-surface: #f9fafb;
}
```

Then use tokens from className:

```tsx
<View className="rounded-card bg-surface p-4">
  <Text className="text-primary">Saved</Text>
</View>
```

## Plain classes

You can define reusable CSS classes alongside Tailwind utilities:

```css
.panel {
  border-radius: 12px;
  padding: 16px;
  background-color: var(--color-surface);
}
```

```tsx
<View className="panel">
  <Text className="text-on-surface">Reusable CSS class</Text>
</View>
```

## Supported dynamic inputs

Compiled styles can depend on:

| Runtime value | Example |
| --- | --- |
| Theme variables | `bg-surface`, `text-primary` |
| Color scheme | `dark:bg-black` |
| Dimensions and orientation | responsive utilities |
| Safe-area insets | `pt-safe`, `mb-safe-or-4` |
| RTL | direction-aware values |
| Font scale and rem | text and rem-based lengths |
| Container size | container query utilities |
| Group state | `group-active:*`, `group-focus:*` |
