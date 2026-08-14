---
title: Platforms
description: Use generated platform variants in Tailwind classes.
---

# Platforms

Nitrowind registers Tailwind v4 custom variants for React Native platforms.

```tsx
<Text className="text-base ios:tracking-tight android:font-medium web:hover:underline">
  Platform-specific text
</Text>
```

Supported markers include:

| Variant | Target |
| --- | --- |
| `ios:` | iOS |
| `android:` | Android |
| `web:` | Web |
| `native:` | Native platforms |
| `macos:` | macOS |
| `windows:` | Windows |
| `tvos:` | tvOS |

The compiler tags platform-specific buckets, and the runtime drops buckets that do not match the current platform.

Responsive width and orientation media rules are retained in the compiled
artifact and evaluated against the live native runtime snapshot. This means
`sm:`/`md:` breakpoints and `portrait:`/`landscape:` rules update after a
rotation without relying on a React render.

Accessibility-aware candidates are filtered against React Native's live
`AccessibilityInfo` signals. Supported variants include `motion-reduce:`,
`contrast-more:`, `reduce-transparency:`, `bold-text:`, `screen-reader:`, and
arbitrary font-scale gates such as `font-scale-[>=1.3]:text-lg`. They compose
with platform variants, for example `ios:bold-text:font-semibold`.
