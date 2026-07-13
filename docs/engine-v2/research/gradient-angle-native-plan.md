# Gradient Angle Animation — Web Research and NitroCSS Native Plan

Date: 2026-07-03

## Summary

Goal: support true animated gradient angle in NitroCSS native without changing
the authored className or forcing the current workaround of translating or
rotating an oversized child view.

Verdict:

- On the web, the clean modern implementation is a typed custom property such
  as `--gradient-angle`, registered with `@property` using `syntax: "<angle>"`,
  and then referenced inside `linear-gradient(var(--gradient-angle), ...)`.
- In NitroCSS native, the best first implementation is **not** to replace the
  existing gradient renderer. Keep the current static descriptor and native
  applier, then add an **animated angle override path** keyed by the view tag.
- The first native milestone should target **linear gradients only**.
- The first native milestone should support **the existing gradient utility
  pipeline**, not a full arbitrary `background-image: linear-gradient(...)`
  parser.

## How the web does it

### Browser model

Relevant browser facts:

- `background-image` accepts one or more images, including gradients.
- `linear-gradient()` accepts an angle or a direction keyword.
- `linear-gradient()` produces a `<gradient>`, which is a kind of `<image>`.
- Modern browsers now support `@property` broadly enough that a custom property
  can be registered as an `<angle>` and smoothly interpolated.

The clean browser pattern is:

```css
@property --gradient-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 144deg;
}

.card {
  --gradient-angle: 144deg;
  background-image: linear-gradient(
    var(--gradient-angle),
    var(--color-primary),
    var(--color-danger)
  );
  animation: gradient-angle-spin 6s linear infinite;
}

@keyframes gradient-angle-spin {
  to {
    --gradient-angle: 504deg;
  }
}
```

Why this is the right web pattern:

- the browser interpolates a typed angle, not an untyped token string
- authoring stays declarative
- the element itself keeps the same layout box
- it models "animate the gradient angle" directly instead of faking the effect
  by moving the whole layer

### Web fallback pattern

The older fallback is still valid when `@property` support is unavailable or
when the effect can be approximated:

- animate `background-position` on an oversized gradient
- or rotate / translate an oversized gradient layer

That is the same workaround NitroCSS uses today in the example app.

## NitroCSS current state

### What works today

NitroCSS already has a native gradient pipeline:

- the compiler lowers gradient utilities into `--nw-gradient-*` marker props
- the gradient fold emits one native descriptor under `--nitrocss-gradient`
- the C++ engine registers `tag -> descriptor`
- the iOS and Android native appliers paint the gradient on the view itself

The current descriptor already carries a numeric linear `angle`:

- `gradientType`
- `angle`
- `positionX`
- `positionY`
- `colors`
- `locations`

That means static gradient direction is already a first-class native value.

### What does not work today

The current animated gradient example does **not** animate the gradient angle
itself. It animates a large child view with `transform`, and the gradient rides
along with that moving view.

Why:

- NitroCSS's current CSS animation path is built around Reanimated's CSS engine
  and native animatable style props
- the current gradient descriptor is a static extracted effect, not a per-frame
  animatable prop
- the repo's current example explicitly documents that RN cannot animate
  `background-position`, so it uses transform instead
- the compiler currently ignores `@property`
- the native gradient parser is utility-driven today and does not yet support a
  fully generic authored `background-image: linear-gradient(...)` path on native

## Recommended native design

### Core decision

Do **not** replace the current static gradient renderer.

Instead:

1. Keep the current `--nitrocss-gradient` descriptor and native appliers for
   static painting and theme updates.
2. Add an optional **angle override channel** for animated linear gradients.
3. Feed that override from the existing animation stack instead of inventing a
   second animation scheduler.

This is the best fit for the current engine because:

- static gradients already work well
- theme and color-scheme changes already update natively
- we only need to animate one scalar: the linear angle
- we avoid turning every gradient into a separate gradient host view

### Native milestone 1 scope

Support:

- linear gradients only
- angle animation only
- one animated angle source per view
- existing utility-generated gradients that resolve through
  `--tw-gradient-position` / `--tw-gradient-*`
- CSS `@keyframes` animation timing through the current NitroCSS animation path

Do not support in milestone 1:

- radial gradient geometry animation
- conic gradients
- generic arbitrary native parsing of any authored
  `background-image: linear-gradient(...)`
- multi-layer gradient animation
- gradient stop animation
- parsing and enforcing `@property` semantics on native

### Authoring contract

Web authoring should keep the modern browser pattern with `@property`.

Native v1 should support the NitroCSS gradient pipeline when the authored CSS
ultimately compiles to:

- a linear gradient descriptor
- a gradient position backed by an angle-like custom property or keyframe track

Important decision:

- native v1 should **infer** an animatable gradient-angle track from gradient
  usage plus keyframe values
- native v1 should **not require** explicit `@property` parsing support

Reason:

- browsers need `@property` for typed interpolation
- NitroCSS native already owns the type system for the gradient descriptor
- adding full `@property` parsing now would widen scope without helping the
  native renderer paint the gradient

## Implementation plan

### 1. Compiler: preserve gradient-angle intent

Extend the gradient pipeline so a gradient position that resolves to an angle
variable is not treated as an unparseable string that falls back to `180deg`.

Add a helper that can classify a gradient position as one of:

- static direction keyword
- static degree angle
- animated angle variable reference
- unsupported for angle animation

Recommended representation:

- keep `--nitrocss-gradient` exactly as the static base descriptor
- add a second extracted marker, for example
  `--nitrocss-gradient-angle-source`

Suggested shape:

```ts
interface GradientAngleSource {
  type: "linear-angle-var";
  varName: string;
  fallbackAngle: number;
}
```

Compiler behavior:

- if the gradient position is a plain keyword or degree, keep current behavior
- if the gradient position is a `var(--x)` that resolves to an angle, emit the
  base descriptor using the current resolved angle and also emit the angle
  source marker
- if the gradient is radial or otherwise unsupported, emit only the static
  descriptor

### 2. Keyframes: extract angle-variable frames

Extend keyframe extraction so NitroCSS can recognize animated custom properties
whose values are angles.

Add a second extracted marker, for example:

```ts
interface GradientAngleTrack {
  varName: string;
  keyframes: Record<string, number>;
}
```

Key rules:

- only accept values that parse as angles
- normalize all values into degrees in `[0, 360)` for painting
- keep the original animation timing metadata from the current folded animation
  shorthand
- only build a gradient-angle track when the animated custom property matches a
  gradient angle source used by the same resolved class

This should stay additive:

- existing `animationName` output remains in place
- the new track is extra metadata consumed by NitroCSS runtime

### 3. Runtime: match gradient + track on the same node

At resolve time, NitroCSS should detect this combination:

- static `--nitrocss-gradient` descriptor
- `--nitrocss-gradient-angle-source`
- compatible keyframe metadata for the same variable

If all three exist, the node becomes a native animated-gradient target.

Recommended runtime output:

- keep the static descriptor for normal native paint and theme updates
- store one runtime-only angle animation payload associated with the view tag

### 4. Native bridge: add angle override registry

Add a small native side-channel parallel to the existing gradient descriptor
registry.

Suggested model:

- static registry: `tag -> GradientDescriptor`
- animated override registry: `tag -> currentAngle`

Paint rule:

- if an override exists for a tag, use it instead of the descriptor's base angle
- otherwise use the descriptor's base angle

Why this is the preferred architecture:

- theme updates can still refresh colors and stops through the existing static
  descriptor path
- animation only mutates one scalar value
- the native appliers already know how to repaint a gradient from angle, colors,
  and locations
- we avoid rerendering the React tree and avoid replacing the current renderer

### 5. Animation driver: reuse the existing animation system

Do not build a new engine-local frame scheduler in milestone 1.

Instead:

- keep Reanimated / NitroCSS CSS animation timing as the animation source
- build an internal adapter that maps the resolved angle keyframes to a native
  angle stream
- write that stream into the angle override registry keyed by the node tag

Important constraint:

- this should run off the React render path
- unmount must clear the angle override for the tag
- when the animation stops or the class changes, the view should fall back to
  the static descriptor angle

### 6. Native painters

No major painter redesign should be needed.

iOS and Android work should be limited to:

- reading the optional animated angle override
- repainting with the override instead of the base descriptor angle
- keeping the existing color and stop handling intact

This is why milestone 1 should be linear-only:

- the current descriptor already models linear angle as one scalar
- radial animation would need more geometry state than one simple override

## Recommended implementation order

1. Compiler classification for gradient angle source
2. Keyframe angle-track extraction
3. JS/runtime matching logic on a resolved node
4. Native angle override registry
5. iOS and Android painter refresh path
6. Examples and docs

## Test plan

### Compiler tests

- static keyword direction still folds correctly
- static degree angle still folds correctly
- `var(--gradient-angle)` used as linear position emits a base descriptor and an
  angle source marker
- unsupported positions do not emit animation metadata

### Keyframe tests

- angle-valued custom-property keyframes are normalized to degrees
- non-angle keyframe values are rejected for gradient-angle animation
- unrelated custom-property animations do not produce gradient-angle tracks

### Runtime tests

- matching gradient source + keyframe track enables animated-gradient handling
- missing track falls back to static gradient
- missing source falls back to static gradient
- class changes clear stale angle animation metadata

### Native tests

- static descriptor paints unchanged when no override exists
- override angle repaints the same gradient with a different sweep direction
- clearing the override restores the base descriptor angle
- theme-driven color updates still work while an angle override is active

### Example tests

- add one example that visually rotates the gradient angle on the same view
  without translating an oversized child layer
- keep the current transform-based example as a fallback/perf reference

## Example authoring target

Browser-facing target:

```css
@property --gradient-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 144deg;
}

@keyframes gradient-angle-spin {
  to {
    --gradient-angle: 504deg;
  }
}
```

NitroCSS implementation target:

- web keeps the exact authored CSS behavior
- native lowers the same author intent into:
  - one static gradient descriptor
  - one optional angle animation track
  - one native angle override stream

## Open decisions already chosen for v1

- Use the existing static gradient renderer, not a replacement host component.
- Reuse the current animation stack instead of building a second animation
  scheduler.
- Support linear gradients only in the first milestone.
- Infer native angle animation from gradient usage and angle keyframes instead
  of requiring full `@property` parsing support.
- Keep direct generic `background-image: linear-gradient(...)` native parsing out
  of scope for this milestone.

## Sources

Primary sources used for the web/browser side:

- [MDN: `@property`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40property)
- [MDN: `background-image`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-image)
- [MDN: `linear-gradient()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/gradient/linear-gradient)
- [W3C CSS Images Module Level 4](https://www.w3.org/TR/css-images-4/)
- [web.dev: `@property` baseline](https://web.dev/blog/at-property-baseline)

Repo sources used for the NitroCSS side:

- [packages/nitrocss/src/compiler/parsers/gradient.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrocss/src/compiler/parsers/gradient.ts)
- [packages/nitrocss/src/compiler/parsers/animations.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrocss/src/compiler/parsers/animations.ts)
- [packages/nitrocss/src/compiler/parseStyles.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrocss/src/compiler/parseStyles.ts)
- [packages/nitrocss/src/compiler/__tests__/gradient.test.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrocss/src/compiler/__tests__/gradient.test.ts)
- [apps/example/app/gradients.tsx](/Users/ashwithsaldanha/MyWork/nitrowind/apps/example/app/gradients.tsx)
- [apps/example/global.css](/Users/ashwithsaldanha/MyWork/nitrowind/apps/example/global.css)
