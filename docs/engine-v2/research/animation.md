# Engine v2 — Animation Research

How our engine animates styles. Two horizons:

- **NOW** — Reanimated is the animation engine for v2. CSS `@keyframes`
  (`animate-*`) run natively through Reanimated's CSS-animation engine;
  `entering-*` / `exiting-*` / `layout-*` presets run on the JS/UI thread through
  Reanimated's layout-animation builders.
- **LATER** — React Native ships a C++ shared animation backend
  (`AnimationBackend` + commit hook + choreographer) gated behind
  `cxxNativeAnimatedEnabled` + `useSharedAnimatedBackend`, plus a View Transition
  API gated behind `viewTransitionEnabled`. Both are **off by default** in RN
  0.86 (the version vendored here). These are a future adoption target, not a
  current dependency.

All names below are current at time of writing; treat them as
**rename-agnostic** — match by role/shape, not by exact identifier.

RN version in tree: `react-native@0.86.0`
(`node_modules/react-native/package.json`).

---

## 1. Current nitrowind animation path (NOW)

### 1a. Compile: `animate-*` and `entering-*` → style props / custom props

Two distinct mechanisms share one file,
`packages/nitro-css/src/compiler/parsers/animations.ts` (header comment lines
1–16):

1. **CSS `@keyframes` animations** (`animate-wiggle`, `animate-gradient-shift`,
   …). The `animation` shorthand plus the matching `@keyframes` block are folded
   — at compile time — into the discrete `animation*` style props that
   Reanimated's CSS-animation engine consumes (`animationName`,
   `animationDuration`, …). These run natively with **no JS driver**.
2. **Reanimated entering/exiting/layout presets** (`entering-fade-in`, …), which
   compile to `--reanimated-*` custom properties. Those are *kept* in the bucket
   so the runtime can rebuild the Reanimated animation object on the JS/UI
   thread.

**Predicates** (`animations.ts`):

```ts
export const REANIMATED_VAR_PREFIX = "--reanimated-";
export const isReanimatedVar = (prop) => prop.startsWith(REANIMATED_VAR_PREFIX);
export const isAnimationProp   = (prop) => prop === "animation"; // only shorthand we fold
export const isTransitionProp  = (prop) => prop === "transition-property" | -duration | -delay | -timing-function;
```

**`extractKeyframes(css, rem)`** walks every `@keyframes name { … }` block into a
`name -> Keyframes` map. Combined selectors (`"0%, 100%"`) are split so each
offset is a discrete entry (the shape Reanimated's CSS API expects). Each step's
declarations run through `parseKeyframeStep`, and `transform:` strings run
through `parseTransformString`.

**`foldAnimation(shorthand, keyframes)`** (lines 299–340) tokenizes the CSS
`animation` shorthand (e.g. `"wiggle 1s ease-in-out infinite"`) and emits the
discrete RN props, resolving the referenced `@keyframes` into an **inline
`animationName` object**:

```ts
// token classification order: time → iteration → timing-fn → direction → fill → play-state → name
if (TIME_RE.test(token))        props.animationDuration ?? = token; else animationDelay = token;
if (ITERATION_RE.test(token))   props.animationIterationCount = token === "infinite" ? token : Number(token);
if (TIMING_FUNCTIONS.has(token)) props.animationTimingFunction = token;
// …direction / fillMode / playState…
const frames = keyframes[token];
if (frames !== undefined) { props.animationName = frames; hasName = true; }
return hasName ? props : undefined; // unknown name → undefined
```

So `animationName` ends up as a **keyframes object**, not a string — Reanimated's
CSS-animation engine reads that object directly.

**Reanimated presets are generated, not hand-written**
(`packages/nitro-css/src/compiler/reanimated.ts`):

- `ENTERING_EXITING_PRESETS` (lines 23–102) — every Reanimated entering/exiting
  builder (`FadeIn`, `FadeInDown`, `BounceIn`, `ZoomInRotate`, …). Each yields an
  `entering-<kebab>` and `exiting-<kebab>` `@utility` that sets
  `--reanimated-entering: <Preset>;` / `--reanimated-exiting: <Preset>;`.
- `LAYOUT_PRESETS` (lines 105–112) — `LinearTransition`, `CurvedTransition`, …
  → `layout-<kebab>` → `--reanimated-layout: <Preset>;`.
- Config utilities (`buildConfigUtilities`, lines 275–308): `entering-duration-*`,
  `entering-delay-*`, `entering-damping-*`, `entering-stiffness-*`,
  `entering-mass-*`, `entering-ease-{linear,in,out,in-out,bounce}`,
  `entering-springify` — each writes a `--reanimated-<type>-<field>` custom prop.
- `CSS_ANIMATIONS` (lines 114–243): built-in `@keyframes` + `animate-<name>`
  utilities (`wiggle`, `shake`, `flash`, `rubber-band`, `swing`, `tada`,
  `heartbeat`, `jello`, `float`, `breathe`, `tilt`, `glitch`).

The whole thing is concatenated into `REANIMATED_CSS` (lines 332–336) and
appended to user CSS before Tailwind compiles, so the classes compose with
variants (`dark:`, `md:`, `ios:`) for free.

### 1b. Runtime resolve: `--reanimated-*` → animation objects; `isAnimated` flag

`packages/nitro-css/src/core/store.ts`, `resolveStylesUncached` (lines 233–367):

- A per-node `reanimatedVars: Record<string,string>` accumulator collects the
  `--reanimated-*` props out of the RN style object (they aren't valid style
  keys). Encountering any `--reanimated-*` sets `isAnimated = true` (lines
  262–266).
- `transition*` props and `animationName` also set `isAnimated = true` (lines
  267–269) — that's the signal that flips a node to the Reanimated component.
- After all buckets merge, `foldTransform` + `foldGradient` + `normalizeShadow`
  run, then the entering/exiting/layout objects are rebuilt (lines 342–352):

```ts
const entering = hasReanimatedVars(reanimatedVars) ? buildEnteringAnimation(reanimatedVars) : undefined;
const exiting  = hasReanimatedVars(reanimatedVars) ? buildExitingAnimation(reanimatedVars)  : undefined;
const layout   = hasReanimatedVars(reanimatedVars) ? buildLayoutAnimation(reanimatedVars)   : undefined;
```

`GetStylesResult` carries `{ styles, isAnimated, entering?, exiting?, layout? }`.

**The builders** (`packages/nitro-css/src/core/reanimated.ts`):

- `react-native-reanimated` is an **optional peer dep**; `loadReanimated()`
  `require`s it in a `try/catch` and caches `null` on failure — so every entry
  point degrades to `undefined` and apps that don't animate pay nothing.
- `extractAnimationConfig(vars, prefix)` reads `--reanimated-<prefix>` (name) +
  `-duration/-delay/-springify/-damping/-stiffness/-mass/-easing`.
- `buildEnteringExiting` looks the name up in the module (`mod[config.name]`,
  the Reanimated builder class), then `createBaseInstance` (`.duration()` /
  `.delay()`) and `applyComplexConfig` (`.springify()`, `.damping()`,
  `.stiffness()`, `.mass()`, `.easing(...)`). `easingFor` maps `"ease-in"` →
  `Easing.in(Easing.quad)`, `"ease-bounce"` → `Easing.bounce`, etc.
- `buildLayoutAnimation` is the same shape but only `LinearTransition` gets the
  spring/easing builders applied.
- **Design note (reanimated.ts lines 1–14):** entering/exiting/layout are built
  on the JS side deliberately — "The C++ engine deliberately does **not** drive
  these (they live on the JS/UI thread)."

### 1c. Component swap: `View.tsx` → Reanimated `Animated.View`

`packages/nitro-css/src/components/animated.ts` — lazy, cached accessors:

- `getAnimatedView()` → `require("react-native-reanimated").default.View` or
  `null`.
- `getAnimatedComponent(component)` → `createAnimatedComponent`, memoised
  per-input in a `WeakMap` (line 42). The comment (41) is load-bearing:
  recreating the wrapper on every render "breaks Reanimated + remounts the tree."

`packages/nitro-css/src/components/View.tsx` (lines 67–88):

```tsx
const Animated = resolved.isAnimated ? getAnimatedView() : null;
const Base = (Animated ?? RNView) as typeof RNView;
const animationProps = Animated
  ? { entering: resolved.entering, exiting: resolved.exiting, layout: resolved.layout }
  : undefined;
// …
<Base ref={ref} style={[resolved.styles, containerStyle, style]} {...animationProps} {...rest}>
```

So when a class uses any animation utility, the host component becomes
`Animated.View` and the `entering`/`exiting`/`layout` builders (plus the CSS
`animationName` sitting in `resolved.styles`) drive the animation. `resolved` is
`useMemo`-d on `[className, snapshot, __nitrowindPseudoState]` (View.tsx 38–41).

### 1d. What Reanimated CSS animations CAN and CAN'T animate

The allowlist / processor table is
`node_modules/react-native-reanimated/src/common/style/config.ts`
(`STYLE_PROPERTIES_CONFIG`). A prop with a truthy entry (or a `process`
function) is animatable by Reanimated's CSS engine; `false` is a hard no-op.

**Animatable** (relevant subset): `opacity`, `transform` (via `processTransform`
— `translateX/Y`, `scaleX/Y`, `rotate*`, `skew*`, `perspective`),
`transformOrigin`, `backgroundColor` / `color` / all border colors (via
`processColor`), `width` / `height` / min/max, margins, paddings, insets,
`borderRadius*`, `borderWidth*`, `boxShadow` (`processBoxShadow`), `filter`
(`processFilter`), `gap`, flex props, `zIndex`, `mixBlendMode`.

**NOT animatable — the important gap** (config.ts lines 194–200):

```ts
experimental_backgroundImage:    false, // TODO
experimental_backgroundPosition: false, // TODO
experimental_backgroundSize:     false, // TODO
experimental_backgroundRepeat:   false, // TODO
```

Our gradients compile to RN's native `experimental_backgroundImage` (see
`packages/nitro-css/src/compiler/parsers/gradient.ts` / `foldGradient`), and none
of `experimental_background*` is animatable in Reanimated. **This is exactly why
the gradient sweep is faked with a translate**, not by animating
`background-position` — see §2.

---

## 2. Gradient-view animation NOW (translate-based sweep)

### 2a. The technique

The classic web "animated gradient" animates `background-position` on an
oversized gradient. RN + Reanimated can't animate any `experimental_background*`
(§1d), so we reproduce the same diagonal sweep by **translating an oversized
gradient layer** — `translateX/Y` are fully animatable.

Live in `apps/example/global.css` (lines 26–47) and `apps/example/app/gradients.tsx`:

```css
/* mirrors background-position: 25% 0% → 76% 100% → 25% 0% */
--animate-gradient-shift: gradient-shift 8s ease-in-out infinite;
@keyframes gradient-shift {
  0%   { transform: translateX(-70px) translateY(-28px); }
  50%  { transform: translateX( 70px) translateY( 28px); }
  100% { transform: translateX(-70px) translateY(-28px); }
}
```

```tsx
// gradients.tsx AnimatedGradient(): oversized (180%) layer, clipped by overflow-hidden parent
<View className="h-40 overflow-hidden ...">
  <View className="absolute h-[180%] w-[180%] animate-gradient-shift
                   bg-linear-[144deg] from-primary via-cyan-400 to-danger" />
</View>
```

The overhang (the 180% oversize) keeps the parent frame filled while the layer
translates. `animate-gradient-shift` is a plain CSS `@keyframes` animation, so it
rides the **same native Reanimated CSS-animation path as `animate-*`** — the
gradient layer is just a child `View` that carries `animationName`, which flips
it to `Animated.View` via the `isAnimated` path in §1c.

The gradient itself (`bg-linear-[144deg] from-primary … to-danger`) is folded to
one native `experimental_backgroundImage` at resolve time via `foldGradient`
(`packages/nitro-css/src/core/normalize.ts` re-exports it; `store.ts` calls it in
the fold pass, lines 335–337). Theme tokens (`from-primary`, `to-danger`) mean
the gradient re-resolves on theme change.

### 2b. Transforms propagate from the parent Animated.View

The sweep can be driven from the **parent** `Animated.View` because RN transforms
propagate to children: if the animated `translate` lives on a wrapper and the
gradient is a child, the child sweeps with it. In the current example the
`animate-*` class is on the gradient layer itself, but either placement works —
the key constraint is that the moving node be the `Animated.View` (or a
descendant of one) and the parent clip (`overflow-hidden`) hides the overhang.

### 2c. Keeping a running animation stable across theme recompute — DO THIS

`resolved` is memoised on `[className, snapshot, ...]` (View.tsx 38–41), and a
theme toggle changes `snapshot` → `resolveStylesForPlatform` re-runs →
`resolved.styles`, `resolved.entering`, and `resolved.animationName` are **new
object identities** even when the animation didn't logically change.

Risks:

- **entering/exiting/layout** builder instances are rebuilt on every theme
  recompute (store.ts 342–352 always constructs fresh objects). A new `entering`
  identity handed to `Animated.View` can re-trigger / glitch the mount
  animation.
- **`animationName`** (the keyframes object) gets a new identity too; a running
  CSS animation can restart when the style object it lives in is replaced.

Recommended, implementation-ready, in `View.tsx` (or in `store.ts` at cache
level):

1. **Memoize the animation objects by value, not by snapshot.** The
   entering/exiting/layout builders and the `animationName` keyframes depend only
   on the *animation* inputs (`--reanimated-*` vars + the keyframes), which are
   theme-independent. Key them on the animation-relevant tokens (the `animate-*`
   / `entering-*` substring of `className`), not on the full `snapshot`, so a
   theme change reuses the same instance. A stable module-level cache keyed by
   `animationName-string + config` returns a referentially-stable builder.
2. **Hold a ref across renders.** In `View.tsx`, keep `entering`/`exiting`/
   `layout` and `animationName` in `useRef`s and only swap the ref contents when
   the *animation identity* (not the theme) changes — e.g. compare a cheap
   animation key string. Pass the ref's current value to `Animated.View` so a
   theme-only recompute keeps the exact same objects and the running animation is
   undisturbed.
3. The `store.ts` `resolveCache` (LRU keyed on `snapshotKey|stateKey|className`)
   already dedupes *identical* snapshots, but a theme change is a *different*
   snapshot key, so it does not help here — the memoization must be scoped to the
   animation inputs specifically.

### 2d. KNOWN BUG to fix — `%` dropped in `parseTransformString`

`packages/nitro-css/src/compiler/parsers/animations.ts`:

`parseTransformString` (lines 173–201) sends `translateX` / `translateY` args
through `lengthToNumber` (lines 53–59):

```ts
const lengthToNumber = (raw, rem) => {
  const m = /^(-?\d*\.?\d+)(px|rem|em|pt)?$/.exec(value); // no % branch
  if (!m) return Number.parseFloat(value) || 0;           // "-18%" → parseFloat → -18
  // …
};
```

`translateX(-18%)` does not match the regex (the `%` unit isn't in the alternation
and the `$` anchor rejects the trailing `%`), so it falls through to
`Number.parseFloat("-18%")` → **`-18` (a raw px number), silently dropping the
`%`.** Percentage translate is a natural way to express an oversized-layer sweep
(`translateX(-18%)`), but today it is mis-parsed to `-18px`. This is why the
example uses hard px (`translateX(-70px)`) rather than `%`.

**Fix direction:** `translateX` / `translateY` accept string percentages in RN's
transform array (`{ translateX: "-18%" }`). Add a `%` branch to `lengthToNumber`
(or special-case percent before it) so `parseTransformString` preserves
`"-18%"` as a string instead of coercing to a number. This makes the sweep
resolution-independent and removes the magic px constants in `global.css`.

---

## 3. LATER — RN C++ AnimationBackend (FUTURE, off by default)

**FUTURE.** Everything in this section is gated and disabled by default in RN
0.86. Do not build against it for v2's first cut; this is the adoption target
once the flags ship on.

### 3a. Feature gates

`node_modules/react-native/ReactCommon/react/featureflags/ReactNativeFeatureFlags.h`:

- `cxxNativeAnimatedEnabled()` — line 55, doc line 52–54: *"Use a C++
  implementation of Native Animated instead of the platform implementation."*
- `useSharedAnimatedBackend()` — line 465, doc 462–464: *"Use shared animation
  backend in C++ Animated."*
- `viewTransitionEnabled()` — line 495, doc 492–494: *"Enable the View Transition
  API for animating transitions between views."*

Defaults (`ReactNativeFeatureFlagsDefaults.h`): all three return **`false`**
(lines 38–40, 366–368, 390–392). The OSS-experimental overrides
(`ReactNativeFeatureFlagsOverridesOSSExperimental.h`) flip
`cxxNativeAnimatedEnabled` and `useSharedAnimatedBackend` to **`true`** (lines
30–32, 50–52) but **not** `viewTransitionEnabled`.

### 3b. Wiring (Scheduler)

`node_modules/react-native/ReactCommon/react/renderer/scheduler/Scheduler.cpp`:

```cpp
// lines 60–68
if (ReactNativeFeatureFlags::useSharedAnimatedBackend()) {
  auto animationBackend = std::make_shared<AnimationBackend>(
      schedulerToolbox.animationChoreographer, uiManager);
  schedulerToolbox.animationChoreographer->setAnimationBackend(animationBackend);
  uiManager->unstable_setAnimationBackend(animationBackend);
}
// lines 162–166
if (ReactNativeFeatureFlags::viewTransitionEnabled()) {
  viewTransitionModule_ = std::make_shared<ViewTransitionModule>();
  viewTransitionModule_->initialize(uiManager_.get(), viewTransitionModule_);
}
```

`AnimationChoreographer` (`SchedulerToolbox.h` line 67) is supplied by the
platform toolbox. `UIManager.cpp` guards the animated-backend paths on
`useSharedAnimatedBackend()` too (lines 213, 278, 744) and the view-transition
path on `viewTransitionEnabled()` (line 721).

### 3c. Backend API

Directory:
`node_modules/react-native/ReactCommon/react/renderer/animationbackend/`
(sibling of `.../animated/`). Key files: `AnimationBackend.{h,cpp}`,
`AnimationBackendCommitHook.{h,cpp}`, `AnimationChoreographer.h`,
`AnimatedProps.h`, `AnimatedPropsRegistry.h`, `AnimatedPropsBuilder.h`.

**`AnimationBackend`** (`AnimationBackend.h`) implements
`UIManagerAnimationBackend`. Shape:

```cpp
struct AnimationMutation { Tag tag; shared_ptr<const ShadowNodeFamily> family;
                           AnimatedProps props; bool hasLayoutUpdates{false}; };
struct AnimationMutations { vector<AnimationMutation> batch; set<SurfaceId> asyncFlushSurfaces; };
using Callback = function<AnimationMutations(AnimationTimestamp)>;

class AnimationBackend : public UIManagerAnimationBackend {
  void commitUpdates(SurfaceId, SurfaceUpdates&);
  void synchronouslyUpdateProps(const unordered_map<Tag, AnimatedProps>& updates);
  void requestAsyncFlushForSurfaces(const set<SurfaceId>&);
  void onAnimationFrame(AnimationTimestamp) override;   // driven by the choreographer
  CallbackId start(const Callback&) override;           // register a per-frame producer
  void stop(CallbackId) override;
  void pushAnimationMutations(const Callback&) override;
  // …AnimatedPropsRegistry animatedPropsRegistry_; AnimationBackendCommitHook commitHook_;…
};
```

Per frame: `AnimationChoreographer::onAnimationFrame` → `backend->onAnimationFrame`
→ each registered `Callback` produces `AnimationMutations` (per-tag `AnimatedProps`)
→ the backend writes them into `AnimatedPropsRegistry`.

**`AnimatedPropsRegistry`** (`AnimatedPropsRegistry.h`) holds per-surface pending
snapshots: `update(surfaceUpdates)`, `getMap(surfaceId)`,
`clear`/`clearOnSurfaceStop`. Snapshot = `PropsSnapshot { BaseViewProps props;
unordered_set<PropName> propNames; unique_ptr<folly::dynamic> rawProps; }`.

**`AnimationBackendCommitHook`** (`AnimationBackendCommitHook.{h,cpp}`) is a
`UIManagerCommitHook`. On `shadowTreeWillCommit` (only for
`ShadowTreeCommitSource::React` / `AnimationEndSync`), it reads the registry map
for the surface and, if non-empty, `cloneMultiple`s the affected families —
cloning props via the component descriptor and applying each animated
`PropName` with `updateProp(...)`. That is: **animation writes props directly
into the shadow tree at commit time, natively, without a JS round-trip.**

**`AnimatedProps` / the animatable prop set** (`AnimatedProps.h`): an
`enum PropName` (lines 15–68) enumerates every animatable prop, and
`cloneProp(BaseViewProps&, AnimatedPropBase&)` (lines 100–426) is the giant
`switch` that writes a typed value onto `BaseViewProps`. Notable members for us:

- `OPACITY`, `TRANSFORM`, `TRANSFORM_ORIGIN`
- `BACKGROUND_COLOR` (→ `viewProps.backgroundColor = get<SharedColor>()`)
- `FILTER` (→ `viewProps.filter = get<std::vector<FilterFunction>>()`)
- `BOX_SHADOW`, `SHADOW_*`, `OUTLINE_*`, `BORDER_*`, `MIX_BLEND_MODE`
- all yoga layout props (`WIDTH`, `HEIGHT`, `MARGIN`, `PADDING`, `FLEX*`, …)

**Gap that matters for our engine:** there is **no `PropName` for
`experimental_backgroundImage` / background-position / background-size** — i.e.
the C++ backend, like Reanimated CSS today, **cannot animate a gradient prop
directly.** `BACKGROUND_COLOR` and `FILTER` *are* animatable. There is also a
`rawProps` escape hatch on `AnimatedProps`/`PropsSnapshot` (a `folly::dynamic`
applied via `cloneProps(..., RawProps(...))` in the commit hook) that could, in
principle, carry an arbitrary prop like `experimental_backgroundImage` — worth
prototyping, but unverified whether gradient interpolation is meaningful.

### 3d. How our engine could later register CSS-prop animations

Once the flags are on, the v2 engine could, instead of (or in addition to)
Reanimated:

1. Resolve `animate-*` / transition classes to a native animation descriptor
   (target `Tag`/family + interpolated `AnimatedProps` over time).
2. Register a `Callback` via `AnimationBackend::start` that, each
   `onAnimationFrame(timestamp)`, emits `AnimationMutation{ tag, family, props }`
   with the interpolated `AnimatedProps` (e.g. `TRANSFORM` for the gradient
   sweep, `FILTER` for filter animations, `BACKGROUND_COLOR` for color tweens).
3. Let the commit hook fold those into the shadow tree — no Reanimated, no JS
   thread, fully native.

For the gradient specifically: until a background-image `PropName` (or a proven
`rawProps` path) exists, the **translate-based sweep from §2 remains the
mechanism even on the C++ backend** — just driven via a `TRANSFORM`
`AnimatedProp` instead of a Reanimated CSS keyframe. Color-only gradient tweens
could ride `BACKGROUND_COLOR` / a two-layer cross-fade.

### 3e. View Transitions (FUTURE) — CSS transitions

Gated by `viewTransitionEnabled()` (`Scheduler.cpp` 162–166; `UIManager.cpp`
721). Backed by `ViewTransitionModule` and, on the mounting side,
`node_modules/react-native/ReactCommon/react/renderer/animated/internal/AnimatedMountingOverrideDelegate.{h,cpp}`
(a `MountingOverrideDelegate` that overrides mount transactions to interleave
animation frames). This is the native analogue of CSS `transition:` between two
view states and is the eventual home for our `transition-*` utilities (today
those set `isAnimated` and go through Reanimated's transition support). **FUTURE
— off by default, not wired into our engine yet.**

---

## 4. Steps + forward note + open questions

### 4a. Ordered steps — the "Reanimated now" path (implement against this)

1. **Compile.** `REANIMATED_CSS` (`packages/nitro-css/src/compiler/reanimated.ts`)
   is appended before Tailwind compiles: emits `entering-*`/`exiting-*`/`layout-*`
   → `--reanimated-*` custom props, config utilities, and `@keyframes` +
   `animate-*` CSS animations.
2. **Fold.** `foldAnimation` (`.../parsers/animations.ts`) turns the `animation`
   shorthand + `extractKeyframes` into discrete `animation*` props with an inline
   `animationName` keyframes object. `--reanimated-*` props are left in the
   bucket.
3. **Resolve.** `resolveStylesUncached` (`store.ts`) accumulates `--reanimated-*`
   into `reanimatedVars`, sets `isAnimated` on any reanimated var / `transition*`
   / `animationName`, and rebuilds `entering`/`exiting`/`layout` via
   `buildEnteringAnimation` / `buildExitingAnimation` / `buildLayoutAnimation`
   (`core/reanimated.ts`).
4. **Swap.** `View.tsx`: `resolved.isAnimated` → `getAnimatedView()` →
   `Animated.View`, passing `entering`/`exiting`/`layout` and letting
   `animationName` (in `resolved.styles`) drive native CSS animations.
   `getAnimatedComponent` is `WeakMap`-cached per host.
5. **Gradient sweep.** Compile gradient to native `experimental_backgroundImage`
   (`foldGradient`); animate an oversized child layer with a `translate`
   `@keyframes` (`animate-gradient-shift`), clipped by an `overflow-hidden`
   parent — because `experimental_background*` is `false` in Reanimated's config.
6. **Stability fix.** Memoize/`ref` the animation objects (`entering`/`exiting`/
   `layout` + `animationName`) by animation identity so a theme recompute
   (`snapshot` change) does not restart running animations (§2c).
7. **Bug fix.** Add a `%` branch so `parseTransformString` preserves percent
   translates as strings (§2d).

### 4b. Forward-looking note — C++ backend adoption

When `cxxNativeAnimatedEnabled` + `useSharedAnimatedBackend` are on by default,
add a native path parallel to Reanimated: resolve `animate-*`/transition classes
to `AnimatedProps` producers registered via `AnimationBackend::start`, driven by
`AnimationChoreographer::onAnimationFrame`, folded into the tree by
`AnimationBackendCommitHook`. Prefer `TRANSFORM`/`BACKGROUND_COLOR`/`FILTER`
`PropName`s (all present); keep the translate-sweep trick for gradients until a
background-image `PropName` exists. Adopt `viewTransitionEnabled` +
`AnimatedMountingOverrideDelegate` for native CSS transitions. Keep Reanimated as
the JS-thread path for entering/exiting/layout (RN's backend targets prop
animation, not layout-animation builders).

### 4c. Open questions

1. **Gradient interpolation natively.** Can the `rawProps`/`folly::dynamic`
   escape hatch on `AnimatedProps` carry `experimental_backgroundImage`, and does
   RN interpolate gradient strings at all? (No `PropName` exists — likely still
   translate-based even on the C++ backend.)
2. **Theme-stable memoization boundary.** Best layer to memoize animation objects
   — in `View.tsx` refs, in `store.ts` keyed on animation-substring, or a
   dedicated animation cache? Need a cheap, correct "animation identity" key
   derived from `className`.
3. **`animationName` restart semantics.** Does replacing the enclosing `styles`
   object (new identity, same keyframes) restart a running Reanimated CSS
   animation? Confirm empirically to size the §2c fix.
4. **Percent translate support end-to-end.** After the §2d fix, does RN's
   transform array accept `{ translateX: "-18%" }` on both platforms for the
   gradient layer, and does it interpolate correctly inside `@keyframes`?
5. **Flag availability timeline.** When do `cxxNativeAnimatedEnabled` /
   `useSharedAnimatedBackend` / `viewTransitionEnabled` become default-on in the
   RN versions we target? Gates all of §3.
6. **Reanimated ↔ C++ backend coexistence.** If both drive the same node
   (Reanimated entering + native transform), do they conflict at commit time?

STATUS: DONE
