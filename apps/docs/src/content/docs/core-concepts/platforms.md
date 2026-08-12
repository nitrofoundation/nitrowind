---
title: Platforms
description: Use generated platform variants in Tailwind classes.
---


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

The compiler tags platform-specific buckets, and the runtime drops buckets that do not match the current platform.
