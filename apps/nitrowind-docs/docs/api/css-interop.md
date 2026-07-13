---
title: cssInterop
description: Teach third-party components to understand className props.
---

# cssInterop

`cssInterop` wraps a component and maps className props to style props or native props.

```tsx
import { cssInterop } from "@nitrofoundation/nitrowind";

const StyledSheet = cssInterop(BottomSheet, {
  handleClassName: "handleStyle",
  backgroundClassName: "backgroundStyle",
});
```

The shorthand form maps source className props to target props.

```tsx
<StyledSheet
  handleClassName="bg-zinc-400"
  backgroundClassName="bg-white dark:bg-zinc-950"
/>
```

## Advanced mapping

Use the advanced form when you need one resolved style property:

```tsx
const StyledIcon = cssInterop(Icon, {
  props: {
    color: { fromClassName: "className", styleProperty: "color" },
  },
});
```

Explicit props win over generated props.

`withNitroCss` is the lower-level wrapper behind `cssInterop`.
