# nitrowind

The fastest Tailwind bindings for React Native — a thin **Tailwind CSS wrapper** around
[`nitrocss`](../nitrocss), the fully open-source native C++ ShadowTree
styling engine.

nitrocss is stylesheet-agnostic: it compiles flattened CSS into native style tables and
resolves them on the UI thread, so theme/color-scheme/dimension changes update Fabric
directly without a React re-render. This package plugs Tailwind v4 into that pipeline:

- **Metro plugin** — `withNitrowindMetroConfig` wires nitrocss's transform worker to a
  Tailwind build pipeline (oxide class scanning + Tailwind v4 compilation).
- **Extra utilities** — synthesizes the platform variants (`ios:`, `android:`, `web:`, …),
  the safe-area family (`pt-safe`, `mb-safe-or-4`, `h-screen-safe`, …), and the
  Reanimated / CSS-animation utilities (`entering-fade-in`, `animate-wiggle`, …) on top of
  your stylesheet.
- **Runtime re-export** — the full nitrocss runtime (components, provider, hooks, HOCs)
  is re-exported here, including the historical `Nitrowind*` names as aliases.

Targets **React Native 0.86** (Fabric / bridgeless). MIT licensed, free for everyone.

## Install

```sh
yarn add @nitrofoundation/nitrowind @nitrofoundation/nitrocss tailwindcss react-native-nitro-modules
```

`react-native-svg` and `react-native-reanimated` are optional peers (SVG styling and
entering/exiting/layout animations).

## Quickstart

**1. Wrap your Metro config** (`metro.config.js`):

```js
const { getDefaultConfig } = require("@react-native/metro-config"); // or expo/metro-config
const { withNitrowindMetroConfig } = require("@nitrofoundation/nitrowind/metro");

module.exports = withNitrowindMetroConfig(getDefaultConfig(__dirname), {
  input: "./global.css",
});
```

**2. Create the stylesheet** (`global.css`):

```css
@import "tailwindcss";
@reference "@nitrofoundation/nitrocss";

@theme {
  --color-brand: oklch(0.72 0.11 178);
}
```

The `@reference` line enables Tailwind CSS IntelliSense for NitroWind's native
safe-area utilities (`pt-safe`, `pb-safe`, `pt-safe-offset-4`, `pb-safe-or-6`,
and all margin/inset equivalents) without adding duplicate CSS to the app.

**3. Import it once and use `className`**:

```tsx
import "./global.css";
import { NitrowindProvider, View, Text } from "@nitrofoundation/nitrowind";

export default function App() {
  return (
    <NitrowindProvider>
      <View className="flex-1 items-center justify-center bg-white dark:bg-black pt-safe">
        <Text className="text-brand text-xl font-bold ios:tracking-tight">
          Hello Nitrowind
        </Text>
      </View>
    </NitrowindProvider>
  );
}
```

Importing the stylesheet compiles your Tailwind classes at build time and registers the
resulting style tables with the native engine — no Babel plugin, no runtime CSS parsing.

## Entry points

| Import | Contents |
| --- | --- |
| `nitrowind` | Runtime: components, `NitrowindProvider`, hooks, HOCs (re-export of nitrocss + `Nitrowind*` aliases) |
| `/nitrowind/components` | className-aware React Native components |
| `/nitrowind/svg` | className-aware `react-native-svg` bindings |
| `/nitrowind/compiler` | Node-only: `compile`, `compileCss`, `scanCandidates`, plus the nitrocss compiler surface |
| `/nitrowind/metro` | `withNitrowindMetroConfig` |
| `/nitrowind/metro/pipeline` | The Tailwind `scan`/`buildCss` pipeline handed to the nitrocss transformer |
| `/nitrowind/presets` | Dependency-free `cssInterop` recipes for popular component libraries |
| `/nitrowind/tooling` | Node-only autocomplete generation and migration inspection APIs |

## Developer tools

Generate a manifest of classes that were both discovered and successfully
compiled, plus a TypeScript union for local design-system APIs:

```sh
yarn nitrowind autocomplete --input global.css
```

This writes `.nitrowind/classes.json` and `.nitrowind/classes.d.ts`. Re-run it
when utility usage or the theme changes. Check an existing setup before moving
from NativeWind or Uniwind; the migration command is read-only:

```sh
yarn nitrowind migrate --from nativewind
yarn nitrowind migrate --from uniwind --json
```

Third-party libraries can use maintained mappings without making them NitroWind
dependencies:

```tsx
import { FlashList } from "@shopify/flash-list";
import { withInteropPreset } from "@nitrofoundation/nitrowind";

const StyledFlashList = withInteropPreset(FlashList, "shopifyFlashList");
```

## Options

`withNitrowindMetroConfig(config, options)`:

| Option | Default | Description |
| --- | --- | --- |
| `input` | — | Path to the entry stylesheet |
| `content` | `./App.*`, `./app/**`, `./src/**`, `./components/**` | Globs scanned for `className` usage |
| `rem` | `16` | Root rem in px |
| `cwd` | `process.cwd()` | Project root |
| `rewriteReactNativeImports` | `true` | Rewrite `react-native` host-component imports to className-aware wrappers |

## License

MIT
