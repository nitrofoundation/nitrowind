# Android Gradient Rendering — RN 0.86 internals + our own Nitro HybridView gradient renderer

Research worker output for **engine-v2**. Read-only survey of `node_modules/react-native`
(RN **0.86.0**) + our packages, plus a concrete, implementation-ready design for a
gradient view that the engine owns end-to-end (no dependency on
`experimental_backgroundImage`).

Environment facts confirmed in this repo:

- `react-native` = **0.86.0**
- `react-native-nitro-modules` = **0.35.10** (ships Nitro **HybridView** support on both platforms)
- `nitrogen` = **0.35.9**
- Our Nitro package lives at `packages/nitrocss` with `packages/nitrocss/nitro.json`
  (`cxxNamespace: ["nitrowind"]`, `androidNamespace: ["nitrowind"]`,
  `androidCxxLibName: "Nitrowind"`, iOS module `Nitrowind`).

Throughout, "the engine" = our Nitro package (`packages/nitrocss`), "the gradient
view" = the new HybridView we are adding. Names are illustrative and rename-agnostic.

---

## 1. How RN 0.86 renders gradients on Android

RN 0.86 renders CSS gradients as **background image layers** painted by a `Drawable`,
not as a standalone view. The relevant code all lives under
`node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/`.

Key files:

| Concern | Path |
|---|---|
| Gradient interface (→ `android.graphics.Shader`) | `.../uimanager/style/Gradient.kt` |
| Linear gradient math + shader | `.../uimanager/style/LinearGradient.kt` |
| Radial gradient math + shader | `.../uimanager/style/RadialGradient.kt` |
| Color-stop fix-up (CSS Images L4) | `.../uimanager/style/ColorStop.kt` |
| One background layer wrapper | `.../uimanager/style/BackgroundImageLayer.kt` |
| Drawable that paints layers + clips corners | `.../uimanager/drawable/BackgroundImageDrawable.kt` |
| Composite of bg/border/shadow drawables | `.../uimanager/drawable/CompositeBackgroundDrawable.kt` |

### 1.1 The `Gradient` abstraction

Everything reduces to a single method that produces an `android.graphics.Shader`
sized to the paint area (`.../style/Gradient.kt`):

```kotlin
internal interface Gradient {
  fun getShader(width: Float, height: Float): Shader
}
```

`BackgroundImageLayer` (`.../style/BackgroundImageLayer.kt`) parses a JS gradient map
into either a `LinearGradient` or `RadialGradient` and just forwards:

```kotlin
public fun getShader(width: Float, height: Float): Shader = gradient.getShader(width, height)
```

So **our whole job on Android is: descriptor → `Shader`, then paint a rect with that
shader, clipped to the rounded-corner path.** RN does exactly this; we replicate it in
a view we control.

### 1.2 Linear gradient: angle → shader endpoints

`.../style/LinearGradient.kt`, `getShader()` (lines 130–161). The pipeline is:

1. Resolve direction to an angle in **CSS degrees** (`0 = to top`, `90 = to right`,
   `180 = to bottom`, `270 = to left`). Keyword directions
   (`to top right`, etc.) are converted to an angle via `getAngleForKeyword()`
   using `atan(width/height)` (lines 165–179).
2. `endPointsFromAngle(angle, height, width)` (lines 184–223) computes the CSS
   "gradient line" start/end points **in pixels**, following the Blink/Chromium
   algorithm (comment cites `css_gradient_value.cc`). Cardinal angles are special-cased:

   ```kotlin
   when (adjustedAngle) {
     0.0   -> Pair(floatArrayOf(0f, height), floatArrayOf(0f, 0f))     // bottom → top
     90.0  -> Pair(floatArrayOf(0f, 0f),     floatArrayOf(width, 0f))  // left → right
     180.0 -> Pair(floatArrayOf(0f, 0f),     floatArrayOf(0f, height)) // top → bottom
     270.0 -> Pair(floatArrayOf(width, 0f),  floatArrayOf(0f, 0f))     // right → left
   }
   ```

   For arbitrary angles it uses the gradient-line/perpendicular-slope construction:

   ```kotlin
   val slope = tan(Math.toRadians((90 - adjustedAngle))).toFloat()
   val perpendicularSlope = -1 / slope
   // endCorner picked per quadrant (half-width/half-height signs)
   val c   = endCorner[1] - perpendicularSlope * endCorner[0]
   val endX = c / (slope - perpendicularSlope)
   val endY = perpendicularSlope * endX + c
   val secondPoint = floatArrayOf(halfWidth + endX, halfHeight - endY)
   val firstPoint  = floatArrayOf(halfWidth - endX, halfHeight + endY)
   ```

3. Gradient-line length = `sqrt(dx*dx + dy*dy)`, then color stops are resolved to
   `[colors[], positions[]]` via `ColorStopUtils.getFixedColorStops(...)`.
4. The Android shader is built with `Shader.TileMode.CLAMP`:

   ```kotlin
   AndroidLinearGradient(
       startPoint[0], startPoint[1], endPoint[0], endPoint[1],
       colors, positions, Shader.TileMode.CLAMP)
   ```

   (`import android.graphics.LinearGradient as AndroidLinearGradient`.)

**Load-bearing takeaway:** RN's angle convention is **CSS**, not the Android/Canvas
convention. `endPointsFromAngle` is the exact math to reuse if we want CSS parity.
If instead we accept a raw `angle(deg)` measured clockwise-from-top and want a simpler
mapping, we must document our own convention (see Open Questions §4).

### 1.3 Radial gradient: center, radius, ellipse

`.../style/RadialGradient.kt`, `getShader()` (lines 213–268):

1. Resolve center `(centerX, centerY)` from `position` (`top/left/right/bottom`,
   point or percent; `dpToPx()` for point values) — defaults to the view center.
2. `calculateRadius()` (lines 382–423) resolves `radiusX/radiusY` from either sizing
   keywords (`closest-side`/`farthest-side`/`closest-corner`/`farthest-corner`,
   lines 270–380) or explicit `Dimensions`.
3. Build a circular shader at `max(radiusX, 0.00001f)`:

   ```kotlin
   val shader = AndroidRadialGradient(centerX, centerY, radius, colors, positions, Shader.TileMode.CLAMP)
   ```

4. For a non-circle ellipse (`radiusX != radiusY`), squash the circle via a local
   matrix (lines 261–265):

   ```kotlin
   val matrix = Matrix()
   matrix.setScale(1f, radiusY / radiusX, centerX, centerY)
   shader.setLocalMatrix(matrix)
   ```

**Takeaway:** Android has no native elliptical radial gradient — RN fakes it by
scaling a circular `RadialGradient` about the center. We must do the same for ellipse
support.

### 1.4 Color-stop fix-up (shared by both)

`.../style/ColorStop.kt` (`object ColorStopUtils`, lines 53–246) implements the
CSS Images Level 4 color-stop algorithm: default first=0%/last=100%, monotonic
clamping, even spacing of unpositioned stops, and **transition hints** (a bare
position with no color) expanded into 9 interpolated stops via `ColorUtils.blendARGB`
(mirrors Blink). Positions are normalized to `0..1` (`resolveColorStopPosition`,
lines 231–245). `RadialGradient` passes `max(radiusX, radiusY)` as the gradient-line
length; `LinearGradient` passes the geometric line length.

For engine-v2 we likely accept **already-normalized `locations[0..1]`** from JS
(computed by our compiler), so we can pass `colors[]`/`positions[]` straight to the
Android constructor and **skip most of this fix-up**. Keep `ColorStop.kt` as the
reference implementation if we later want raw CSS-string parity or hint support.

### 1.5 Compositing with border-radius clipping

`.../drawable/BackgroundImageDrawable.kt` is the piece that actually paints and how
corner clipping composes with the shader.

- One `Paint(ANTI_ALIAS_FLAG){ style = FILL }` (line 81). Its shader is swapped per
  layer: `backgroundPaint.setShader(layer.getShader(tileWidth, tileHeight))` (line 159).
- `updatePath()` (lines 289–339) builds the clip:
  - positioning area = padding-box (`bounds` inset by border insets),
  - painting area = border-box (`RectF(bounds)`),
  - if `borderRadius.hasRoundedBorders()`, a `Path.addRoundRect(paintingArea,
    floatArrayOf(tlX, tlY, trX, trY, brX, brY, blX, blY), CW)` with **per-corner
    horizontal+vertical radii** (elliptical corners), else a plain rect.
- `draw()` (lines 113–267): `canvas.save()` → `canvas.clipPath(clipPath)` → paint each
  layer's rect (with tiling/repeat handling we can ignore for a single gradient) →
  `canvas.restore()`.

So RN clips the **canvas** to a rounded-rect `Path`, then fills a rect with the shader
paint. There are two viable ways for us to reproduce rounded corners (see §2.3):
canvas `clipPath` (matches RN exactly, supports per-corner elliptical radii, needs a
software/no-outline path) **or** `View.setClipToOutline(true)` + `ViewOutlineProvider`
(hardware-clean but only supports a single uniform radius via
`Outline.setRoundRect`).

`.../drawable/CompositeBackgroundDrawable.kt` shows the z-order RN uses: base color →
**background image (gradient)** → borders → shadows are layered in a `LayerDrawable`.
For a standalone gradient view we don't need this composite; our single view just
paints the gradient and clips.

---

## 2. Engine design: a Nitro HybridView gradient renderer

### 2.1 Why HybridView (and what the deleted nitrolist view was)

The deleted `packages/nitrolist` Android view was a **classic Fabric/Paper
`SimpleViewManager`**, not Nitro. For reference (retrieved via
`git show eb77045:...`):

- `NitroRecyclerListViewManager.kt` — `SimpleViewManager<NitroRecyclerListView>()`,
  `getName() = "NitroListView"`, `@ReactProp`-annotated setters
  (`setHandle`, `setContentInsetBottom`, ...), and
  `getExportedCustomDirectEventTypeConstants()` for events.
- `NitroRecyclerListView.kt` — a `FrameLayout` subclass holding a `RecyclerView`,
  emitting events via `RCTEventEmitter`.
- Gradle wiring (`git show eb77045:packages/nitrolist/android/build.gradle`) was a
  plain `com.android.library` + `com.facebook.react:react-android` +
  `androidx.recyclerview`. **No CMake, no Nitro autolinking** — different mechanism
  from what our `packages/nitrocss` uses today.

We should **not** copy that ViewManager pattern. Our repo already uses **Nitro
HybridObjects** with generated autolinking, and `react-native-nitro-modules@0.35.10`
ships first-class **HybridView** support:

- `node_modules/react-native-nitro-modules/android/src/main/java/com/margelo/nitro/views/HybridView.kt`
- `node_modules/react-native-nitro-modules/ios/views/HybridView.swift`
- JS host component factory `getHostComponent` + `callback()` wrapper
  (`node_modules/react-native-nitro-modules/lib/typescript/views/getHostComponent.d.ts`,
  `.../views/HybridView.d.ts`).

The Kotlin base class (from `HybridView.kt`) is exactly what our gradient view extends:

```kotlin
abstract class HybridView : HybridObject() {
  abstract val view: View                 // the Android View we draw into
  open fun beforeUpdate() {}              // start of a prop batch
  open fun afterUpdate()  {}              // end of a prop batch — rebuild shader here
  open fun onDropView()   {}              // unmount cleanup
}
```

This matches nitrogen's existing wiring in `packages/nitrocss` (`nitro.json`
`autolinking` map, `android/CMakeLists.txt` including
`Nitrowind+autolinking.cmake`, `android/build.gradle` applying
`nitrowind+autolinking.gradle`), so a HybridView drops into the existing build with
no new native module plumbing.

### 2.2 The descriptor (JS spec → native props)

Add a Nitro **view** spec alongside the existing specs in
`packages/nitrocss/src/specs/` (e.g. `GradientView.nitro.ts`). It declares the
descriptor the compiler emits. Illustrative shape (rename-agnostic):

```ts
import type { HybridView, HybridViewProps } from "react-native-nitro-modules";

type GradientType = "linear" | "radial";

interface GradientViewProps extends HybridViewProps {
  gradientType: GradientType;   // "linear" | "radial"
  angle: number;                // degrees (define convention! see §4)
  // radial center as fractions 0..1 of width/height (default 0.5, 0.5)
  positionX?: number;
  positionY?: number;
  colors: number[];             // packed ARGB ints (process hex → int in JS/native)
  locations: number[];          // 0..1, same length as colors (already fixed-up)
  // per-corner radii in dp: [tl, tr, br, bl]; single value ok if uniform
  borderRadius: number[];
}

export type GradientView = HybridView<GradientViewProps>;
```

Notes:
- Prefer passing **packed ARGB ints** (`colors: number[]`) so native does zero hex
  parsing; if we pass hex strings instead, parse with `android.graphics.Color.parseColor`
  in Kotlin (as the old nitrolist view imported `android.graphics.Color`).
- `locations` should be pre-normalized `0..1` by our compiler (the JS side already owns
  color-stop resolution), letting Android skip `ColorStopUtils`.
- Register the view in `packages/nitrocss/nitro.json` `autolinking` with a
  `kotlin`/`swift` entry (view HybridObjects are declared the same way modules are).

### 2.3 The Android view: `HybridGradientView.kt`

Create `packages/nitrocss/android/src/main/java/com/nitrofoundation/nitrocss/HybridGradientView.kt`
(nitrogen will generate an abstract spec `HybridGradientViewSpec` in
`packages/nitrocss/nitrogen/generated/android/...` that this class extends). It holds a
custom `android.view.View` and paints a shader in `onDraw`.

Skeleton (implementation-ready; maps descriptor → `Shader`, mirrors RN's math from §1):

```kotlin
package com.nitrowind

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient as AndroidLinearGradient
import android.graphics.Matrix
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient as AndroidRadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import android.view.ViewOutlineProvider
import kotlin.math.max
import kotlin.math.sqrt
import kotlin.math.tan

class GradientDrawView(context: Context) : View(context) {
  var gradientType: String = "linear"
  var angleDeg: Double = 0.0            // CSS degrees; see §4 for convention
  var centerX: Float = 0.5f            // fraction of width  (radial)
  var centerY: Float = 0.5f            // fraction of height (radial)
  var colors: IntArray = IntArray(0)  // packed ARGB
  var locations: FloatArray = FloatArray(0)
  var cornerRadiiDp: FloatArray = floatArrayOf(0f, 0f, 0f, 0f) // tl,tr,br,bl

  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val clipPath = Path()
  private var dirtyShader = true

  fun markDirty() { dirtyShader = true; invalidate(); invalidateOutline() }

  private fun buildShader(w: Float, h: Float): Shader? {
    if (colors.size < 2) return null
    val pos = if (locations.size == colors.size) locations else null
    return if (gradientType == "radial") {
      val cx = centerX * w
      val cy = centerY * h
      val radius = max(sqrt(w * w + h * h) / 2f, 0.00001f) // farthest-corner-ish default
      AndroidRadialGradient(cx, cy, radius, colors, pos, Shader.TileMode.CLAMP)
      // for ellipse: setLocalMatrix(Matrix().apply { setScale(1f, ry/rx, cx, cy) })
    } else {
      val (sx, sy, ex, ey) = endpointsForAngle(angleDeg, w, h) // reuse RN §1.2 math
      AndroidLinearGradient(sx, sy, ex, ey, colors, pos, Shader.TileMode.CLAMP)
    }
  }

  override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
    super.onSizeChanged(w, h, ow, oh)
    dirtyShader = true
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat(); val h = height.toFloat()
    if (w <= 0f || h <= 0f) return
    if (dirtyShader) { paint.shader = buildShader(w, h); dirtyShader = false }
    canvas.drawRect(0f, 0f, w, h, paint)   // corner clipping via outline (below)
  }
}
```

Rounded corners — two options (see §1.5):

- **Uniform radius (recommended default):** `clipToOutline = true` + a
  `ViewOutlineProvider` calling `outline.setRoundRect(0, 0, width, height, radiusPx)`.
  Hardware-clipped, antialiased on API 33+, cheap. Limitation: a single uniform radius.
  This is the "clipToOutline + ViewOutlineProvider" path named in the task.
- **Per-corner / elliptical radii (full parity with RN):** in `onDraw`, build a `Path`
  with `addRoundRect(RectF(0,0,w,h), floatArrayOf(tlX,tlY,trX,trY,brX,brY,blX,blY), CW)`
  and `canvas.clipPath(path)` before `drawRect` — exactly what
  `BackgroundImageDrawable.updatePath()` does. `clipPath` isn't hardware-accelerated
  the way `clipToOutline` is, but it supports the full 8-value per-corner elliptical
  radius set.

Recommendation: default to `clipToOutline` (uniform), and fall back to `clipPath`
when the descriptor carries non-uniform corner radii.

### 2.4 The HybridView wrapper

`packages/nitrocss/android/src/main/java/com/nitrofoundation/nitrocss/HybridGradientView.kt` (the
Nitro class) extends the nitrogen-generated `HybridGradientViewSpec`, owns a
`GradientDrawView`, and forwards props to it, rebuilding the shader in `afterUpdate()`
so a whole prop batch triggers a single `invalidate()`:

```kotlin
class HybridGradientView(context: Context) : HybridGradientViewSpec() {
  private val gradientView = GradientDrawView(context)
  override val view: View get() = gradientView

  // nitrogen generates prop setters on the spec; assign into gradientView here.
  // e.g. override var colors: DoubleArray  -> gradientView.colors = it.map { c -> c.toInt() }.toIntArray()

  override fun afterUpdate() { gradientView.markDirty() }
  override fun onDropView() { gradientView.paint.shader = null }
}
```

(iOS analog: `HybridGradientView.swift` extends the generated Swift spec, `view` is a
`UIView` whose backing `CAGradientLayer`/custom `draw(_:)` paints the shader; corner
radius via `layer.cornerRadius` + `maskedCorners`, or a `CAShapeLayer` mask for
per-corner. Not the focus here but keep the descriptor identical.)

### 2.5 JS host component

Consumers get a React component via Nitro's `getHostComponent` (see
`node_modules/react-native-nitro-modules/lib/typescript/views/getHostComponent.d.ts`).
The engine's compiler emits `<GradientHostComponent gradientType=... angle=...
colors=... locations=... borderRadius=... />` in place of `experimental_backgroundImage`.
Any callbacks (e.g. `onLayout`-style) must be wrapped with `callback(...)` per Nitro's
"callbacks have to be wrapped" rule.

---

## 3. Ordered build steps

1. **Spec.** Add `packages/nitrocss/src/specs/GradientView.nitro.ts` declaring
   `GradientView = HybridView<GradientViewProps>` (§2.2). Export it from
   `packages/nitrocss/src/specs/index.ts`.
2. **Register autolinking.** Add an entry to `packages/nitrocss/nitro.json` under
   `autolinking` for the gradient view with `{ "kotlin": "HybridGradientView",
   "swift": "HybridGradientView" }` (mirroring the existing `NativePlatform` entry).
3. **Codegen.** Run nitrogen (the package's existing `nitrogen`/build script) to
   regenerate `packages/nitrocss/nitrogen/generated/**` — this produces
   `HybridGradientViewSpec` (Kotlin + Swift), updates
   `Nitrowind+autolinking.cmake` and `nitrowind+autolinking.gradle`, and the JS glue.
   **No manual edits to generated files.**
4. **Android view.** Add `GradientDrawView` + `HybridGradientView.kt` under
   `packages/nitrocss/android/src/main/java/com/nitrofoundation/nitrocss/` (§2.3–2.4). Reuse RN's
   `endPointsFromAngle` (LinearGradient.kt lines 184–223) and the ellipse
   `setLocalMatrix` trick (RadialGradient.kt lines 261–265) for parity.
5. **Build wiring — already in place, verify only.**
   - `packages/nitrocss/android/build.gradle` already applies
     `../nitrogen/generated/android/nitrowind+autolinking.gradle` when present and
     depends on `project(":react-native-nitro-modules")`. Pure-Kotlin view needs no
     CMake change; if the shader math moves to C++ later, the existing
     `android/CMakeLists.txt` `GLOB_RECURSE` over `../cpp` and `src/main/cpp` and the
     `include(.../Nitrowind+autolinking.cmake)` already cover it.
   - No new Gradle deps required (no RecyclerView, unlike the old nitrolist view).
6. **iOS view.** Add `HybridGradientView.swift` under `packages/nitrocss/ios/`;
   `Nitrowind.podspec` already globs `ios/**/*.{h,m,mm,swift}` so no podspec edit.
7. **JS host component + compiler emit.** Create the host component with
   `getHostComponent` and switch the compiler/runtime path that currently emits
   `experimental_backgroundImage` to emit our descriptor instead. (Search the engine's
   `src/compiler/` and `src/components/` for the gradient/background-image emit site.)
8. **Example + verify.** Wire a gradient into `nitrowind-example` and visually confirm
   angle, radial center, per-corner radius, and RTL behavior.

---

## 4. Open questions / risks

1. **Angle convention (highest risk).** RN uses **CSS degrees** (`0 = to top`,
   clockwise). If our descriptor's `angle` means something else (e.g. Android canvas
   0 = +x axis, or degrees clockwise-from-top), the gradient direction will be wrong.
   Decision needed: either (a) reuse RN's exact `endPointsFromAngle` and declare our
   `angle` = CSS degrees, or (b) define our own and document the conversion. Cardinal
   angles (0/90/180/270) are special-cased in RN and should be matched to avoid
   off-by-a-few-pixels seams.
2. **Radial position + size semantics.** RN resolves center from
   `top/left/right/bottom` (point or percent) and size from keywords
   (`closest-side`…`farthest-corner`) or explicit dimensions. Our simplified
   `positionX/positionY` fractions + implicit `farthest-corner` radius will **not** match
   CSS `radial-gradient(... at ...)` for non-center positions or keyword sizes. Decide how
   much CSS radial fidelity engine-v2 needs; port `calculateRadius`/`radiusToCorner`
   (RadialGradient.kt lines 270–423) if we need parity.
3. **Ellipse.** Android has no native elliptical radial gradient. Must replicate RN's
   `Matrix.setScale(1f, ry/rx, cx, cy)` + `shader.setLocalMatrix(...)`. Getting `rx/ry`
   right depends on resolving keyword sizes correctly (ties into #2).
4. **Per-corner vs uniform radius.** `clipToOutline` + `ViewOutlineProvider` only does a
   single uniform radius (`Outline.setRoundRect`). Per-corner / elliptical corners need
   the `canvas.clipPath(Path.addRoundRect(..., 8 floats))` path (RN's approach), which
   is not hardware-clipped. Need a policy: outline for uniform, clipPath fallback for
   non-uniform. Also confirm antialiasing quality at corners on our min API (24).
5. **RTL.** RN's `BackgroundImageDrawable` resolves border insets/radii with
   `layoutDirection` (`computeBorderInsets`, `borderRadius.resolve(layoutDirection, …)`),
   so logical corners (start/end) flip under RTL. Our descriptor should carry *physical*
   `[tl, tr, br, bl]` already resolved by the JS layer, **or** we must plumb
   `layoutDirection` into the view and flip. Linear-gradient angle is typically physical
   and unaffected, but confirm whether the engine wants logical/`to inline-start`-style
   directions to flip under RTL.
6. **Color format & premultiplication.** Passing packed ARGB ints avoids per-frame hex
   parsing and matches `AndroidLinearGradient`/`AndroidRadialGradient` expectations. If we
   pass hex strings, use `Color.parseColor`; verify alpha handling matches iOS.
7. **Invalidation batching.** Rebuild the shader once per prop batch in `afterUpdate()`
   (Nitro batches props), not on every individual setter, and on `onSizeChanged`. Guard
   against zero-size (`w/h <= 0`) exactly as RN does (`hasInvalidDimensions`,
   `max(radius, 0.00001f)`).
8. **Reference implementation only, not a dependency.** RN's gradient classes are
   `internal` to `com.facebook.react.uimanager.style` — we cannot call them directly and
   must **port** the math into our package. Pin to the RN 0.86 sources cited above and
   re-verify on RN upgrades.

STATUS: DONE
