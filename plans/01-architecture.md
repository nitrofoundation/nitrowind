# 01 — Architecture

## One engine, free for everyone

Nitrowind is **not** split into free/pro tiers. It is a single library: the C++
Nitro **ShadowTree engine** (the part uniwind sells as closed-source `uniwind-pro`),
reimplemented openly under MIT. Every user gets the fast path.

Two pieces work together:

- **Build-time compiler** — Tailwind v4 → RN style objects + dependency bitmask.
- **C++ Nitro engine** — links each component's Fabric shadow node to its
  className + dependencies and mutates the **ShadowTree** directly on change.
  Updates skip JS and React reconciliation entirely.

A thin **JS runtime layer** glues them: it resolves the initial style for first
paint and registers each node with the engine. After that, the engine drives all
updates natively.

```
                 ┌─────────────────────────────────────────────┐
   className ───▶│  Build time (Tailwind v4 + lightningcss)     │
   "bg-red-500"  │  → RN style object + dependency bitmask      │
                 └───────────────┬──────────────────────────────┘
                                 │  compiled tables shipped to native
                                 ▼
                    JS runtime layer (per component)
              getStyles() → initial style prop (first paint)
              ShadowRegistry.link(shadowNode, className, deps, …)
                                 │
                                 ▼
                       C++ Nitro engine
              NitrowindRuntime tracks theme/dimensions/colorScheme…
              dependency change → recompute affected nodes
              → ShadowRegistry.updateShadowTree(mutations)
              → commit straight to the Fabric ShadowTree (no React render)
```

> A pure-JS `useReducer` re-render fallback can still exist for environments
> without the native engine (e.g. web or Expo Go), but it is a **fallback**, not
> a separate paid tier.

## Build-time compiler

- Input: your `global.css` (`@import "tailwindcss"` + `@theme`) and the
  `className` strings used in the app.
- Tooling: `@tailwindcss/node`, `@tailwindcss/oxide`, `lightningcss`, `culori`.
- Output:
  - A map `className → RN style object`.
  - A **dependency bitmask** per class: which runtime values it reads
    (`theme`, `colorScheme`, `dimensions`, `insets`, `orientation`, `rtl`, `rem`, `fontScale`).
  - Theme tables (CSS variables per theme) for fast runtime swapping.
- Delivered as a **Metro plugin** (and optionally a Vite plugin for web).

## JS runtime layer (glue)

Thin TypeScript that drives the engine (mirrors uniwind's `dist/module`):

- `core/store.ts` — `NitrowindStore.getStyles(className, props, …)` resolves a
  className to `{ styles, dependencies, isAnimated, … }` for the **first paint**.
- `core/context.ts` — React context carrying the current runtime snapshot.
- `components/*` — pre-wrapped `View`, `Text`, etc. Each renders an initial
  resolved `style`, then in its `ref` callback calls `ShadowRegistry.link(...)`
  to hand the node to the C++ engine; `unlink` on unmount.
- `core/listener.ts` — bitmask pub/sub used only by the **JS fallback** path
  (web / Expo Go / no native engine), where `useReducer` re-renders instead.

With the native engine present, there is no React re-render on theme/size change:
the engine mutates the ShadowTree directly (see below).

## C++ Nitro engine (the core)

Built on `react-native-nitro-modules` (Nitrogen). HybridObjects:

| Object                 | Role                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NitrowindConfig`      | one-time config / bootstrap                                                                                   |
| `NitrowindRuntime`     | holds current theme, dimensions, colorScheme, insets…; emits dependency-change + resolve-classnames callbacks |
| `ShadowRegistry`       | `link`/`unlink`/`suspend` nodes; `updateShadowTree(mutations)` commits styles to Fabric                       |
| `ShadowNodeHandle`     | wraps a Fabric `ShadowNode` pointer (`fromRef`)                                                               |
| `FollyStyle`           | wraps a style object as `folly::dynamic` (`fromJSObject`)                                                     |
| `NativePlatform`       | platform info; Swift (iOS) / JNI (Android) backed                                                             |
| `NitrowindDiagnostics` | optional debugging hooks                                                                                      |

### The link → mutate cycle (the heart of the engine)

1. A native `View` renders normally with `style={[resolved, props.style]}`.
2. In its `ref` callback it reads the Fabric node:
   `ref.__internalInstanceHandle.stateNode.node`.
3. It wraps it: `ShadowNodeHandle().fromRef(node)`, `FollyStyle().fromJSObject(style)`.
4. It registers: `ShadowRegistry.link(handle, className, name, dependencies, …)`.
5. The C++ engine stores: node ↔ className ↔ dependency bitmask.
6. When `NitrowindRuntime` detects a change (theme switch, rotation, etc.) it
   finds every node whose dependency bitmask intersects the change, recomputes
   styles, and calls `ShadowRegistry.updateShadowTree(mutations)`.
7. `updateShadowTree` clones the affected shadow nodes with new props and commits
   a new tree to the Fabric `UIManager` — **off the JS thread, no React render**.

### `UniwindRuntimeCurrent` (runtime snapshot) fields

`colorScheme, hasAdaptiveThemes, currentThemeName, screen(Dimensions),
insets(Insets), orientation, pixelRatio, fontScale, rtl, rem, hairlineWidth`.

### Dependency flags (bitmask)

Each style records which of these it depends on so the engine only recomputes
what's necessary:

```
theme | colorScheme | dimensions | insets | orientation | rtl | fontScale | rem
```

## Why Nitro (not classic TurboModules)?

Nitro gives:

- Zero-overhead JSI HybridObjects with C++/Swift/Kotlin implementations.
- Direct access to `folly::dynamic` and `jsi::Runtime` for ShadowTree work.
- A codegen (`nitrogen`) that produces the `Hybrid*Spec` base classes we subclass.

A tiny empty classic TurboModule (`NativeTurboNitrowind`) is still registered to
guarantee the module is linked into Fabric early.

## Platform strategy

- **Shared C++ core** (`cpp/`) implements the engine once.
- **iOS**: Swift `NativePlatform` + the C++ core, compiled from source via the
  podspec (NOT prebuilt like uniwind-pro).
- **Android**: JNI bridge + the same C++ core via CMake.
