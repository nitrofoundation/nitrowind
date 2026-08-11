---
title: Accessibility Variants
description: Adapt native styles to motion, contrast, transparency, bold text, font scale, and screen-reader signals.
---

# Accessibility Variants

Nitrowind's accessibility environment is designed around native signals rather than React component state. The parser and evaluator support these variants:

| Variant | Active when |
| --- | --- |
| `motion-reduce:` | Reduce Motion is enabled |
| `contrast-more:` | Increased/high contrast is enabled |
| `reduce-transparency:` | Reduce Transparency is enabled |
| `bold-text:` | Bold Text is enabled |
| `screen-reader:` | A screen reader is enabled |
| `font-scale-[>=1.3]:` | The current font scale matches the comparison |

Font-scale comparisons accept `>`, `>=`, `<`, `<=`, or `=`. Omitting the operator means `>=`, so `font-scale-[1.2]:text-lg` activates at 1.2 and above.

```tsx
<View className="bg-primary motion-reduce:animate-none contrast-more:border-2 reduce-transparency:bg-surface">
  <Text className="text-white bold-text:font-bold font-scale-[>=1.3]:text-lg">
    Accessible by default
  </Text>
  <Text className="sr-only screen-reader:not-sr-only">
    Extra screen-reader context
  </Text>
</View>
```

Accessibility prefixes can be combined with other variants. For example, `dark:motion-reduce:animate-none` evaluates both the dark and Reduce Motion conditions.

## Native signal adapter

The environment has a narrow adapter boundary so apps and platform integrations can supply signals without coupling the parser to a specific React Native version:

```ts
import {
  createAccessibilityEnvironment,
  type AccessibilitySignalAdapter,
} from '@nitrofoundation/nitrocss/accessibility';

const adapter: AccessibilitySignalAdapter = {
  async getSnapshot() {
    return {
      reduceMotion: await AccessibilityInfo.isReduceMotionEnabled(),
      increasedContrast: await readNativeIncreasedContrast(),
      reduceTransparency: await AccessibilityInfo.isReduceTransparencyEnabled(),
      boldText: await AccessibilityInfo.isBoldTextEnabled(),
      fontScale: PixelRatio.getFontScale(),
      screenReaderEnabled: await AccessibilityInfo.isScreenReaderEnabled(),
    };
  },
  subscribe(listener) {
    // Subscribe to AccessibilityInfo and font-scale/configuration changes,
    // call listener with a complete snapshot, then remove every listener here.
    return () => removeNativeListeners();
  },
};

const accessibility = createAccessibilityEnvironment(adapter);
await accessibility.start();
```

Adapters always emit a complete snapshot. `normalizeAccessibilityEnvironment` defaults absent booleans to `false` and invalid font scales to `1`.

## React Native hooks

The production adapter is already available for React Native apps. It reads `AccessibilityInfo` and `PixelRatio`, listens for accessibility and font-scale changes, and shares one native subscription set across every mounted consumer:

```tsx
import {
  useAccessibilityClassName,
  useAccessibilityEnvironment,
} from '@nitrofoundation/nitrocss/accessibility';

function AccessibleCard({ className }: { className: string }) {
  const accessibility = useAccessibilityEnvironment();
  const activeClassName = useAccessibilityClassName(className);

  return (
    <View className={activeClassName}>
      <Text>Font scale: {accessibility.fontScale}</Text>
    </View>
  );
}
```

The first hook consumer installs native listeners; the last unmount removes them. Non-React integrations can use the same singleton through `nativeAccessibilityEnvironment.subscribe(...)` and `.getSnapshot()`.

## Compiler/runtime integration

`resolveAccessibilityClassName(className, snapshot)` filters inactive candidates before normal class resolution. Active candidates retain their original identity because that is the key stored in the compiled artifact. The native runtime integration should register these signals as dependencies and rerun only nodes whose candidates use the changed variant. This keeps accessibility updates on the same targeted native path as themes, insets, and dimensions.

```ts
const activeClassName = resolveAccessibilityClassName(className, snapshot);
const styles = resolveStyles(activeClassName, runtimeSnapshot);
```

The static adapter is useful for deterministic examples and tests:

```ts
const adapter = createStaticAccessibilityAdapter({
  reduceMotion: true,
  increasedContrast: false,
  reduceTransparency: false,
  boldText: false,
  fontScale: 1,
  screenReaderEnabled: false,
});
```

> These APIs are experimental during beta. Native signal wiring varies by React Native and OS version; test every enabled variant on both iOS and Android.
