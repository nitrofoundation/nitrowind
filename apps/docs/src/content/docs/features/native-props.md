---
title: Native Props
description: Map className utilities to native component props and accent colors.
---


Some React Native components paint through props instead of style objects. Nitrowind maps common className-derived colors to host props when possible.

Examples include:

- `placeholderTextColor`
- `selectionColor`
- `cursorColor`
- `selectionHandleColor`
- `underlineColorAndroid`

```tsx
<TextInput
  className="rounded-lg border border-zinc-300 px-3 py-2 text-zinc-950 placeholder:text-zinc-400"
  placeholder="Email"
/>
```

For third-party components, use `cssInterop` or `withNitroCss` mappings to push resolved className styles into the prop your component expects.
