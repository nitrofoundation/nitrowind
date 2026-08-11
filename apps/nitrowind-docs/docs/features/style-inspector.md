---
title: Style Inspector
description: Explain class resolution, final native props, dependencies, and update timing.
---

# Style Inspector

The style inspector is a development-only model for understanding what Nitrowind sends to a native view. It reads the existing compiled artifact and native diagnostic counters without patching React or changing application behavior.

For a selected view it reports:

- the original `className` and every compiled rule bucket;
- compiled props and final props after inline-style overrides;
- which class won each override;
- referenced CSS variables and their effective theme values;
- runtime dependencies and other registered nodes affected by those dependencies;
- whether resolution is running through the native engine or JavaScript fallback;
- inspector, native resolve, and native commit timing; and
- unknown classes and unsupported rule buckets.

## Create a controller

```ts
import { createStyleInspector } from '@nitrofoundation/nitrocss/inspector';

const inspector = createStyleInspector();

const unregister = inspector.register({
  id: nativeTag,
  componentName: 'View',
  className: 'rounded-xl bg-primary p-4',
  inlineStyle: { opacity: 0.9 },
  runtime: runtime.current,
});

const selected = inspector.select(nativeTag);
console.log(selected?.compiledRules);
console.log(selected?.finalProps);

unregister();
```

Registration is explicit so production builds do not pay for view discovery. A DevTools overlay can register host nodes when its inspect mode starts and unregister them when it closes.

## Render an overlay

`@nitrofoundation/nitrowind/inspector` provides a small UI-agnostic presenter:

```ts
import { presentStyleInspection } from '@nitrofoundation/nitrowind/inspector';

const sections = selected ? presentStyleInspection(selected) : [];
```

Render the returned sections with any React Native sheet, popover, or Rozenite panel. The presenter does not add an overlay dependency to either package.

## Affected nodes

`inspector.affectedBy([StyleDependency.Theme])` returns registered node IDs whose compiled dependency masks include the changed signal. `nativeAffectedNodeCount` is the engine's aggregate count from its most recent mutation. Together these make it possible to compare the expected dependency fan-out with what the ShadowTree engine actually touched.

> The inspector API is experimental during beta. Keep it behind `__DEV__` and do not use inspection timing as a release benchmark.
