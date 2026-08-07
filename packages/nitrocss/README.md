# nitrocss

The core native CSS engine for React Native. `nitrocss` compiles **plain CSS** into a compact style artifact and resolves `className` strings through a fully native C++ ShadowTree engine — themes, color scheme, safe-area insets, `rem`, pseudo state, group state, and container queries all update without React re-renders.

No Tailwind required. If you want Tailwind class names on top of this engine, use the wrapper package [`nitrowind`](https://www.npmjs.com/package/nitrowind), which plugs a Tailwind build pipeline into the same Metro transformer.

## Quick start

```bash
npm install @nitrofoundation/nitrocss react-native-nitro-modules
```

```js
// metro.config.js
const { withNitroCssMetroConfig } = require("@nitrofoundation/nitrocss/metro");

module.exports = withNitroCssMetroConfig(getDefaultConfig(__dirname), {
  input: "./global.css", // plain CSS: classes + @theme variables
});
```

```css
/* global.css */
@theme {
  --color-brand: oklch(0.7 0.15 250);
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
        <Text className="title">Hello</Text>
      </View>
    </NitroCssProvider>
  );
}
```

## What it does

- Reads a plain `.css` entry file (classes, `@theme` variables, media/container queries).
- Flattens nested CSS with lightningcss and converts supported declarations into React Native style buckets with dependency masks.
- Ships the compiled artifact to a small C++ engine that resolves `className` strings against runtime state and commits updates straight to the ShadowTree.
- Falls back to a JS resolver when the native engine is unavailable (web, Expo Go, tests).

## Entry points

- `nitrocss` — runtime API: `NitroCssProvider`, styled components (`View`, `Text`, …), `useNitroCss`, `withNitroCss`, `cssInterop`, `registerSerializedStyles`.
- `/nitrocss/components` — styled component wrappers.
- `/nitrocss/svg` — className-styled `react-native-svg` primitives (optional peer).
- `/nitrocss/compiler` — build-time compiler API (node-only): `compileFromCss`, `flattenCss`, `scanCustomContainerCandidates`, `serializeArtifact`.
- `/nitrocss/metro` — `withNitroCssMetroConfig` Metro plugin.
- `/nitrocss/metro/pipeline` — the default plain-CSS pipeline; wrapper packages provide their own via the `pipeline` option.
- `cpp/NitroCssEngine.hpp` — the C++ runtime resolver linked into the Android and iOS targets.

The compiler intentionally skips features that do not map cleanly to React Native yet, such as CSS `background-image` URLs. On web builds the stylesheet is passed through untouched so the browser handles it directly.
