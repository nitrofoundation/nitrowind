# 03 — JS runtime layer

**Phase P2.** Thin TypeScript that drives the native engine: it resolves the
**initial** style for first paint and links each component's shadow node to the
C++ `ShadowRegistry`. A pure-JS re-render path exists only as a **fallback** for
environments without the native engine (web / Expo Go).

## Modules

```
src/core/
├── types.ts        # DependencyFlag, RNStyle, RuntimeSnapshot, GetStylesResult
├── store.ts        # NitrowindStore.getStyles()
├── listener.ts     # NitrowindListener (bitmask pub/sub)
├── runtime.ts      # NitrowindRuntime snapshot + setters (JS fallback)
└── context.ts      # React context with the runtime snapshot
src/hoc/
└── withNitrowind.tsx
src/components/
├── View.tsx
├── Text.tsx
├── ScrollView.tsx
└── ...
```

## `NitrowindStore.getStyles(className, props, inlineStyle, ctx)`

Returns:

```ts
{
  styles: RNStyle,            // flattened, theme-resolved
  dependencies: DependencyFlag[],
  isAnimated: boolean,        // has transition/animation → use Reanimated
  entering?, exiting?, layout?// reanimated layout animations (optional)
}
```

Resolution:

1. Split className into tokens.
2. Look up each token's compiled style + dependency mask.
3. Resolve `var(--…)` against the current theme (`ctx.currentThemeName`).
4. Merge in precedence order (later classes win; `!important` beats state).
5. Union the dependency masks.

## `NitrowindListener` (bitmask pub/sub — fallback only)

Used only by the JS fallback path (no native engine). With the engine present,
updates come from C++ and this bus is idle.

```ts
subscribe(cb: () => void, deps: DependencyFlag[]): () => void
notify(changed: DependencyFlag): void   // called by runtime setters
```

Implementation: keep `Set<{ mask, cb }>`. On `notify(flag)`, call every `cb`
whose `mask & (1 << flag)` is set. O(subscribers) but masks are cheap.

## Component linking (primary path) & `withNitrowind` HOC (fallback)

Primary: prewrapped components render an initial `style` and, in their `ref`
callback, call `ShadowRegistry.link(node, className, deps, …)` so the engine
owns subsequent updates (no React re-render). See [05](./05-cpp-engine.md).

Fallback (`withNitrowind`, when the engine is absent):

```tsx
const NitroView = withNitrowind(RNView);
```

1. Read `className` (+ `*ClassName` like `placeholderClassName`).
2. `const { styles, dependencies } = store.getStyles(className, props, …)`.
3. `const [, rerender] = useReducer(() => ({}), {})`.
4. `useLayoutEffect(() => listener.subscribe(rerender, dependencies), [mask])`.
5. Render `<Component {...props} style={[styles, props.style]} />`.

With the engine present, theme/dimension changes are applied natively via
`updateShadowTree` — no React reconciliation.

## Runtime snapshot

`NitrowindRuntime` keeps the same fields as the C++ `UniwindRuntimeCurrent`:
`colorScheme, currentThemeName, screen, insets, orientation, pixelRatio,
fontScale, rtl, rem, hairlineWidth, hasAdaptiveThemes`.

Sources in pure JS:

- `Appearance` → colorScheme
- `Dimensions` → screen + orientation
- `react-native-safe-area-context` → insets
- `PixelRatio` → pixelRatio/fontScale
- `I18nManager` → rtl

Setters (`setTheme`, `onDimensionsChange`, …) call `listener.notify(flag)`.

## Public API (mirrors uniwind)

```ts
import { View, Text } from 'nitrowind/components'
import { useNitrowind, NitrowindProvider } from 'nitrowind'

<View className="flex-1 bg-background p-4">
  <Text className="text-lg text-foreground dark:text-white">Hi</Text>
</View>
```

`useNitrowind()` returns the live runtime snapshot + `setTheme()`.

## Tests

- `getStyles('p-4')` → `{ padding: 16 }`, deps `[]`.
- Engine present: theme switch mutates ShadowTree with no React render.
- Fallback: theme switch re-renders only subscribed components.
- `dark:` classes flip with `Appearance`.
