# nitrowind

The fastest Tailwind bindings for React Native — fully open source. Compiles
Tailwind classes at build time and applies them with a native **C++ ShadowTree
engine**, so theme/color-scheme/dimension changes update Fabric directly without
a React re-render.

Targets **React Native 0.86** (Fabric / bridgeless). MIT licensed, free for everyone.

## Install

```sh
bun add nitrowind react-native-nitro-modules
```

## Usage

```js
// metro.config.js
const { getDefaultConfig } = require("@react-native/metro-config");
const { withNitrowindMetroConfig } = require("nitrowind/metro");
module.exports = withNitrowindMetroConfig(getDefaultConfig(__dirname), {
  input: "./global.css",
});
```

```tsx
import "./global.css";
import { NitrowindProvider, View, Text } from "nitrowind";

export default () => (
  <NitrowindProvider>
    <View className="rounded-2xl bg-surface p-4">
      <Text className="text-on-surface">Hello nitrowind</Text>
    </View>
  </NitrowindProvider>
);
```

## Entry points

- `nitrowind` — runtime API (`View`, `Text`, `NitrowindProvider`, `useNitrowind`, …).
- `nitrowind/compiler` — the build-time Tailwind → style-table compiler.
- `nitrowind/metro` — the Metro plugin (`withNitrowindMetroConfig`).

## Safe-area utilities

Safe-area classes are built in (no extra import) and resolve against the live
window insets **in the native engine** — when insets change (rotation, notch,
keyboard) the engine recomputes and commits straight to the ShadowTree with no
`SafeAreaView` and no React re-render.

```tsx
// inset-top + 20px on top, max(inset-x, 20px) on the sides
<View className="pt-safe-offset-5 px-safe-or-5">{/* … */}</View>
```

- `p-safe` / `pt-safe` / `px-safe` / `inset-safe` … — the raw inset for that edge.
- `*-safe-offset-<n>` — the inset **plus** `n` spacing units (`calc(env + n)`).
- `*-safe-or-<n>` — the inset **or** at least `n` spacing units (`max(env, n)`).

Available for `p*` (padding), `m*` (margin) and `inset`/`top`/`right`/`bottom`/`left`.

## Components

Drop-in, `className`-aware replacements for the common RN host components:

```tsx
import {
  View,
  Text,
  Pressable,
  Image,
  ImageBackground,
  TextInput,
  TouchableOpacity,
  TouchableHighlight,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  FlatList,
  SectionList,
} from "nitrowind";
```

Each resolves its first paint in JS, then hands all later style updates to the
native engine — so theme, color-scheme, dimension and inset changes commit to
the ShadowTree with no React re-render. `ScrollView` / `FlatList` /
`SectionList` also accept a `contentContainerClassName`.

Wrap any other component (third-party or your own) with `withNitrowind`:

```tsx
import { withNitrowind } from "nitrowind";
import { BlurView } from "@react-native-community/blur";

const Blur = withNitrowind(BlurView, "BlurView");
```

## Platform variants

Prefix any utility with a platform to apply it on that OS only. The choice is
made in the native engine, so it costs no React re-render:

```tsx
<Text className="text-base ios:font-semibold android:tracking-wide web:underline">
  Adapts per platform
</Text>
```

Variants: `ios:`, `android:`, `web:`, `macos:`, `windows:`, and `native:`
(every non-web platform). They compose with the other variants, e.g.
`ios:dark:bg-black`.

## Container queries

Style a node based on the measured size of an ancestor — evaluated natively, so
matching styles commit straight to the shadow tree without a React re-render.
Mark a container with `@container` (optionally named, `@container/sidebar`), then
gate descendants on its size:

```tsx
<View className="@container">
  {/* Row when the container is ≥ 320px wide, column otherwise. */}
  <View className="flex-col @min-[320px]:flex-row">
    <Text className="@max-[320px]:hidden">Shown only when wide</Text>
  </View>
</View>
```

Both the Tailwind-native syntax (`@min-[320px]:`, `@max-[400px]:`, `@sm:`, named
`@min-[230px]/sidebar:`) and a custom shorthand are supported:

```tsx
<View className="@container">
  <View className="[parent-w>320px]:flex-row [parent-h<200px]:hidden" />
</View>
```

`[parent-w>320px]:…` reads width, `[parent-h<200px]:…` reads height, with
`>`/`<`/`>=`/`<=` and an optional `/name` to target a named container.

Container sizes are read after layout by a Fabric layout observer (a
`UIManagerMountHook`): once a tree mounts, the C++ engine measures every
container, re-resolves the gated descendants, and commits their new styles in a
follow-up commit — no `onLayout`, no `useWindowDimensions`, no React re-render.
The follow-up commit only happens when a measured size actually changes, so it
converges in a single extra frame.

## Animations (Reanimated)

`entering-*`, `exiting-*`, and `layout-*` utilities map to
[Reanimated](https://docs.swmansion.com/react-native-reanimated/) layout
animations; `animate-*` runs a CSS `@keyframes` animation. The compiler bakes
them into properties the runtime reads back to rebuild the Reanimated object on
the JS/UI thread, swapping the host for the matching `Animated.*` component:

```tsx
<View className="entering-fade-in-down entering-duration-300 exiting-fade-out" />
<View className="layout-linear-transition" />
<View className="animate-wiggle" />
```

Configure animations with `entering-duration-*`, `entering-delay-*`,
`entering-ease-in-out`, `entering-springify`, `entering-damping-*`,
`entering-stiffness-*`, and `entering-mass-*` (likewise for `exiting-`/`layout-`).

`react-native-reanimated` is an **optional peer dependency**: install it to use
these utilities. Without it, animated classes degrade to a plain component (no
animation, no crash).

See the [repository README](../../README.md) for architecture and the full guide.

## License

MIT.
