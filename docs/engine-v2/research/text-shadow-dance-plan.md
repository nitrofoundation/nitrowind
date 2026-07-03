# NitroCSS Visual Effects and Rich Text Roadmap

Date: 2026-07-03

## Summary

This note replaces the older text-shadow-only research with one unified NitroCSS
plan covering:

- gradient-border patterns
- `background-image` and related image fill/repeat/position behavior
- `text-shadow` effects
- inline `<b>` / `<strong>` and `<br />` inside NitroCSS `Text`
- native `clip-path`

Locked product direction:

- Web keeps literal CSS for advanced effects like layered gradient borders,
  multi-shadow text, and broad `clip-path`.
- Native NitroCSS should add first-class support only where React Native can
  carry it performantly.
- The web `.btn-gradient-2` border technique remains the preferred browser
  answer for gradient borders.
- Native `clip-path` must be supported without `react-native-svg`.

## Current Verdicts

### 1. Gradient border

For browser CSS, this remains the best default pattern:

```css
.btn-gradient-2 {
  background:
    linear-gradient(white, white) padding-box,
    linear-gradient(to right, darkblue, darkorchid) border-box;
  border-radius: 50em;
  border: 4px solid transparent;
}
```

Why this stays the preferred web solution:

- it is valid CSS
- it is widely understood by browsers
- it avoids extra wrapper DOM in the simple case
- it is usually better than pseudo-element workarounds for a basic pill button

Native verdict:

- do not try to map this directly to React Native style props yet
- treat it as a composition pattern on native, not as immediate multi-layer
  background parity

### 2. `background-image`

Web verdict:

- keep browser CSS untouched
- allow standard `url(...)`, gradients, local assets, repeat rules, and sizing

Native verdict:

- the current compiler behavior that skips CSS `background-image` URLs on native
  is correct for now
- future native support should be implemented as NitroCSS-managed composition,
  not as a thin pass-through to raw RN style props

### 3. `text-shadow`

Web verdict:

- multi-layer `text-shadow` is valid CSS
- hard-edged shadow dance is acceptable for isolated decorative text
- blurred neon glow is materially more paint-heavy and should stay limited to a
  small number of hero elements

Native verdict:

- exact multi-shadow parity is not a good first milestone
- native support should begin with full single-layer `text-shadow`
- richer effects should prefer layered text composition and `transform` /
  `opacity` driven animation

### 4. Inline `<b>` / `<strong>` and `<br />` inside NitroCSS `Text`

Cross-platform verdict:

- support literal JSX `<b>` and `<strong>` children inside NitroCSS `Text`
- support literal JSX `<br />` children inside NitroCSS `Text`
- implement this by rewriting them to nested text with `fontWeight: "700"`
- implement `<br />` as an inline hard line break in the rendered text flow
- do not treat this as HTML-string parsing support

### 5. `clip-path`

Web verdict:

- keep literal CSS `clip-path`

Native verdict:

- NitroCSS should support native `clip-path` without `react-native-svg`
- the public CSS-facing ambition can be broad
- the internal native implementation must be selective and performance-aware

## Public Surface and Behavior

The roadmap should add or plan these CSS-facing capabilities:

- `clip-path`
- `clip-rule`
- `background-image`
- `background-size`
- `background-repeat`
- `background-position`
- inline JSX `<b>` / `<strong>` / `<br />` support inside NitroCSS `Text`
- phased native `text-shadow` support

Locked behavior choices:

- Native `clip-path` should target these syntax families:
  `polygon()`, `inset()`, `circle()`, `ellipse()`, and `path()`.
- Native `clip-path` milestone 1 includes animation support, but only for
  compatible shape pairs. If the shape family or point/segment arity differs,
  NitroCSS should step between keyframes instead of interpolating.
- Native `clip-path` milestone 1 target hosts are `View`, `Image`,
  `ImageBackground`, and NitroCSS `Text`.
- Nested inline text runs inside another `Text` are not part of native
  `clip-path` milestone 1.
- `<b>`, `<strong>`, and `<br />` support means JSX-child normalization only,
  not HTML parsing.

## Implementation Plan

### 1. Unified `clip-path` architecture

- Add a compiler parser that lowers `clip-path` and `clip-rule` into a
  normalized internal descriptor such as `--nitrocss-clip-path`.
- Normalize all supported shape functions into one canonical path or segment
  representation so static rendering and animation share the same payload.
- Keep web output literal so browser CSS owns web rendering directly.

### 2. Native `clip-path` delivery

#### iOS

- Use native mask-path clipping on the target surface through Core Animation.
- Update the mask path when bounds or the resolved clip descriptor changes.

#### Android

- Do not rely on `View.setClipToOutline()` as the primary design.
- It can be used as an internal fast path only for round-rect or
  circle-compatible cases.
- Arbitrary polygon and path clipping needs NitroCSS-owned native clip-capable
  hosts.

#### Host strategy

- Introduce native clip-capable NitroCSS hosts for:
  - container views
  - image surfaces
  - text surfaces
- JS NitroCSS wrappers should switch to these hosts only when the resolved style
  carries a clip-path descriptor.
- Non-clipped nodes should continue using the existing hosts.

#### Animation strategy

- Static clip descriptors should flow through the engine similarly to extracted
  visual effects.
- Animated clip-path should not depend on per-frame React renders.
- Animated clip-path should not depend on per-frame ShadowTree style commits.
- Use a native or UI-thread-driven path update channel for compatible shape
  interpolation.

### 3. Native `background-image` plan

- Keep the current native skip in place until dedicated support is added.
- Implement native `background-image` as NitroCSS-managed composition.

Milestone 1 scope:

- one raster image layer per host
- remote `url(https://...)`
- local asset URLs resolved by the NitroCSS build pipeline into
  Metro-compatible asset references
- `background-size` support for fill, contain, cover, and stretch behavior
- `background-repeat` support for `repeat`, `repeat-x`, `repeat-y`, and
  `no-repeat`
- `background-position` support for keywords, percentages, and pixel offsets

Explicit non-goal for milestone 1:

- full multi-background parity with browser CSS

Gradient-border implication:

- keep the layered gradient-border button pattern web-first
- on native, document a recommended composed surface pattern instead of
  promising immediate multi-background emulation

### 4. Native `text-shadow` and decorative text effects

#### Phase 1

- Support full static single-layer `text-shadow` lowering to:
  - `textShadowColor`
  - `textShadowOffset`
  - `textShadowRadius`
- Support keyframe animation lowering for the single-layer form.

#### Phase 2

- Recommend composition-based decorative effects for cross-platform output.
- For shadow dance:
  - layer duplicated text nodes
  - animate `transform` and `opacity`
- For neon glow:
  - layer foreground text plus glow layers
  - keep the glow mostly static per layer
  - animate emphasis via `opacity` and small `transform` shifts

#### Phase 3

- Consider a native multi-shadow renderer only if exact CSS parity becomes
  important enough to justify the added cost.

### 5. Inline rich text inside NitroCSS `Text`

- Update NitroCSS `Text` so JSX children containing `<b>` or `<strong>` are
  rewritten to nested Nitro or RN text with `fontWeight: "700"`.
- Rewrite literal JSX `<br />` children to explicit line breaks in the native
  and web text flow.
- Preserve surrounding inline text flow.
- Unsupported lowercase tags inside NitroCSS `Text` should flatten safely and
  dev-warn on native rather than crashing.
- Do not parse HTML strings in this feature.

## Structure for the Work

The implementation should be staged in this order:

1. Compiler and descriptor layer
2. Native host capability layer
3. JS wrapper routing
4. Animation path for compatible effects
5. Docs and examples

Detailed structure:

### Stage 1 — Compiler and normalization

- add parser coverage for `clip-path`, `clip-rule`, and image-background props
- normalize values into stable internal descriptors
- keep browser CSS output literal on web

### Stage 2 — Native host surfaces

- add native clip-capable host surfaces for the clipped cases
- keep existing hosts for non-clipped cases
- define image-background host composition for native raster backgrounds

### Stage 3 — JS wrapper routing

- detect extracted descriptors in resolved native styles
- switch only the affected nodes to the specialized native host path
- avoid changing the non-effect path unnecessarily

### Stage 4 — Animation delivery

- lower compatible single-layer text-shadow animation
- add native-compatible clip-path interpolation path for matching shapes
- use transform and opacity composition for heavier decorative text effects

### Stage 5 — Documentation and examples

- document web-first exact CSS patterns
- document native composition patterns
- add examples for gradient borders, image backgrounds, single-shadow text,
  shadow dance, neon glow, inline bold text, and clip-path

## Prioritized Roadmap

### Tier 1

- native static and compatible animated `clip-path`
- native single-image `background-image`
- inline `<b>` / `<strong>` / `<br />`
- animated single-layer `text-shadow`

### Tier 2

- higher-level composition helpers for gradient borders, neon glow, and
  shadow-dance effects
- richer background-image combinations
- broader inline text styling aliases

### Tier 3

- native multi-background composition
- native multi-shadow text renderer
- deeper `mask-image` and advanced clip-source support

## Test Plan

- parser coverage for `clip-path` grammar:
  - `polygon`
  - `inset`
  - `circle`
  - `ellipse`
  - `path`
  - `clip-rule`
- parser coverage for `background-image`, `background-size`,
  `background-repeat`, and `background-position`
- native shape interpolation tests:
  - matching polygons interpolate
  - mismatched families step
  - mismatched point counts step
- Android host-selection tests:
  - unclipped components keep existing hosts
  - clipped components switch to clip-capable hosts
- iOS and Android rendering cases for clipped:
  - `View`
  - `Image`
  - `ImageBackground`
  - standalone `Text`
- `background-image` resolution tests for:
  - remote URLs
  - local asset references
  - repeat behavior
  - size behavior
  - position behavior
- `text-shadow` tests for:
  - static single-layer parsing
  - native prop lowering
  - keyframe animation lowering
- `Text` child-normalization tests for:
  - `<Text>Hi <b>Bold</b></Text>`
  - `<Text>Hi <strong>Bold</strong></Text>`
  - `<Text>Hi<br />There</Text>`
  - `<Text>Hi <b>Bold</b><br />There</Text>`
  - unsupported lowercase tags flatten safely

## Assumptions and Defaults

- This file is the single active combined note for these topics.
- Older overlapping research notes should be treated as superseded.
- Native `clip-path` is intentionally not SVG-backed.
- Native `clip-path` animation in milestone 1 is limited to shape-compatible
  interpolation.
- NitroCSS `Text` clip-path support in milestone 1 means standalone text hosts,
  not arbitrary nested inline spans inside another native text run.
- The implementation docs should explicitly call out Android `clipPath(Path)`
  cost and iOS mask-path cost so performance guidance is written down.
