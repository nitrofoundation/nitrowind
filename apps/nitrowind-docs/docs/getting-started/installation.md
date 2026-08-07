---
title: Installation
description: Install Nitrowind and wire it into a React Native or Expo app.
---

# Installation

Install the Tailwind wrapper, the core native engine, Tailwind CSS, and Nitro modules:

```bash
yarn add nitrowind nitrocss tailwindcss react-native-nitro-modules
```

Optional peers:

```bash
yarn add react-native-svg react-native-reanimated
```

Use `react-native-svg` for className-styled SVG primitives. Use `react-native-reanimated` for entering, exiting, layout, and CSS animation helpers.

## Configure Metro

```js title="metro.config.js"
const { getDefaultConfig } = require("@react-native/metro-config");
const { withNitrowindMetroConfig } = require("@nitrofoundation/nitrowind/metro");

module.exports = withNitrowindMetroConfig(getDefaultConfig(__dirname), {
  input: "./global.css",
});
```

Expo apps can import `getDefaultConfig` from `expo/metro-config`.

## Create global CSS

```css title="global.css"
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.72 0.11 178);
  --color-surface: #ffffff;
  --color-on-surface: #111827;
}

.dark {
  --color-surface: #09090b;
  --color-on-surface: #f9fafb;
}
```

## Import CSS once

```tsx title="App.tsx"
import "./global.css";
import { NitrowindProvider, View, Text } from "@nitrofoundation/nitrowind";

export default function App() {
  return (
    <NitrowindProvider>
      <View className="flex-1 items-center justify-center bg-surface pt-safe">
        <Text className="text-xl font-bold text-brand">Hello Nitrowind</Text>
      </View>
    </NitrowindProvider>
  );
}
```

No Babel plugin is required. The Metro plugin compiles your CSS and class candidates at build time.

## Native install notes

iOS needs the normal CocoaPods step:

```bash
cd ios && pod install
```

Android is autolinked through the package Gradle project.
