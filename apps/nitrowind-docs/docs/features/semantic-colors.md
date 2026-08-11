---
title: Native Semantic Colors
description: Platform and dynamic color tokens that follow the operating system without a React theme rerender.
---

# Native Semantic Colors

Semantic colors keep the operating system token in the compiled style instead of replacing it with a fixed hex value. iOS resolves UIKit colors, macOS resolves AppKit colors, and Android resolves theme attributes at paint time, including system appearance and accessibility changes.

The native engine sends React Native's native color objects into Fabric:

- iOS and macOS platform tokens remain native `PlatformColor` semantic names.
- Android tokens remain `PlatformColor` resource paths/theme attributes.
- Dynamic pairs remain Apple dynamic colors, including high-contrast light and dark branches on UIKit and AppKit.
- `color(display-p3 ...)` remains Display-P3 through the native commit; it is not converted to sRGB first.

Fallback values are used by web/tests and non-native fallback paths. They do not
replace a valid token before UIKit or Android resource resolution.

## Platform colors

Use `platform-color()` when you need a native token. Add a fallback for web, tests, or an older platform that does not expose it.

```css title="global.css"
.native-surface {
  background-color: platform-color(systemBackgroundColor, #ffffff);
  border-color: platform-color(separatorColor, #d1d5db);
  color: platform-color(labelColor, #111827);
}

.macos-native-surface {
  background-color: platform-color(windowBackgroundColor, #ffffff);
  color: platform-color(labelColor, #111827);
}

.native-accent-android {
  color: platform-color(?android:attr/colorAccent, #2563eb);
}
```

```tsx
<View className="native-surface rounded-2xl border p-5">
  <Text className="native-surface">Follows the native system palette</Text>
</View>
```

## Dynamic colors

`dynamic-color(light, dark)` selects a pair without requiring a component rerender. A four-value form adds explicit high-contrast light and dark colors.

```css
.adaptive-badge {
  background-color: dynamic-color(
    #eff6ff,
    #172554,
    #ffffff,
    platform-color(systemBlueColor, #1d4ed8)
  );
}
```

Native tokens can be nested inside a dynamic color. The descriptor stays JSON-safe for compiler caches and preserves its fallback for deterministic tests.

## Built-in aliases

The semantic token layer defines cross-platform aliases for `label`, `secondaryLabel`, `systemBackground`, `secondarySystemBackground`, `separator`, `link`, and `accent`. The iOS adapter maps them to UIKit colors, the macOS adapter maps them to AppKit colors such as `windowBackgroundColor` and `controlAccentColor`, and Android maps them to theme attributes.

Prefer semantic colors for app chrome, text, separators, and controls. Keep explicit palette values for brand colors whose appearance must not change with the operating system theme.
