# Nitrowind Example (Expo Router · React Native 0.86)

An [Expo Router](https://docs.expo.dev/router/introduction/) app that showcases
nitrowind features one per page. Styling is driven entirely by the native
nitrowind engine — toggling the color scheme, resizing a container, or animating
a view mutates the Fabric ShadowTree in C++ without a React re-render.

## What's here

File-based routes under [app/](app):

| Route          | File                                       | Shows                                                   |
| -------------- | ------------------------------------------ | ------------------------------------------------------- |
| `/`            | [app/index.tsx](app/index.tsx)             | A `FlatList` of every page — tap to navigate            |
| `/animations`  | [app/animations.tsx](app/animations.tsx)   | Entering / exiting / layout + CSS `@keyframes` loops    |
| `/borders`     | [app/borders.tsx](app/borders.tsx)         | Width, color, radius, style, per-side                   |
| `/backgrounds` | [app/backgrounds.tsx](app/backgrounds.tsx) | Solid colors, `/alpha` opacity, theme surfaces          |
| `/transforms`  | [app/transforms.tsx](app/transforms.tsx)   | Rotate / scale / translate / skew + box-shadow          |
| `/containers`  | [app/containers.tsx](app/containers.tsx)   | Native container queries (`@container` + `@min`/`@max`) |
| `/typography`  | [app/typography.tsx](app/typography.tsx)   | Size, weight, tracking, leading, decoration, color      |
| `/theming`     | [app/theming.tsx](app/theming.tsx)         | Live dark / light token swap + `dark:` variants         |
| `/layout`      | [app/layout.tsx](app/layout.tsx)           | Flexbox, gap, safe-area, `ios:` / `android:` variants   |

Supporting files:

- [app/\_layout.tsx](app/_layout.tsx) — root `Stack`, `NitrowindProvider`, and the single `global.css` import.
- [components/ui.tsx](components/ui.tsx) — shared `Screen` / `Section` / `Card` / `ThemeToggle` helpers (no `StyleSheet` anywhere).
- [global.css](global.css) — `@import "tailwindcss"` plus `@theme` tokens and a `.dark` override.
- [metro.config.js](metro.config.js) — wraps Expo's Metro config with `withNitrowindMetroConfig`.

## Run it

> [!IMPORTANT]
> nitrowind ships a [Nitro](https://nitro.margelo.com/) native module, so this
> app needs a **custom dev client** (a prebuild) — it will **not** run in Expo
> Go. The new architecture (`newArchEnabled`) is required.

```sh
# from the repo root
yarn install

cd example

# pin the Expo packages to versions that match your installed Expo SDK
npx expo install --fix

# generate the native iOS/Android projects (git-ignored)
npx expo prebuild --clean

# iOS (builds & launches the dev client)
yarn ios

# Android
yarn android
```

Then start Metro for the dev client:

```sh
yarn start   # expo start --dev-client
```

### Version note

This example targets **React Native 0.86**, which is newer than the React
Native pinned by current Expo SDKs. Run `npx expo install --fix` to align the
`expo-*`, `react-native-reanimated`, `react-native-safe-area-context`, and
`react-native-screens` versions to your SDK, then prebuild. The nitrowind
engine, the iOS Swift/Obj-C++ bridge, and the Android Kotlin/JNI bridge are
autolinked from the `nitrowind` package — no extra native wiring is required.

### Reanimated is optional

The animation utilities (`entering-*`, `exiting-*`, `layout-*`, `animate-*`)
use `react-native-reanimated`. It's listed as a dependency here so the
animations page works, but in your own app it's an **optional** peer — without
it those classes degrade to plain views (no animation, no crash).
