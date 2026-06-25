# nitrowind

**The fastest Tailwind bindings for React Native — fully open source.**

nitrowind compiles your Tailwind class names at build time and applies them with
a native **C++ ShadowTree engine**. Theme switches, color-scheme changes, and
dimension/orientation/RTL updates are computed in C++ and committed directly to
the Fabric ShadowTree — **without a React re-render**.

It is a clean-room, MIT-licensed reimplementation of the native styling engine
concept, with the whole engine free for everyone. No tiers, no paywall.

> Targets **React Native 0.86** (new architecture / Fabric / bridgeless).

---

## Why it's fast

Most RN Tailwind solutions resolve styles in JavaScript on every render. nitrowind
moves the steady-state work off the JS thread:

1. **Build time** — a compiler (Tailwind v4 + a self-contained CSS reader) turns
   your classes into compact style tables, each tagged with a _dependency
   bitmask_ (does it depend on theme? color scheme? insets? rem? …).
2. **First render** — the JS runtime resolves the initial style and _links_ each
   view's Fabric ShadowNode into the native engine.
3. **Every change after that** — when a dependency changes (e.g. dark mode), the
   C++ engine recomputes only the affected nodes and commits the new props to the
   ShadowTree. React never re-renders.

```
 ┌────────────┐   build    ┌──────────────┐   register   ┌─────────────────────┐
 │ Tailwind   │ ─────────▶ │  compiler    │ ───────────▶ │  C++ StyleEngine     │
 │ CSS + JSX  │            │ (style table │              │  + DependencyIndex   │
 └────────────┘            │  + bitmask)  │              └─────────┬───────────┘
                           └──────────────┘                        │ commit
 ┌────────────┐  link node                                         ▼
 │ <View />   │ ─────────────────────────────────────────▶  Fabric ShadowTree
 └────────────┘                                            (no React re-render)
```

See [plans/](plans/) for the full design notes.

---

## Packages

| Package                                    | Description                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [`packages/nitrowind`](packages/nitrowind) | The library: compiler, JS runtime, Metro plugin, Nitro specs, C++ engine, iOS/Android bridges. |
| [`example`](example)                       | A React Native 0.86 demo app.                                                                  |

---

## Quick start

```sh
bun add nitrowind react-native-nitro-modules
```

**1. Stylesheet** (`global.css`):

```css
@import "tailwindcss";

@theme {
  --color-primary: #6d28d9;
  --color-on-surface: #111827;
}

.dark {
  --color-on-surface: #f9fafb;
}
```

**2. Metro** (`metro.config.js`):

```js
const { getDefaultConfig } = require("@react-native/metro-config");
const { withNitrowindMetroConfig } = require("nitrowind/metro");

module.exports = withNitrowindMetroConfig(getDefaultConfig(__dirname), {
  input: "./global.css",
});
```

**3. App**:

```tsx
import "./global.css";
import {
  NitrowindProvider,
  View,
  Text,
  useNitrowind,
  ColorScheme,
} from "nitrowind";

function Card() {
  const { snapshot, setColorScheme } = useNitrowind();
  return (
    <View className="rounded-2xl bg-surface p-4">
      <Text className="text-lg font-bold text-on-surface">Hello nitrowind</Text>
    </View>
  );
}

export default function App() {
  return (
    <NitrowindProvider>
      <Card />
    </NitrowindProvider>
  );
}
```

iOS: `pod install`. Android: nothing extra — the engine is autolinked.

---

## How the native layer is wired

- **Nitro modules** generate the C++/Swift/Kotlin bindings from the `*.nitro.ts`
  specs in [`src/specs`](packages/nitrowind/src/specs).
- The C++ engine ([`cpp/`](packages/nitrowind/cpp)) owns the `StyleEngine`,
  a `DependencyIndex` of linked nodes, and a `ShadowTreeMutator` that commits via
  `ShadowNode::cloneTree` + `ComponentDescriptor::cloneProps`.
- **iOS** ([`ios/`](packages/nitrowind/ios)) — a Swift `NativePlatform`
  HybridObject reads UIKit appearance/dimensions and pushes them to C++; an
  Obj-C++ installer module hands the engine the `RuntimeExecutor` + `ContextContainer`.
- **Android** ([`android/`](packages/nitrowind/android)) — a Kotlin
  `NativePlatform` HybridObject reads the system configuration; a JNI adapter
  builds a `RuntimeExecutor` from the JS `CallInvoker` and installs the engine.

---

## Development

```sh
bun install
bun run typecheck   # TypeScript across the workspace
bun run test        # compiler unit tests (vitest)
bun run nitrogen    # regenerate Nitro bindings (in packages/nitrowind)
```

> The C++ engine and native bridges are written against the RN 0.86 Fabric APIs.
> They compile as part of an app build (CocoaPods / Gradle) — building them
> requires the React Native source, so validate them on a device/simulator.

## License

MIT — see [LICENSE](packages/nitrowind/LICENSE). Free for everyone.
