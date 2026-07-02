# Lynx: Native `background-image` / gradients / `filter` rendering & CSS value handling

Research notes on how ByteDance's **Lynx** engine parses and paints CSS backgrounds,
gradients, and filters **natively** on iOS and Android, and what its CSS value pipeline
looks like. Written to inform our own self-contained styling engine over React Native's
Fabric shadow tree (own gradient HybridView + own C++ CSS value parser incl. `oklch`).

All claims below are cited to concrete paths in `lynx-family/lynx` (branch `develop`, read
via the GitHub API) or to `lynxjs.org`. Where something is inferred rather than read
directly from source it is marked **(inferred)**. This doc is rename-agnostic: file/symbol
names are current as of the read but the *patterns* are what matter.

---

## 0. TL;DR / mental model

Lynx has a **single, shared, native C++ CSS engine** (`core/renderer/css/`) that runs off the
main/UI thread. CSS text is tokenized and parsed there into typed `CSSValue` objects. For
backgrounds/gradients/filters, the C++ engine does **not draw** — it parses the CSS into a
compact **numeric array** (`lepus::CArray`: angle, packed-`uint32` colors, stop percentages,
shape/size enums, positions) and ships that array across the boundary to the **per-platform
paint code**, which builds native gradient primitives:

- **iOS**: CoreGraphics (`CGGradient` + `CGContextDraw{Linear,Radial,Conic}Gradient`) rasterized
  async into a `UIImage` set as `CALayer.contents`, **or** a real `CAGradientLayer` for the
  linear fast-path. Filters use the **private `CAFilter`** API on `CALayer.filters`.
- **Android**: `android.graphics.{LinearGradient,RadialGradient}` `Shader` on a `Paint`,
  drawn to the view's `Canvas`. Blur filter uses `View.setRenderEffect` (API 31+, via
  reflection).

Colors are packed to `0xAARRGGBB` `uint32` early. **Lynx's CSS color parser does NOT support
modern color spaces** — no `oklch`/`oklab`/`lab`/`lch`/`color()`/`color-mix`/`hwb`. This is the
single biggest divergence from what we are building.

---

## 1. The CSS / style engine

### 1.1 It is its own native C++ parser (two generations)

Lynx ships a full CSS engine in C++ under `core/renderer/css/`. There are effectively **two
parser lineages** living side-by-side:

- **Legacy / "handler" parser** — `core/renderer/css/parser/` contains one `*_handler.cc` per
  CSS property (e.g. `color_handler.cc`, `length_handler.cc`, `background_image_handler.cc`,
  `filter_handler.cc`, `background_shorthand_handler.cc`, …). Each handler validates the input
  and delegates the actual string scanning to a hand-written recursive-descent scanner,
  `core/renderer/css/parser/css_string_parser.cc` (~4,450 lines). The dir's design notes
  (`core/renderer/css/parser/AGENTS.md`) state: *"per-property or shorthand handlers that
  convert CSS text into typed style values … Put property-specific parsing rules in the
  relevant `*_handler.*` file and keep shared scanner/token utilities generic."*
- **NG parser** — `core/renderer/css/ng/parser/` is a newer, Blink/WebKit-derived tokenizer:
  `css_tokenizer.cc`, `css_parser_token{,_range,_stream}.cc`, `css_parser_idioms.cc`,
  `string_to_number.cc`, plus `ng/selector/css_selector_parser.cc` and `ng/parser/
  media_query_parser.cc`, `supports_condition_parser.cc`, `font_face_parser.cc`. Its
  `AGENTS.md` scopes it to *"tokenization, token streams, parser idioms, number parsing"* and
  warns tokenizer changes are *"broad-impact."* (inferred: selectors/at-rules/`@media`/
  `@supports`/`@font-face` route through NG, while value-level property parsing still largely
  goes through the legacy handler + `CSSStringParser` path used by backgrounds/gradients/
  filters.)

So: **yes, Lynx has its own from-scratch native CSS parser**, not a wrapper over a browser
engine. Coverage is high because the engine is shared across all platforms
(lynxjs.org describes the rendering core, incl. the CSS engine, as reused across platforms).

### 1.2 Colors (`core/renderer/css/css_color.cc`, and `CSSStringParser::Color()`)

Two color entry points, both packing into a `uint32` ARGB:

- `CSSColor::Parse` (`css_color.cc`) — string form. Handles:
  - Hex: `#rgb` (4-char), `#rgba` (5-char, expanded `#aabbccdd`), `#rrggbb` (7), `#rrggbbaa` (9).
  - Functional: `rgb()/rgba()`, `hsl()/hsla()` (HSL→RGB via `CreateFromHSLA`/`css_hue_to_rgb`).
  - **147 named colors** as a static table (`CreateFromKeyword`), indexed by an interned
    keyword token type.
- `CSSStringParser::Color()` (`css_string_parser.cc:2044`) — tokenizer form used inside
  gradient/shadow/text parsing. Dispatches on token type `RGBA/RGB/HSLA/HSL/HEX/<ident>`.
  Its `ParseRGBLikeColor` supports **CSS Color Level 4** syntax: both legacy comma form
  `rgb(r, g, b, a)` **and** modern space-separated `rgb(r g b / a)` with the `none` keyword and
  percentage channels (`css_string_parser.cc:2074-2148`).

**Not supported (confirmed absent — grepped the whole `css_string_parser.cc` and `css_color.cc`):**
`oklch`, `oklab`, `lab`, `lch`, `color()`, `color-mix`, `hwb`, relative-color syntax. Lynx is
sRGB-8-bit only. Every color collapses to `uint32` `0xAARRGGBB` via `CSSColor::Cast()`
(`css_color.cc:332`) before it ever reaches the platform. **This is the key gap vs. our engine.**

### 1.3 Lengths

`length_handler.cc` / `font_length_handler.cc` parse lengths into a `CSSValue` carrying a
`{CSSValuePattern, value}` pair (patterns include `PX`, `PERCENT`, `REM`, `RPX`, `NUMBER`, …
seen used throughout `css_string_parser.cc`, e.g. `CSSValue(50.f, CSSValuePattern::PERCENT)`).
Percentages/relative units are **not resolved at parse time**; they are resolved later against a
`CssMeasureContext` that carries screen width, layout-unit/px ratios, root + current font size,
font scale, and viewport size (see the ctor call in `core/renderer/css/android/
css_gradient_utils.cc:52-58`). This keeps parsed values layout-independent and cacheable.

### 1.4 Computed styles → native UI

- `computed_css_style.cc` (+ `computed_css_style_css_text_helper.cc`) produces the resolved
  computed style; `css_variable_handler.cc` resolves `var()` custom properties;
  `css_style_sheet_manager` + `css_fragment` hold parsed rule sets.
- Resolved props are packaged into a **`PropBundle`** (Android: a `MapBuffer` — see
  `PropBundleAndroid::AssembleMapBuffer` in `css_gradient_utils.cc:65`) and handed to the
  platform UI layer, which applies them to native views/`CALayer`s. So computed style lives in
  C++; only a flat prop bundle crosses to the platform. (inferred from the MapBuffer assembly +
  the platform `Background*Layer(ReadableArray)` constructors that consume it.)

---

## 2. Gradients

### 2.1 Parse → numeric array (shared C++)

`background-image` (and `mask-image`) route through `background_image_handler.cc` →
`CSSStringParser::ParseBackgroundImage()` → `CSSStringParser::Gradient()`
(`css_string_parser.cc:1375`), which dispatches on token
`LINEAR_GRADIENT` / `RADIAL_GRADIENT` / `CONIC_GRADIENT`. Each builds a nested `lepus::CArray`:

- **Linear** (`css_string_parser.cc:1387-1513`): `[angleDeg, colors[], stops[], directionEnum]`.
  Direction handles `<angle>`, `to <side>`/`to <corner>` (mapped to both an enum **and** an
  equivalent angle, e.g. `to top left` → 315°), and shorthand tokens `TOTOP/TOLEFT/...`.
  Colors are packed `uint32`; stops are normalized to **percent 0–100** (`ColorStopList`,
  `:1719`; bare numbers ×100 at `:1746`). Missing stops are back-filled by interpolation.
- **Radial** (`:1515-1627`): `[[shapeEnum, sizeEnum, posXtype, posX, posYtype, posY, (lenX...) ],
  colors[], stops[]]`. Supports `circle`/`ellipse`, keyword sizes
  `farthest/closest-corner/side`, explicit lengths, and `at <position>`. Validity rules mirror
  CSS (circle = 0/1 length, ellipse = 0/2 lengths).
- **Conic** (`:1629-1687`): `[fromAngleDeg, [centerX..., centerY...], colors[], stops[]]`.

The **same parser** feeds text-color gradients too (`ParseTextColorTo` accepts
`Color() || LinearGradient() || RadialGradient()`, `:453`).

Keyword radial **radius** math (`farthest-corner`, etc.) lives in shared C++
(`starlight::GetRadialGradientRadius`), exposed to Android over JNI
(`core/renderer/css/android/css_gradient_utils.cc:29`, `GetRadialRadius`) and re-implemented on
iOS in `LynxGradientUtils`.

### 2.2 iOS painting — two paths

**Path A — CoreGraphics rasterization (`platform/darwin/ios/lynx/base/LynxGradient.m`).**
`LynxLinearGradient/LynxRadialGradient/LynxConicGradient` build a `CGGradientRef`
(`CGGradientCreateWithColors`, positions in 0–1) and draw with:

- Linear: `CGContextDrawLinearGradient(ctx, g, start, end, DrawsBefore|DrawsAfter)`
  (`LynxGradient.m:169`). Start/end points come from `computeStartPoint:andEndPoint:withSize:`
  which projects the CSS angle onto the box (the standard "gradient line" endpoint math,
  `:81-146`; identical algorithm mirrored in Android, §2.3).
- Radial: `CGContextDrawRadialGradient` (`:264`). **Ellipse is faked from a circle** by a CTM
  trick — translate to center, `CGContextScaleCTM(ctx, 1, 1/aspectRatio)`, draw circular
  gradient, restore (`:257-269`). Radius from `LynxGradientUtils getRadialRadius` or explicit
  length (`:220-241`).
- Conic: `CGContextDrawConicGradient` (iOS 12+, guarded) (`:365`).
- **Border-radius clipping**: every `draw:withPath:` does `CGContextAddPath(ctx, path)` +
  `CGContextClip(ctx)` then draws into the bounding rect (`:175-180, 273-278, 372-377`). The
  rounded-rect path is the element's background box.

This rasterization runs **asynchronously off the main thread**: `LynxBackgroundManager
getBackgroundImageAsync:` deep-copies size/border-radius/border-width/color (thread-safe),
calls `LynxGetBackgroundImage(...)` in a block, and hands the resulting `UIImage` back via
`displayComplexBackgroundAsynchronouslyWithDisplay:completion:`
(`LynxBackgroundManager.m:1044-1067`). The image becomes `CALayer.contents`.

**Path B — real `CAGradientLayer` fast-path
(`platform/darwin/ios/lynx/base/background/LynxBackgroundLinearGradientDrawable.mm`).**
For linear gradients this uses an actual `CAGradientLayer` (`type = kCAGradientLayerAxial`,
`startPoint`/`endPoint`), so the GPU composites it with **no rasterization**. The interesting
bit: `CAGradientLayer` internally normalizes the box to a **unit square**, which **distorts the
angle** of a diagonal gradient. Lynx corrects this with a ~130-line geometry routine
`fixPoints()` (`.mm:17-166`): it takes the true start/end, computes the **perpendicular
bisector** (the iso-color line), normalizes to the square, re-derives the bisector there, scales
back, and intersects with lines through the original endpoints to get corrected unit-square
start/end. Takeaway: **if you use a platform "0..1 gradient layer" you must pre-correct
endpoints for non-square boxes**, or diagonal angles will be wrong.

### 2.3 Android painting (`platform/android/.../ui/background/Background*GradientLayer.java`)

- `BackgroundGradientLayer` (base) holds a `Shader` + a `Paint(ANTI_ALIAS_FLAG)`. `draw(Canvas)`
  sets `paint.setShader(shader)` and calls `canvas.drawPath(pathEffect, paint)` when there is a
  rounded-rect clip path (border-radius), else `canvas.drawRect(bounds, paint)`
  (`BackgroundGradientLayer.java:50-62`). Colors are `int` ARGB, stops `/100f` → 0..1
  (`:64-81`).
- `BackgroundLinearGradientLayer.setBounds()` computes start/end from the direction enum / angle
  (the **same** endpoint math as iOS, `:52-155`) and builds
  `new LinearGradient(sx, sy, ex, ey, colors, positions, TileMode.CLAMP)` (`:144`).
  - **Legacy fallback**: on `SDK_INT < P (28)` with a flag, it hand-rasterizes a **1-px-tall
    `BitmapShader`** by interpolating colors per pixel (`fillPixels`/`createBitmapShader`,
    `:189-261`) and rotates it with a `Matrix` — a workaround for old `LinearGradient`
    multi-stop bugs.
- `BackgroundRadialGradientLayer.setBounds()` builds `new RadialGradient(cx, cy, max(rx,1),
  colors, positions, CLAMP)` and, for ellipses, applies a **local `Matrix.preScale(1,
  1/aspectRatio, cx, cy)`** on the shader (`:103-109`) — the direct analogue of iOS's CTM
  trick. Radius from `GradientUtils.getRadius(...)` (→ JNI → shared C++) or explicit length
  (`:82-92`). Center resolves keyword/percentage/px position types (`calculateValue`, `:124`).
- Conic uses `BackgroundConicGradientLayer` (present; `android.graphics.SweepGradient` under the
  hood — inferred, not read).

### 2.4 Sizing / position / clip (both platforms)

- The gradient is sized to the element's **background paint box**, driven by
  `background-size`/`-position`/`-origin`/`-clip`/`-repeat`, each with its own handler
  (`background_size_handler.cc`, `background_position_handler.cc`, `background_box_handler.cc`,
  `background_clip_handler.cc`, `background_repeat_handler.cc`) and a matching platform class
  (`BackgroundSize/Position/Repeat.java`, `LynxBackgroundImageLayerInfo`). Multiple background
  layers are composited by `LayerManager`/`MaskLayerManager` (Android) and
  `LynxBackgroundManager` sublayers (iOS).
- **Border-radius clipping** is uniformly done by clipping to the rounded-rect **path** of the
  paint box before drawing the shader/gradient (iOS `CGContextClip`, Android `canvas.drawPath`).

### 2.5 A third, self-contained renderer: "clay"

The repo also contains **`clay/`**, a Flutter/Skia-style self-rendering engine with its own
`clay/ui/painter/gradient.cc` + `gradient_factory.cc`, and a compositor layer tree
(`clay/flow/layers/{backdrop_filter,color_filter,image_filter}_layer.cc`,
`clay/gfx/style/{image_filter,color_filter,mask_filter}.cc`,
`clay/gfx/geometry/filter_operations.cc`). This is a **separate paint stack** from the
platform-native `Background*Layer` path above (which targets `UIKit`/`android.graphics`
directly). For our purposes the **platform-native path (§2.2–2.3) is the relevant model**; clay
is Lynx's optional own-pixels renderer. (inferred: clay is not the default RN-like path.)

---

## 3. Filters / effects

### 3.1 Parse

`filter` → `filter_handler.cc` → `CSSStringParser::ParseFilter()` → a `CSSValue` array of
`[typeEnum, amount]`. Supported function set is small (see platform enums): `grayscale`, `blur`,
`brightness`, `contrast`, `saturate`.

### 3.2 iOS — private `CAFilter` on `CALayer.filters`

`LynxUI.m`'s `LYNX_PROP_SETTER("filter", …)` (`:3640`) reads the parsed array, maps
`objectAtIndex:0` to a `LynxFilterType`, **clamps the amount per type** (grayscale 0–1,
brightness 0–2, contrast 0–3, saturate ≤3, blur raw), then calls
`LynxFilterUtil getFilterWithType:filterAmount:`.

`LynxFilterUtil+System.m` builds a filter via the **private/undocumented `CAFilter` API**:
`NSClassFromString(@"CAFilter")` → `+filterWithName:` with names
`gaussianBlur` (`inputRadius`), `colorSaturate`/`colorBrightness`/`colorContrast`
(`inputAmount`) (`ios_filter+system:12-51`). The filter is assigned to
`view.layer.filters` **and** to the background/border/outline sublayers
(`LynxBackgroundManager.m:1622-1625` `setFilters:`; `LynxUI.m:3670-3680`).

Caveats worth stealing/avoiding:
- **Only a single filter function** is honored (`objectAtIndex:0`), not a chained filter list.
- `CAFilter` is a **private API** — works but is App Store / OS-version risk. There is a
  no-op public fallback stub (`LynxFilterUtil.m` returns `nil`) so the category
  (`+System.m`) can be swapped out.

### 3.3 Android — `RenderEffect` blur (reflection, API 31+)

Blur is done via `platform/android/.../utils/BlurUtils.java`: it reflectively resolves
`RenderEffect.createBlurEffect(radiusX, radiusY, TileMode.CLAMP)` and
`View.setRenderEffect(...)` / `RenderNode.setRenderEffect(...)`, guarded by
`SDK_INT >= 31` (`BlurUtils.java:56-99, 130-172`). Reflection is used only because
`compileSdkVersion` predates 31 (explicit `fixme` comment). A CPU **stack-blur** exists for
bitmaps (`core/base/android/fresco_blur_filter.c`) — used for image blurring, not view filters.
(inferred: color-matrix filters like grayscale/saturate on Android go through a
`ColorMatrixColorFilter` on the paint; not read directly.)

### 3.4 `backdrop-filter`

Only appears inside the **clay** engine (`clay/flow/layers/backdrop_filter_layer.cc`); no
platform-native `backdrop-filter` path was found in the UIKit/android.graphics code. (inferred:
backdrop-filter is a clay-only capability, or unsupported on the native path.)

---

## 4. Rendering pipeline & threading

High-level flow for a styled element:

```
CSS text
  → [C++ engine, background thread]  tokenize (ng) + property handlers (legacy)
      → typed CSSValue  (colors=uint32, lengths={pattern,value}, gradients=nested numeric CArray)
  → cascade/inherit/var() resolution  (computed_css_style.cc, css_variable_handler.cc)
  → layout  (starlight layout engine; percentages resolved via CssMeasureContext)
  → PropBundle / MapBuffer  (flat, serialized)
  ──────────────────────── thread boundary ────────────────────────
  → [platform UI, main thread]  apply props to native view / CALayer
      → Background*GradientLayer / LynxGradient / CAGradientLayer / CAFilter / RenderEffect
      → (iOS) async off-main rasterization of complex backgrounds into UIImage → layer.contents
```

Key points:
- **Dual-threaded architecture.** lynxjs.org and ByteDance's "Unlock Native for More" post
  describe Lynx as multi-threaded with a lightweight JS engine (PrimJS); the CSS/style/layout
  engine runs off the UI thread and only a resolved prop bundle is applied on the main thread.
  (Style resolution = background/layout thread; view application = main thread — inferred from
  the MapBuffer hand-off + the platform constructors.)
- **CSS is parsed once**, up front, into reusable `CSSValue`/rule-set structures; it is not
  re-parsed per frame. Percentages/units stay symbolic until resolved against
  `CssMeasureContext`.
- **iOS defers heavy paint off-main**: gradients/images that need CoreGraphics rasterization are
  drawn on a background queue into a `UIImage` (`displayComplexBackgroundAsynchronously…`),
  keeping the main thread cheap; the linear `CAGradientLayer` fast-path avoids rasterization
  entirely.
- **Android** creates shaders lazily in `setBounds()` and paints during the view's normal
  `draw(Canvas)` pass (no separate raster thread for gradients).

---

## 5. Lessons for us (RN Fabric + own gradient HybridView + own C++ CSS parser w/ `oklch`)

Concrete borrow / avoid, mapped to decisions we're making:

### Borrow

1. **Parse-to-numeric-IR, paint-on-platform split.** Lynx's cleanest idea: the C++ parser emits
   a compact, flat numeric array (angle, packed colors, stop %, shape/size enums, positions) and
   the platform just *consumes* it. For us: have the C++ CSS value parser emit a stable
   gradient descriptor struct (POD / flatbuffer-ish) that the gradient HybridView renders. Keep
   **zero CSS-string parsing on the platform side.** Mirror their array schemas
   (`[angle, colors[], stops[], dir]` etc.) — they're battle-tested.
2. **Resolve stops to a normalized 0–1 (they use 0–100) at parse time, back-fill missing stops
   by interpolation, and clamp to monotonic ascending** (`ColorStopList` in C++;
   `LynxGradient.m:34` and Android `fillPixels` both re-clamp). Do the interpolation/monotonic
   fix **once in C++** so both platforms stay dumb.
3. **Ellipse = circle + axis scale.** Both platforms fake radial ellipses via a
   `1/aspectRatio` scale about the center (iOS CTM, Android shader `Matrix`). If our HybridView
   draws with a platform radial primitive, do the same instead of writing a true elliptical
   gradient sampler.
4. **Keep the CSS gradient-line angle math in shared code.** The `computeStartPoint` /
   endpoint-projection algorithm is identical on iOS and Android and matches the CSS spec.
   Compute start/end (or the corrected `CAGradientLayer` 0..1 points) in **one** place —
   ideally C++ — and hand platforms final points.
5. **The `CAGradientLayer` unit-square angle correction (`fixPoints`).** If our iOS HybridView
   uses `CAGradientLayer` for the linear fast-path (GPU-composited, no bitmap), we **must**
   port the perpendicular-bisector correction or diagonal gradients will be visibly wrong on
   non-square views. If instead we always rasterize with CoreGraphics, we skip this — but pay a
   raster cost. Lynx keeps *both* and picks per-case; consider the same tiered strategy.
6. **Rasterize complex backgrounds off the main thread** (iOS `displayComplexBackground
   Asynchronously…`). Our HybridView should paint gradients on a background queue into a
   layer/bitmap and swap on main, especially for radial/conic/multi-stop.
7. **Border-radius = clip to the rounded-rect path, then draw the shader.** Uniform, simple,
   correct. Don't try to bake corner radii into the gradient.
8. **Filter amount clamping per function lives at apply time** (`LynxUI.m:3651`). Keep the raw
   parsed value; clamp when mapping to the native primitive.
9. **Public-stub + swappable category for risky filter APIs** (`LynxFilterUtil.m` no-op +
   `+System.m` private-API impl). Lets you ship the private-API path but disable it centrally.
10. **Two-parser split is fine.** A modern token-stream parser for selectors/at-rules
    (their `ng/`) plus focused per-property value handlers (their `parser/*_handler`) is a sane
    structure; property handlers keep the fan-out of shorthands contained.

### Avoid / do better

1. **Their color model is a hard `uint32` sRGB dead-end — this is exactly what we must NOT
   copy.** `CSSColor::Cast()` packs to `0xAARRGGBB` immediately and there is **no `oklch`/
   `oklab`/`lab`/`lch`/`color()`/`color-mix`/`hwb`**. Our `oklch` support means we must carry a
   **wider color representation** (float RGBA, ideally with a color-space tag) all the way to the
   platform, and convert to `UIColor`/`int` **at the last moment**. Do gradient stop
   interpolation in a **perceptual space (OKLab)** where the author asked for it — Lynx's Android
   `mix()` (`BackgroundLinearGradientLayer.java:180`) and the bitmap fallback interpolate in
   **premultiplied-ish sRGB**, which is the thing `oklch` gradients exist to avoid. This is our
   differentiator; don't inherit their sRGB-only pipeline.
2. **Single-filter limitation.** Lynx honors only `filter`'s first function (`objectAtIndex:0`)
   and a tiny set (blur/grayscale/brightness/contrast/saturate). Design our filter IR as an
   **ordered list** of operations from the start.
3. **Reflection for `RenderEffect`** (Android `BlurUtils`) is a compile-target artifact; with a
   current `compileSdk` we can call it directly and add graceful <31 degradation.
4. **Private `CAFilter`** works but is a liability. Consider a Metal/CoreImage or
   `UIVisualEffectView`-based blur for anything we can't get from public `CALayer` APIs, and gate
   the private path behind a flag as they do.
5. **String-strip color parsing** (`css_color.cc` removes all whitespace then lowercases) is
   lossy and non-spec (it even notes "not compliant, but should just be more accepting"). Our
   token-based parser should be spec-accurate, especially for `/`-alpha and `none`.
6. **Two divergent implementations of the same math** (radial radius: shared C++ for Android via
   JNI, but re-implemented in ObjC `LynxGradientUtils` for iOS) invites drift. Put **all**
   gradient geometry in the shared C++ core and expose it to both platforms — don't
   re-implement per platform.

---

## Sources

Repo: `lynx-family/lynx` @ `develop` (read via GitHub API). Key paths:

- CSS engine / parser structure:
  - `core/renderer/css/parser/AGENTS.md`, `core/renderer/css/ng/parser/AGENTS.md`
  - `core/renderer/css/css_color.cc` (color parsing, named-color table, `Cast()`)
  - `core/renderer/css/parser/css_string_parser.cc` (`Color()`, `ParseRGBLikeColor`,
    `Gradient()`, `LinearGradient()`, `RadialGradient()`, `ConicGradient()`, `ColorStopList`)
  - `core/renderer/css/parser/background_image_handler.cc`, `filter_handler.cc`,
    `length_handler.cc`, `background_{size,position,box,clip,repeat,shorthand}_handler.cc`
  - `core/renderer/css/computed_css_style.cc`, `css_variable_handler.cc`
  - `core/renderer/css/android/css_gradient_utils.cc` (JNI `GetRadialRadius`,
    `GetGradientArray` → MapBuffer)
- iOS paint:
  - `platform/darwin/ios/lynx/base/LynxGradient.m` (CoreGraphics draw of linear/radial/conic)
  - `platform/darwin/ios/lynx/base/background/LynxBackgroundLinearGradientDrawable.mm`
    (`CAGradientLayer` fast-path + `fixPoints` angle correction)
  - `platform/darwin/ios/lynx/base/background/LynxBackgroundManager.m`
    (async background image, `setFilters:`)
  - `platform/darwin/ios/lynx/ui/LynxUI.m` (`filter` prop setter, clamping, apply to
    `layer.filters`)
  - `platform/darwin/ios/lynx/ui/LynxFilterUtil.m` (+ `LynxFilterUtil+System.m`, private
    `CAFilter`)
  - `platform/darwin/ios/lynx/utils/LynxGradientUtils.mm`
- Android paint:
  - `.../behavior/ui/background/BackgroundGradientLayer.java`,
    `BackgroundLinearGradientLayer.java` (+ BitmapShader fallback),
    `BackgroundRadialGradientLayer.java`, `BackgroundConicGradientLayer.java`,
    `LayerManager.java`, `BackgroundLayerDrawable.java`
  - `.../utils/GradientUtils.java`, `.../utils/BlurUtils.java` (`RenderEffect` via reflection)
  - `core/base/android/fresco_blur_filter.c` (CPU stack-blur for bitmaps)
- Self-contained "clay" renderer (alternative stack):
  - `clay/ui/painter/gradient.cc`, `gradient_factory.cc`;
    `clay/flow/layers/{backdrop_filter,color_filter,image_filter}_layer.cc`;
    `clay/gfx/style/{image_filter,color_filter,mask_filter}.cc`;
    `clay/gfx/geometry/filter_operations.cc`
- Docs / background:
  - https://lynxjs.org  ·  https://lynxjs.org/guide/ui/elements-components
  - https://lynxjs.org/blog/lynx-unlock-native-for-more (dual-thread architecture, PrimJS)
  - https://github.com/lynx-family/lynx  ·  https://github.com/lynx-family/primjs

STATUS: DONE
