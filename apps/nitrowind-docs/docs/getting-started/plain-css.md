---
title: Plain CSS with nitrocss
description: Use the core native CSS engine without Tailwind.
---

# Plain CSS with nitrocss

`nitrocss` is the engine under Nitrowind. Use it directly when you want native className styling with plain CSS instead of Tailwind.

```bash
yarn add @nitrofoundation/nitrocss react-native-nitro-modules
```

```js title="metro.config.js"
const { getDefaultConfig } = require("@react-native/metro-config");
const { withNitroCssMetroConfig } = require("@nitrofoundation/nitrocss/metro");

module.exports = withNitroCssMetroConfig(getDefaultConfig(__dirname), {
  input: "./global.css",
});
```

```css title="global.css"
@theme {
  --color-brand: oklch(0.72 0.11 178);
}

.card {
  background-color: var(--color-brand);
  border-radius: 12px;
  padding: 16px;
}
```

```tsx
import "./global.css";
import { NitroCssProvider, View, Text } from "@nitrofoundation/nitrocss";

export default function App() {
  return (
    <NitroCssProvider>
      <View className="card">
        <Text>Hello</Text>
      </View>
    </NitroCssProvider>
  );
}
```

The runtime API is the same engine surface that Nitrowind re-exports with `Nitrowind*` aliases.
