---
title: SVG
description: ClassName-styled react-native-svg primitives.
---


Install the optional peer:

```bash
yarn add react-native-svg
```

Then import wrapped SVG primitives:

```tsx
import { Svg, Path } from "@nitrofoundation/nitrowind/svg";

<Svg viewBox="0 0 24 24" className="h-6 w-6">
  <Path d={ICON} className="fill-primary stroke-white/50 stroke-2" />
</Svg>;
```

SVG components hoist paint styles out of resolved className styles and onto `react-native-svg` props.

| Utility | Prop |
| --- | --- |
| `fill-*` | `fill` |
| `stroke-*` | `stroke` |
| `stroke-2` | `strokeWidth` |
| `opacity-50` | `opacity` |
| `[fill-opacity:0.5]` | `fillOpacity` |
| `[stroke-opacity:0.4]` | `strokeOpacity` |

Use `withSvgClassName` to wrap additional SVG-like components with the same mapping.
