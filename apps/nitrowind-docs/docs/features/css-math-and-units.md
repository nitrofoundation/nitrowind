---
title: CSS Math and Runtime Units
description: calc(), min(), max(), clamp(), viewport units, container units, and runtime CSS variables in native styles.
---

# CSS Math and Runtime Units

Nitrocss compiles CSS math into a small expression tree. Device- and container-dependent values stay symbolic until the native runtime has the current viewport, parent measurement, font scale, and variables. The compiled expression is reusable; a measurement change only evaluates affected styles.

## Functions

The parser supports nested `calc()`, `min()`, `max()`, and `clamp()` expressions, including `var()` fallbacks and the normal arithmetic precedence for `+`, `-`, `*`, and `/`.

```css title="global.css"
.responsive-card {
  width: min(92vw, 42rem);
  padding-inline: clamp(16px, calc(4cqi + var(--gutter, 0px)), 40px);
  min-height: max(180px, 30cqb);
}
```

```tsx
<View className="@container responsive-card">
  <Text>Math resolves from this container's native measurement.</Text>
</View>
```

## Units

| Family | Units | Runtime input |
| --- | --- | --- |
| Absolute and font | `px`, `rem`, `em` | Root and current font size |
| Percentage | `%` | The destination property's percentage base |
| Viewport | `vw`, `vh`, `vmin`, `vmax` | Window dimensions |
| Container | `cqw`, `cqh`, `cqi`, `cqb` | Nearest query container |

`cqi` and `cqb` use the logical inline and block axes. In the default horizontal writing mode they map to width and height.

## Runtime variables

Variables can themselves contain math or runtime units:

```css
@theme {
  --page-gutter: clamp(12px, 3vw, 32px);
}

.page {
  padding-inline: var(--page-gutter);
}
```

Missing values use the `var()` fallback. Cyclic variables are rejected instead of recursing indefinitely. Division by zero and expressions missing a required runtime measurement remain unresolved and are surfaced by diagnostics.

## Performance model

The compiler records whether an expression depends on viewport, container, percentage base, font size, root font size, or a named variable. That dependency list lets Nitrowind invalidate only the styles affected by a runtime change.
