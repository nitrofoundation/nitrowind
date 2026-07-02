# Gradient JS/C++ glue — engine v2

Research worker output. READ-ONLY survey of our packages + `react-native-nitro-modules`
+ `react-native-reanimated`, plus an implementation-ready design for a native gradient
engine that replaces RN's `experimental_backgroundImage` string with a structured
descriptor + a Nitro `HybridView` host component.

All names below are illustrative and **rename-agnostic** (the descriptor key,
spec name, and host-component name can all be swapped without changing the shape
of the plan).

---

## 0. TL;DR of the flow we are replacing / building

Today (string path):

```
compiler emits --nw-gradient-* marker props
  → foldGradient (JS: normalize.ts / C++: NitroCssEngine.cpp)
  → style.experimental_backgroundImage = "linear-gradient(...)"
  → RN's native backgroundImage parser paints it on the View itself
```

Problems with the string path for v2:

- `experimental_backgroundImage` is **not animatable** in Reanimated
  (`config.ts` marks it `false // TODO`, see §4).
- The gradient is baked into a string; JS can't re-key colors per theme without
  re-parsing; C++ can't drive gradient-position animation on the shadow tree.
- Radial geometry / interpolation-space nuances are stringly-typed.

New (structured path):

```
compiler emits --nw-gradient-* marker props   (UNCHANGED upstream)
  → foldGradient (JS + C++) now emits a STRUCTURED object under a single key
      style["--nitrowind-gradient"] = { gradientType, angle, position?, colors[], locations[] }
  → View.tsx detects the key, STRIPS it from the RN style, and renders a
      <GradientView> host component (Nitro HybridView) as an absolutely-filling
      FIRST child behind `children`, passing { descriptor, borderRadius }.
  → GradientView (Swift/Kotlin) paints the gradient into a CAGradientLayer /
      android GradientDrawable, clipped to borderRadius.
  → transform animate-* keyframes on the parent Animated.View translate the
      whole subtree (gradient child included) → a translate-based sweep works today.
      Native gradient-*position* animation is a later C++ AnimationBackend item.
```

---

## 1. Current compiler gradient output + the NEW descriptor

### 1a. The marker props (upstream — keep as-is)

`packages/nitrocss/src/compiler/parsers/gradient.ts`

Tailwind v4 splits a gradient across `bg-linear-*`/`bg-radial` (type + geometry)
and `from-*`/`via-*`/`to-*` (color stops). nitrowind lowers each to its own
`--nw-gradient-*` custom prop so the pieces can only be reassembled once every
matching class has merged:

```ts
export const GRADIENT_TYPE_PROP = "--nw-gradient-type";
export const GRADIENT_POSITION_PROP = "--nw-gradient-position";
export const GRADIENT_FROM_PROP = "--nw-gradient-from";
export const GRADIENT_VIA_PROP = "--nw-gradient-via";
export const GRADIENT_TO_PROP = "--nw-gradient-to";
export const GRADIENT_FROM_POSITION_PROP = "--nw-gradient-from-position";
export const GRADIENT_VIA_POSITION_PROP = "--nw-gradient-via-position";
export const GRADIENT_TO_POSITION_PROP = "--nw-gradient-to-position";
```

`extractGradient()` fills these (colors lowered to hex via `culori`, `var()`
left intact for runtime theme resolution; `stripInterpolation` removes
`in oklab`/`in oklch`; `conic` is intentionally unsupported).

**These markers stay exactly as they are.** Only the *fold* changes: instead of
concatenating a `*-gradient(...)` string, both folds emit a structured object.

### 1b. Current fold — the string it produces

`gradient.ts` `foldGradient(style)` (lines 147-167):

```ts
export function foldGradient(style: RNStyle): void {
  const type = asString(style[GRADIENT_TYPE_PROP]);
  const position = asString(style[GRADIENT_POSITION_PROP]);
  const from = asString(style[GRADIENT_FROM_PROP]);
  const via = asString(style[GRADIENT_VIA_PROP]);
  const to = asString(style[GRADIENT_TO_PROP]);
  const fromPosition = asString(style[GRADIENT_FROM_POSITION_PROP]);
  const viaPosition = asString(style[GRADIENT_VIA_POSITION_PROP]);
  const toPosition = asString(style[GRADIENT_TO_POSITION_PROP]);

  for (const prop of GRADIENT_STYLE_PROPS) delete style[prop];
  if (type !== "linear" && type !== "radial") return;

  const stops = [stop(from ?? "transparent", fromPosition ?? "0%")];
  if (via) stops.push(stop(via, viaPosition ?? "50%"));
  stops.push(stop(to ?? "transparent", toPosition ?? "100%"));

  const prelude = position ? `${position}, ` : "";
  style.experimental_backgroundImage = `${type}-gradient(${prelude}${stops.join(", ")})`;
}
```

Re-exported by `packages/nitrowind/src/core/normalize.ts` (line 2/6) and invoked in
`store.ts` after every merge (lines 335-337) plus for container-query buckets
(line 308).

The C++ mirror is `packages/nitrocss/cpp/NitroCssEngine.cpp` `foldGradient(folly::dynamic&)`
(lines 175-209), string-identical, driven by `kGradientProps[]` (lines 161-166) and
called from `NitroCssEngine::resolve()` (line 520, after `foldTransform`, before
`normalizeShadow`). **Both folds must be changed together — a native theme-swap
commit must produce byte-identical output to a JS-resolved style.**

`position` in the current string carries whatever Tailwind put in
`--tw-gradient-position` (e.g. `to right`, `to bottom left`, `45deg`,
`circle at center`) minus the interpolation clause.

### 1c. The NEW structured descriptor

Emit one key instead of the string:

```
style["--nitrowind-gradient"] = GradientDescriptor
```

```ts
// packages/nitrocss/src/compiler/parsers/gradient.ts  (new export)
export const GRADIENT_DESCRIPTOR_PROP = "--nitrowind-gradient";

export interface GradientDescriptor {
  gradientType: "linear" | "radial";
  /** Linear sweep angle in degrees, CSS convention: 0 = to top, 90 = to right.
   *  Always present; radial ignores it. Default 180 (to bottom) when Tailwind
   *  gave no direction. */
  angle: number;
  /** Raw position keyword for radial shape/origin (e.g. "circle at center")
   *  or an un-parsed linear keyword we chose not to fold into `angle`.
   *  Optional; absent for a plain `to <dir>` linear gradient. */
  position?: string;
  /** Resolved stop colors, in order. Length === locations.length.
   *  Hex at compile time; `var()`-substituted-to-hex at resolve time. */
  colors: string[];
  /** Stop offsets in 0..1, in order, monotonic. Parsed from `NN%` / bare
   *  numbers; synthesized 0 / 0.5 / 1 when a stop omitted its position. */
  locations: number[];
}
```

Shape rationale:
- `colors[]` + `locations[]` as parallel arrays map 1:1 onto **iOS**
  `CAGradientLayer.colors`/`.locations` and **Android** `GradientDrawable`
  `colors[]` / `positions[]`, so the native side does no re-parsing.
- `angle:number` is a first-class animatable scalar for the future C++
  AnimationBackend (§4). Radial keeps `position` as an opaque string for now.
- Single object key (not 8 marker props) means `View.tsx` does one lookup /
  strip, and the descriptor survives as a plain JSON-serializable value through
  Nitro (folly::dynamic ↔ JS object) unchanged.

Fold changes (both JS and C++), replacing only the final assembly:

```ts
// JS foldGradient — after reading the 8 markers + deleting them:
if (type !== "linear" && type !== "radial") return;

const colors: string[] = [];
const locations: number[] = [];
const push = (color: string, pct: string) => {
  colors.push(color);
  locations.push(parsePct(pct)); // "50%" -> 0.5 ; "0.5" -> 0.5
};
push(from ?? "transparent", fromPosition ?? "0%");
if (via) push(via, viaPosition ?? "50%");
push(to ?? "transparent", toPosition ?? "100%");

style[GRADIENT_DESCRIPTOR_PROP] = {
  gradientType: type,
  angle: type === "linear" ? angleFromPosition(position) : 180,
  ...(type === "radial" && position ? { position } : {}),
  colors,
  locations,
};
```

- `angleFromPosition("to right")` → 90, `"to bottom"` → 180, `"to top"` → 0,
  `"to bottom right"` → 135, `"45deg"` → 45, undefined → 180. Keep the diagonal
  keyword → degree table in one shared helper; the C++ fold hard-codes the same
  table (small, closed set). If a linear position is not a recognizable
  direction, stash the raw string in `position` and default `angle` to 180.
- `parsePct` and `angleFromPosition` are **pure and shared-by-mirror**: the C++
  `foldGradient` must reproduce the identical numeric results (add a fixture test
  comparing JS vs. C++ output for the same markers — same discipline the file
  header calls out for `foldTransform`).

C++ `foldGradient` (NitroCssEngine.cpp) writes the same object:

```cpp
folly::dynamic desc = folly::dynamic::object();
desc["gradientType"] = type;
desc["angle"] = (type == "linear") ? angleFromPosition(position) : 180.0;
if (type == "radial" && !position.empty()) desc["position"] = position;
folly::dynamic colors = folly::dynamic::array;
folly::dynamic locations = folly::dynamic::array;
// push from / via? / to as above, parsePct(...) -> double
desc["colors"] = std::move(colors);
desc["locations"] = std::move(locations);
style["--nitrowind-gradient"] = std::move(desc);
```

Open decision: whether to **keep** emitting `experimental_backgroundImage` too
(as a web fallback) or emit the descriptor only. Recommendation: descriptor only
on native; on **web** keep the string (web never runs the native engine — see
`View.tsx` `isWeb` branch which leaves `className` on the host and lets Tailwind
CSS own the paint, so web doesn't need either). See §5 open questions.

---

## 2. Nitro HybridView — `GradientView.nitro.ts`

### 2a. What a Nitro HybridView is (from the installed typings)

`node_modules/react-native-nitro-modules/lib/typescript/views/HybridView.d.ts`:

```ts
export interface ViewPlatformSpec { ios?: 'swift'; android?: 'kotlin'; }
export interface HybridViewProps {}   // extend this with your React props
export interface HybridViewMethods {}  // extend for imperative methods (optional)

export type HybridView<
  Props extends HybridViewProps,
  Methods extends HybridViewMethods = {},
  Platforms extends ViewPlatformSpec = { ios: 'swift'; android: 'kotlin' }
> = HybridViewTag<Platforms> & HybridObject<Platforms> & Props & Methods;
```

A HybridView differs from a plain `HybridObject` (like `NativePlatform`,
`ShadowRegistry`) in that props set from JSX are pushed to the native view; it
is consumed as a **React host component** (not `createHybridObject`). Note
existing nitrowind specs are `HybridObject` singletons (`specs/index.ts` uses
`NitroModules.createHybridObject<...>(...)`); the gradient view is the **first
`HybridView`** in the package.

### 2b. The host-component side (`getHostComponent`)

`node_modules/react-native-nitro-modules/lib/typescript/views/getHostComponent.d.ts`:

```ts
export declare function getHostComponent<
  Props extends HybridViewProps,
  Methods extends HybridViewMethods
>(
  name: string,
  getViewConfig: () => ViewConfig<Props>,
): ReactNativeView<Props, Methods>;
```

`getViewConfig` returns a `ViewConfig` (`uiViewClassName`, `validAttributes`,
`bubblingEventTypes`, `directEventTypes`). **Nitrogen generates both** the
`ViewConfig` and a thin `create<Name>` wrapper that calls `getHostComponent` for
you — you import that generated component, you don't hand-write the config.
`callback(...)` wrapping is only needed for function props (we have none).

### 2c. Spec to author

`packages/nitrowind/src/specs/GradientView.nitro.ts`:

```ts
import type { HybridView, HybridViewProps } from "react-native-nitro-modules";

export interface GradientStop {
  color: string;   // hex ("#rrggbb" / "#rrggbbaa")
  location: number; // 0..1
}

export interface GradientDescriptorProp {
  gradientType: "linear" | "radial";
  angle: number;
  position?: string;
  colors: string[];
  locations: number[];
}

export interface GradientViewProps extends HybridViewProps {
  /** The structured descriptor produced by foldGradient (§1c). */
  descriptor: GradientDescriptorProp;
  /** Parent View's resolved corner radius so the paint clips to the same shape.
   *  Single scalar for the common case; extend to per-corner later. */
  borderRadius: number;
}

export type GradientView = HybridView<
  GradientViewProps,
  {},                          // no imperative methods for v1
  { ios: "swift"; android: "kotlin" }
>;
```

Notes:
- Props must be Nitro-serializable. `descriptor` as a nested interface is fine
  (Nitro emits a struct). Alternatively pass the descriptor **fields flattened**
  (`gradientType`, `angle`, `positionKeyword?`, `colors`, `locations`) to avoid a
  nested struct type — either works; nested is cleaner for `View.tsx`.
- `ios:'swift'`, `android:'kotlin'` per the brief (unlike the C++ `ShadowRegistry`).

### 2d. `nitro.json` autolinking

`packages/nitrowind/nitro.json` currently registers HybridObjects only. Add the
view under `autolinking` with the `swift`/`kotlin` keys (this is what tells
nitrogen to generate the view + host component):

```jsonc
"autolinking": {
  "NativePlatform": { "swift": "HybridNativePlatform", "kotlin": "HybridNativePlatform" },
  "GradientView":   { "swift": "HybridGradientView",   "kotlin": "HybridGradientView" }
  // ...existing HybridObjects unchanged...
}
```

Then `nitrogen` (the package's codegen step) emits: the `ViewConfig` +
host-component factory in TS, the `HybridGradientViewSpec` base in
Swift/Kotlin/C++, and registration glue. Implement `HybridGradientView` in
`ios/HybridGradientView.swift` (CAGradientLayer) and
`android/.../HybridGradientView.kt` (GradientDrawable), consuming `descriptor` +
`borderRadius`.

### 2e. Consuming the host component

`getHostComponent`/the generated factory yields a `HostComponent` you render in
JSX. Wrap it in a small internal module so `View.tsx` never touches nitrogen
output directly and web/no-native builds degrade to `null` (same lazy pattern as
`components/animated.ts` `getAnimatedView`):

```ts
// packages/nitrowind/src/components/gradient.ts
import { Platform } from "react-native";
import type { ComponentType } from "react";

let cached: ComponentType<any> | null | undefined;

/** The native GradientView host component, or null (web / not linked). */
export function getGradientView(): ComponentType<any> | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === "web") return (cached = null);
  try {
    // nitrogen-generated factory (name per its output convention)
    cached = require("../specs/GradientView").GradientView ?? null;
  } catch {
    cached = null;
  }
  return cached;
}
```

---

## 3. `View` integration (`packages/nitrowind/src/components/View.tsx`)

Today `View.tsx`:
- resolves styles via `resolveStylesForPlatform(className, snapshot, pseudo)`
  (`resolved.styles`),
- swaps host → `Animated.View` when `resolved.isAnimated` (line 69),
- links the node to the native registry via `useLinkedRef` (lines 42-52),
- renders `style={[resolved.styles, containerStyle, style]}` with children.

`useReactiveSnapshot()` (internal.ts, lines 214-221) deliberately returns only
the **first-paint** snapshot — host components do NOT subscribe to runtime
changes; after mount the C++ engine owns updates. So a gradient painted from
`resolved.styles` at first paint is correct on native, and theme swaps are
handled by the native engine committing new descriptors (once the native
GradientView listens for its own prop updates — see §3 theme note).

### Changes

1. **Detect + strip the descriptor.** After `resolved` is computed, pull
   `--nitrowind-gradient` out of `resolved.styles` so it never reaches RN as an
   unknown style key:

```ts
const gradient = (resolved.styles as any)["--nitrowind-gradient"] as
  | GradientDescriptorProp | undefined;

const { viewStyles, borderRadius } = useMemo(() => {
  if (!gradient) return { viewStyles: resolved.styles, borderRadius: 0 };
  const { ["--nitrowind-gradient"]: _drop, ...rest } = resolved.styles as any;
  return { viewStyles: rest, borderRadius: pickBorderRadius(rest) };
}, [resolved.styles, gradient]);
```

   `pickBorderRadius` reads `borderRadius` (and, later, per-corner radii) from
   the parent's resolved style so the paint clips to the same shape. (The parent
   View keeps its own `borderRadius` in its RN style; the gradient child just
   needs a copy to clip its layer.)

2. **Render the gradient as the FIRST child, absolutely filling, behind
   `children`.** Because it is the first child and absolutely positioned, it
   paints behind everything else in the box:

```tsx
const GradientView = gradient ? getGradientView() : null;

<Base ref={ref} style={isWeb ? style : [viewStyles, containerStyle, style]} ...>
  {!isWeb && GradientView ? (
    <GradientView
      descriptor={gradient!}
      borderRadius={borderRadius}
      // absolutely fill the parent box, behind content
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  ) : null}
  {isWeb ? gradientFallbackChildren : withChildPseudoState(gradientFallbackChildren, snapshot)}
</Base>
```

   - `StyleSheet.absoluteFill` = `{position:'absolute', top/left/right/bottom:0}`.
   - `pointerEvents="none"` so the gradient never intercepts touches.
   - The gradient must be the FIRST child so it is drawn under the real children
     (RN paints children in order; z-index is source order absent explicit
     `zIndex`). Do not give it a `zIndex`.
   - `overflow:'hidden'` on the parent is what makes `borderRadius` clip the
     absolutely-positioned child on both platforms; the native GradientView
     also clips its own layer to `borderRadius` as a belt-and-braces measure
     (esp. Android, where clipping an absolute child to parent radius is
     unreliable). Ensure the parent style carries `overflow:'hidden'` when a
     gradient is present (add it in the strip step if not already set).

3. **Theme reactivity — opt in ONLY when a gradient is present.** Normal host
   Views never subscribe (`useReactiveSnapshot` returns first-paint only). For a
   gradient that uses theme `var()` colors, the descriptor's `colors[]` are
   resolved against the first-paint theme. On a theme swap:
   - The parent's *own* RN style props (backgroundColor, etc.) are updated by the
     C++ engine via the ShadowTree commit (no React).
   - **But** the gradient child is a Nitro host view; its `descriptor` prop is a
     React prop, not something the C++ ShadowRegistry rewrites. So to re-color a
     themed gradient on swap, `View.tsx` must re-render with a fresh descriptor.
     Gate a subscription behind `gradient != null`:

```ts
// only themed gradients need to re-resolve on theme change
const themed = gradient != null && descriptorUsesThemeVar(className);
const liveSnapshot = themed
  ? useRuntimeSnapshot([StyleDependency.Theme, StyleDependency.ColorScheme])
  : snapshot;
```

     Then resolve the descriptor against `liveSnapshot`. Views without a
     gradient pay nothing (keep the current no-subscription behavior).
     `descriptorUsesThemeVar` can be a compile-time flag baked next to the
     marker (whether any of from/via/to were `var()` at compile time), avoiding
     a runtime string scan.
   - Alternative (preferred long-term): have the native `HybridGradientView`
     subscribe to the native runtime and re-key its own `var()` colors in C++,
     so JS never re-renders on theme swap. That requires the descriptor to carry
     **unresolved** `var(--token)` color refs to native — a bigger change; note
     as a follow-up in §5. For v1, JS re-render on themed gradients only is the
     simplest correct path.

   Hooks caveat: `useRuntimeSnapshot` is a hook and can't be called
   conditionally. Implement the opt-in by always calling a hook that takes a
   possibly-empty dependency list, or by splitting the gradient path into a
   dedicated inner component (`<GradientLayer>`), mounted only when `gradient`,
   which owns the subscription. The dedicated-child approach is cleanest and
   keeps the plain-View render path allocation-free.

---

## 4. Reanimated animation surface

### 4a. `experimental_background*` is not animatable (confirmed)

`node_modules/react-native-reanimated/src/common/style/config.ts` (lines 194-200):

```ts
experimental_backgroundImage: false, // TODO
// @ts-ignore This type doesn't exist on non-strict-api
experimental_backgroundPosition: false, // TODO
// @ts-ignore
experimental_backgroundSize: false, // TODO
// @ts-ignore
experimental_backgroundRepeat: false, // TODO
```

`false` = Reanimated's CSS-animation/`useAnimatedStyle` machinery has **no
interpolator** for these props (still a TODO upstream). So you cannot animate the
gradient by animating `experimental_backgroundImage`, and you cannot animate a
descriptor prop through `useAnimatedStyle` either (it's a custom prop on a Nitro
host view, not in Reanimated's config at all). This is the core reason the
structured-descriptor + child-view design exists.

By contrast, `transform` IS animatable — `config.ts` line 187:
`transform: { process: processTransform }`. So **transform keyframes work**, and
they are our vehicle for v1 gradient motion.

### 4b. How `animate-*` transform keyframes reach the gradient child

`View.tsx` swaps the host to Reanimated's `Animated.View` when
`resolved.isAnimated` (lines 69-77). `isAnimated` is set in `store.ts` when a
`transition*` prop, `animationName`, or `--reanimated-*` var is seen (lines
259-269). The nitrocss compiler lowers `animate-*` keyframes into a CSS animation
(`animationName` + keyframes) that Reanimated's CSS-animations engine plays on
the `Animated.View`. Reanimated applies the animated `transform` to the parent
`Animated.View`'s node.

Crucially: **a `transform` on a parent applies to the entire subtree** (it's a
layer/matrix transform, RN + both native platforms). The gradient child is a
normal child of that `Animated.View`, so:

```
Animated.View (parent, animated transform: translateX keyframes)
├─ GradientView   (absoluteFill, first child)   ← moves with the parent transform
└─ children                                       ← also move with the parent
```

- A **translate-based sweep** (`animate-*` that keyframes `translateX`/`translateY`)
  moves the gradient layer across the box exactly like the rest of the subtree —
  no per-child animation needed. If the desired effect is the gradient sliding
  *relative to static content* (e.g. a shimmer), give the GradientView child its
  own `Animated.*` wrapper / animated transform, OR make the gradient layer
  larger than the box and translate only it. Both are achievable with `transform`
  today because `transform` is animatable.
- Because the gradient view is `absoluteFill`, a translate that overshoots simply
  reveals adjacent gradient; combined with `overflow:'hidden'` on the parent this
  yields a clean masked sweep.

So the v1 story: **transform-driven sweeps/shimmers work now** via the existing
`isAnimated → Animated.View` path; nothing new is needed in Reanimated. The
gradient child inherits the parent transform for free; for independent motion,
wrap the gradient child in its own animated component (reuse
`getAnimatedComponent` from `components/animated.ts`).

### 4c. Native gradient-position animation is a later item

Animating the gradient's *own* `angle`/`locations`/`position` (a true
CSS `background-position`/`--tw-gradient` animation, e.g. a hue-rotate or an
angle sweep painted by the layer itself) is **not** doable via Reanimated
transforms and is **not** in `config.ts`. That belongs to the future **C++
AnimationBackend**: the native `HybridGradientView` (or the ShadowRegistry-driven
engine) would interpolate `angle`/`locations` off the JS thread and repaint the
`CAGradientLayer`/`GradientDrawable`. Explicitly out of scope for v1; the
descriptor's `angle:number` + `locations:number[]` shape is chosen so this later
work has scalar targets to interpolate.

---

## 5. Ordered build steps, data shapes, open questions

### Ordered build steps

1. **Descriptor type + shared helpers.** In `gradient.ts`: add
   `GRADIENT_DESCRIPTOR_PROP`, `GradientDescriptor`, and pure helpers
   `parsePct(str)->number(0..1)` and `angleFromPosition(pos?)->number`. Export
   both helpers so the C++ mirror can be validated against them via fixtures.
2. **JS fold rewrite.** Change `foldGradient` (gradient.ts) to emit
   `style[GRADIENT_DESCRIPTOR_PROP] = {...}` instead of
   `experimental_backgroundImage` (keep the marker-strip + type-guard logic).
   Decide web behavior (keep string on web — see open Q). `normalize.ts` re-export
   and `store.ts` call sites (lines 308, 335-337) need no change.
3. **C++ fold rewrite.** Mirror in `NitroCssEngine.cpp` `foldGradient`: build the
   `folly::dynamic` object with identical `angleFromPosition`/`parsePct` results.
   Add a cross-check test (JS vs C++) like the transform-fold discipline noted in
   the file headers.
4. **Spec.** Add `packages/nitrowind/src/specs/GradientView.nitro.ts`
   (`GradientViewProps` = `descriptor` + `borderRadius`; `ios:'swift'`,
   `android:'kotlin'`). Register in `nitro.json` `autolinking`. Run nitrogen.
5. **Native impls.** `HybridGradientView.swift` (CAGradientLayer:
   `colors`/`locations`/`startPoint`+`endPoint` from `angle`; clip to
   `borderRadius`) and `HybridGradientView.kt` (GradientDrawable: `colors[]`,
   `positions[]`, `orientation`/angle; corner radius). Handle `radial` via
   `type:.radial` / `GradientDrawable.RADIAL_GRADIENT` using `position`.
6. **JS consumer module.** `components/gradient.ts` `getGradientView()` (lazy,
   web/no-native → null), mirroring `components/animated.ts`.
7. **View integration.** In `View.tsx`: detect + strip `--nitrowind-gradient`,
   ensure `overflow:'hidden'`, render `<GradientView descriptor borderRadius
   style={StyleSheet.absoluteFill} pointerEvents="none">` as the FIRST child.
   Prefer a dedicated `<GradientLayer>` inner component that owns the (gradient-only)
   theme subscription so the plain path stays subscription-free.
8. **Text/other components.** Repeat the strip in any other component that renders
   `resolved.styles` and can carry a gradient (at least mirror wherever
   `experimental_backgroundImage` used to land). `Text.tsx`, `grid.tsx`,
   `scrollables.tsx` share the same store output — audit each.
9. **Reanimated sweep** works with no Reanimated change (see §4b); add an example
   `animate-*` transform utility to verify the child moves with the parent.

### Data shapes (canonical)

```
// resolved.styles (native), before strip:
{ ...rnStyle, "--nitrowind-gradient": {
    gradientType: "linear", angle: 90,
    colors: ["#ff0000","#0000ff"], locations: [0,1]
} }

// GradientView props (after strip):
descriptor = { gradientType, angle, position?, colors[], locations[] }
borderRadius = number

// C++ folly::dynamic mirror: identical object under key "--nitrowind-gradient"
```

### Open questions

1. **Web fallback.** Keep emitting `experimental_backgroundImage` (the current
   string) on web, and emit descriptor-only on native? `View.tsx`'s `isWeb`
   branch leaves `className` on the host and lets Tailwind CSS paint, so web
   arguably needs neither — but non-Tailwind web consumers relying on the RN-web
   `experimental_backgroundImage` shim would regress. Recommendation: gate the
   fold output by platform, or emit both keys and strip the descriptor on web /
   the string on native. Needs a call.
2. **Themed-gradient reactivity ownership.** v1: JS re-renders themed gradients
   only (§3.3). Long-term: pass **unresolved** `var(--token)` colors in the
   descriptor and let native `HybridGradientView` re-key on the native runtime
   (no JS re-render). The descriptor `colors: string[]` shape supports both, but
   the resolve site differs — decide before shipping so the descriptor contract
   is stable.
3. **borderRadius fidelity.** Single scalar `borderRadius` vs. per-corner
   (`borderTopLeftRadius`…). Start scalar; the descriptor/prop can grow a
   `cornerRadii` field later. Also: does the parent's `overflow:'hidden'` clip
   the absolute child reliably on Android, or must the native layer self-clip?
   (Plan assumes self-clip on Android.)
4. **radial geometry.** `position` stays an opaque string
   (`"circle at center"`, `"ellipse at top left"`). Native must parse it; or the
   compiler could pre-parse radial shape/origin into structured fields. Deferred.
5. **Descriptor as nested struct vs. flattened props.** Nitro supports nested
   structs; flattening avoids a generated struct type. Cosmetic — pick one.
6. **AnimationBackend hook.** Confirm the future C++ animation of
   `angle`/`locations` targets the `HybridGradientView` directly or flows through
   the ShadowRegistry commit path. Out of scope for v1 but shapes whether the
   descriptor lives on the view prop or in the shadow style.

---

STATUS: DONE
