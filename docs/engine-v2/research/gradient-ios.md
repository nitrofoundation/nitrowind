# iOS Gradient Rendering — engine-v2 research

Read-only research for the engine-v2 initiative. Two parts:

1. **How React Native 0.86 renders gradients on iOS** (the `experimental_backgroundImage` path we are deliberately *not* reusing).
2. **How the engine builds its own iOS gradient renderer** — a Nitro **HybridView** backed by a `UIView` + `CAGradientLayer`.

Environment as researched:

- `react-native` **0.86.0** (`node_modules/react-native/package.json`).
- `react-native-nitro-modules` / `nitrogen` **0.35.9** (`packages/nitrocss/package.json`). Nitro >= 0.34 exposes `HybridView` + `getHostComponent`, which is what the gradient view rides on.
- The native package that already ships a Nitro pipeline (nitro.json + podspec + nitrogen) is `packages/nitrocss`. File/dir names below reference it as it exists today; the project family will be renamed, so treat `Nitrowind`/`nitrowind` tokens as **the engine's module name** and rename them wholesale at implementation time. Design names below avoid the product name and say "the engine" / "the gradient view".

---

## Part 1 — RN 0.86's iOS gradient path

RN paints CSS `background-image` gradients (`linearGradient()` / `radialGradient()`, surfaced in JS as the experimental `experimental_backgroundImage` style prop) entirely with **`CALayer` sublayers on the Fabric view's own layer**. There is no separate native component — it is baked into `RCTViewComponentView`. The relevant files all live under `node_modules/react-native/React/Fabric/`.

### 1a. Layer creation in the view — `RCTViewComponentView.mm`

`node_modules/react-native/React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm`

Imports (lines ~18–24):

```objc
#import <React/RCTBackgroundImageUtils.h>
#import <React/RCTLinearGradient.h>
#import <React/RCTRadialGradient.h>
```

The view keeps a list of gradient sublayers so it can tear them down each update (line ~47):

```objc
NSMutableArray<CALayer *> *_backgroundImageLayers;
```

The core block runs inside `updateLayerProperties` (lines **1217–1277**). Abbreviated:

```objc
// background image
[self clearExistingBackgroundImageLayers];
if (!_props->backgroundImage.empty()) {
  const auto borderMetricsBI = _props->resolveBorderMetrics(_layoutMetrics);

  // background-origin: padding-box
  CGRect backgroundPositioningArea = RCTCGRectFromRect(_layoutMetrics.getPaddingFrame());
  // background-clip: border-box
  CGRect backgroundPaintingArea = self.layer.bounds;

  size_t imageIndex = _props->backgroundImage.size() - 1;
  // iterate in reverse to match CSS specification
  for (const auto &backgroundImage : std::ranges::reverse_view(_props->backgroundImage)) {
    // ...resolve per-image backgroundSize / backgroundPosition / backgroundRepeat...

    CGSize backgroundImageSize = [RCTBackgroundImageUtils calculateBackgroundImageSize:backgroundPositioningArea
                                                                     itemIntrinsicSize:backgroundPositioningArea.size
                                                                        backgroundSize:backgroundSize
                                                                      backgroundRepeat:backgroundRepeat];

    CALayer *gradientLayer;
    if (std::holds_alternative<LinearGradient>(backgroundImage)) {
      const auto &linearGradient = std::get<LinearGradient>(backgroundImage);
      gradientLayer = [RCTLinearGradient gradientLayerWithSize:backgroundImageSize gradient:linearGradient];
    } else if (std::holds_alternative<RadialGradient>(backgroundImage)) {
      const auto &radialGradient = std::get<RadialGradient>(backgroundImage);
      gradientLayer = [RCTRadialGradient gradientLayerWithSize:backgroundImageSize gradient:radialGradient];
    }

    if (gradientLayer != nil) {
      CALayer *backgroundImageLayer =
          [RCTBackgroundImageUtils createBackgroundImageLayerWithSize:backgroundPositioningArea
                                                         paintingArea:backgroundPaintingArea
                                                             itemSize:backgroundImageSize
                                                   backgroundPosition:backgroundPosition
                                                     backgroundRepeat:backgroundRepeat
                                                            itemLayer:gradientLayer];
      [self shapeLayerToMatchView:backgroundImageLayer borderMetrics:borderMetricsBI];
      backgroundImageLayer.masksToBounds = YES;
      backgroundImageLayer.zPosition = BACKGROUND_COLOR_ZPOSITION;
      [layer addSublayer:backgroundImageLayer];
      [_backgroundImageLayers addObject:backgroundImageLayer];
    }
    imageIndex--;
  }
}
```

Key takeaways for our own renderer:

- **The `CAGradientLayer` is built for a plain `CGSize`** (`backgroundImageSize`) by `RCTLinearGradient` / `RCTRadialGradient`. It is *not* wired to the view's bounds directly — it is wrapped by `RCTBackgroundImageUtils` for tiling/positioning and then re-framed.
- **Corner-radius clipping** is applied by `shapeLayerToMatchView:` **plus** `masksToBounds = YES` (lines 1268–1269).
- **Z-order**: the gradient sits at `BACKGROUND_COLOR_ZPOSITION` — i.e. behind children but above the solid background color layer.
- Multiple background images are iterated **in reverse** (last listed paints first / lowest) per the CSS spec, `imageIndex` decrementing so each image's size/position/repeat array entry is matched modulo array length.

**Corner-radius shaping** — `shapeLayerToMatchView:` (lines **1342–1358**):

```objc
- (void)shapeLayerToMatchView:(CALayer *)layer borderMetrics:(BorderMetrics)borderMetrics
{
  layer.frame = CGRectMake(0, 0, self.layer.bounds.size.width, self.layer.bounds.size.height);
  if (borderMetrics.borderRadii.isUniform()) {
    layer.mask = nil;
    layer.cornerRadius = borderMetrics.borderRadii.topLeft.horizontal;
    layer.cornerCurve = CornerCurveFromBorderCurve(borderMetrics.borderCurves.topLeft);
  } else {
    CAShapeLayer *maskLayer = [self
        createMaskLayer:self.bounds
           cornerInsets:RCTGetCornerInsets(RCTCornerRadiiFromBorderRadii(borderMetrics.borderRadii), UIEdgeInsetsZero)];
    layer.mask = maskLayer;
    layer.cornerRadius = 0;
  }
}
```

So RN's own rule is: **uniform radius → `layer.cornerRadius` (+`cornerCurve` for the iOS "continuous" curve); non-uniform (per-corner) radius → a `CAShapeLayer` mask built from a rounded-rect path** (`createMaskLayer:` at lines 1360–1367 calls `RCTPathCreateWithRoundedRect`). This is exactly the split our gradient view must reproduce.

Teardown — `clearExistingBackgroundImageLayers` (lines 1369–1379) lazily allocates the array and `removeFromSuperlayer`s every previous gradient layer before each rebuild. Our HybridView equivalent is simpler because there is exactly one gradient layer per view (we mutate it in place rather than rebuild).

### 1b. Size/position/tiling + corner shaping wrapper — `RCTBackgroundImageUtils.{h,mm}`

`node_modules/react-native/React/Fabric/Utils/RCTBackgroundImageUtils.h` declares two methods:

```objc
+ (CGSize)calculateBackgroundImageSize:(const CGRect &)positioningArea
                     itemIntrinsicSize:(CGSize)itemIntrinsicSize
                        backgroundSize:(const facebook::react::BackgroundSize &)backgroundSize
                      backgroundRepeat:(const facebook::react::BackgroundRepeat &)backgroundRepeat;

+ (CALayer *)createBackgroundImageLayerWithSize:(const CGRect &)positioningArea
                                   paintingArea:(const CGRect &)paintingArea
                                       itemSize:(const CGSize &)itemSize
                             backgroundPosition:(const facebook::react::BackgroundPosition &)backgroundPosition
                               backgroundRepeat:(const facebook::react::BackgroundRepeat &)backgroundRepeat
                                      itemLayer:(CALayer *)itemLayer;
```

In `.mm`:

- **`calculateBackgroundImageSize`** (lines 151–207) resolves CSS `background-size` (length or percentage of the positioning area) and applies the `round` repeat adjustment (snapping tile size so an integer number of tiles fits). For our engine the gradient always fills the view, so this whole computation collapses to "use the view's content size" — **we do not need `background-size`/`repeat` at all** in v1.
- **`createBackgroundImageLayerWithSize`** (lines 12–149) does CSS `background-position` offset math (`top/bottom/left/right` resolved against `positioningArea.size − itemSize`) and wraps the gradient layer in **`CAReplicatorLayer`s** for `repeat-x`/`repeat-y`/`space`/`round` tiling, then returns an outer container `CALayer` holding the tiled sublayer. The final `tiledLayer.frame` is set at line 143.

Because our descriptor has no repeat/tiling and the gradient fills the view, we can **skip `RCTBackgroundImageUtils` entirely** and put the `CAGradientLayer` straight on the view's layer, sizing it in `layoutSubviews`. That is the main simplification the engine's own renderer buys us.

### 1c. Linear direction/angle → CAGradientLayer — `RCTLinearGradient.{h,mm}`

`node_modules/react-native/React/Fabric/Utils/RCTLinearGradient.h`:

```objc
+ (CALayer *)gradientLayerWithSize:(CGSize)size gradient:(const facebook::react::LinearGradient &)gradient;
```

`.mm` (`gradientLayerWithSize:`, lines 20–63) is the map we mirror:

1. Direction is a `std::variant`: either a **`Float` angle in degrees** or a **`GradientKeyword`** (`to top right`, etc.). Keyword → angle via `getAngleForKeyword` (lines 115–131), which is aspect-ratio-aware (`atan(width/height)`).
2. `getPointsFromAngle(angle, size)` (lines 68–111) converts the CSS angle to **start/end points in the layer's coordinate space**. Note the CSS convention baked in here:
   - `0deg` → bottom→top: `{(0,H) → (0,0)}`
   - `90deg` → left→right: `{(0,0) → (W,0)}`
   - `180deg` → top→bottom: `{(0,0) → (0,H)}`
   - `270deg` → right→left: `{(W,0) → (0,0)}`
   - other angles: computes the gradient line by intersecting with the perpendicular through the far corner (the Blink/Chromium algorithm, cited in the file's comment).
3. Points are normalized to the unit square (`start.x/size.width`, etc.), then passed through **`RCTGradientUtils pointsForCAGradientLayerLinearGradient:endPoint:bounds:`** which **un-squishes** the gradient. This matters: `CAGradientLayer` interpolates `startPoint`/`endPoint` in a *normalized* space, so on non-square views a diagonal gradient's angle is visually distorted; RN corrects it with the geometry in `RCTGradientUtils.mm` (lines 342–380, "fixes the squished effect", per the linked StackOverflow answer). The corrected points become `gradientLayer.startPoint` / `gradientLayer.endPoint`.
4. Colors + locations come from `RCTGradientUtils getColors:andLocations:fromColorStops:` after `getFixedColorStops:` normalizes stop positions.
5. `gradientLayer.frame = {0,0,size}`, then `.colors` and `.locations` are assigned. Default `CAGradientLayer` type is `kCAGradientLayerAxial` (linear).

**Implication for our descriptor**: for a plain `angle` (deg) we can port `getPointsFromAngle` verbatim (it is standalone, no RN types) and — if we want RN-identical diagonals on non-square views — also port the `pointsForCAGradientLayerLinearGradient` un-squish. For a v1 that only needs visual parity on common cases, `startPoint`/`endPoint` from `getPointsFromAngle` normalized to the unit square is already correct for 0/90/180/270 and close elsewhere; the un-squish is the fidelity upgrade (see Open Questions).

### 1d. Radial mapping — `RCTRadialGradient.{h,mm}`

`node_modules/react-native/React/Fabric/Utils/RCTRadialGradient.h`:

```objc
+ (CALayer *)gradientLayerWithSize:(CGSize)size gradient:(const facebook::react::RadialGradient &)gradient;
```

`.mm` (`gradientLayerWithSize:`, lines 156–195). The mapping to `CAGradientLayer`:

```objc
CAGradientLayer *gradientLayer = [CAGradientLayer layer];
gradientLayer.type = kCAGradientLayerRadial;
CGPoint centerPoint = CGPointMake(size.width / 2.0, size.height / 2.0);
// position.top/bottom/left/right override the center (resolved against size)...

bool isCircle = (gradient.shape == RadialGradientShape::Circle);
auto [radiusX, radiusY] =
    GetRadialGradientRadius(isCircle, gradient.size, centerPoint.x, centerPoint.y, size.width, size.height);
const auto gradientLineLength = std::max(radiusX, radiusY);

gradientLayer.startPoint = CGPointMake(centerPoint.x / size.width, centerPoint.y / size.height);
// endpoint.x is horizontal radius, endpoint.y is vertical radius, both normalized:
gradientLayer.endPoint = CGPointMake(
    gradientLayer.startPoint.x + radiusX / size.width,
    gradientLayer.startPoint.y + radiusY / size.height);
```

So for **`kCAGradientLayerRadial`**, Apple's contract is: **`startPoint` = the center (normalized), `endPoint` = center + radius vector (normalized)**. The radius (`radiusX`,`radiusY`) is computed from CSS radial sizing keywords — `closest-side` / `farthest-side` / `closest-corner` / `farthest-corner`, plus explicit `circle`/`ellipse` shape — by the file-local helpers `RadiusToSide` / `RadiusToCorner` / `EllipseRadius` / `GetRadialGradientRadius` (lines 18–152). Colors/locations are produced identically to the linear case.

For our descriptor we only carry `{position}` (the center) — a v1 radial view can hardcode the RN default (`ellipse farthest-corner`) or expose the sizing keyword later. The `endPoint = center + radius/size` formula is the load-bearing bit to copy.

### 1e. Color stops, locations, transparency fix — `RCTGradientUtils.{h,mm}`

`node_modules/react-native/React/Fabric/Utils/RCTGradientUtils.mm`:

- **`getFixedColorStops:gradientLineLength:`** (lines 267–337) implements the CSS color-stop-fixup algorithm: unpositioned first/last stops → 0%/100%, monotonic clamping of positions, even spacing of runs of unpositioned stops, and (via `processColorTransitionHints`, lines 163–263) expanding transition hints into 9 interpolated stops. This is pure CSS-semantics normalization on the JS/props side — **our engine should do stop normalization in TS/C++ before it reaches native**, so the Swift side receives already-clean `colors[]` + `locations[]`.
- **`getColors:andLocations:fromColorStops:`** (lines 381–414) is the important native detail to replicate: it maps stops to `CGColor` + clamped locations `[0,1]`, and contains the **"transparent black" fix** — a stop that is exactly transparent black (`rgba(0,0,0,0)`, i.e. CSS `transparent`) is replaced by the *previous* color at alpha 0, so fades to transparent only interpolate alpha instead of darkening through black. If the engine lets users write `transparent`, port this rule.
- **`pointsForCAGradientLayerLinearGradient:endPoint:bounds:`** (lines 342–380) — the diagonal un-squish described in 1c.

---

## Part 2 — The engine's own iOS gradient renderer (Nitro HybridView)

### 2a. Why a HybridView instead of `experimental_backgroundImage`

- `experimental_backgroundImage` is experimental, string/props-driven through Fabric's `ViewProps`, and rebuilds `CALayer` trees on every prop change inside `RCTViewComponentView`. We want a **first-class component we own end-to-end**, drivable directly from the engine's style resolution, animatable, and not gated on RN's experimental flag lifecycle.
- Nitro's `HybridView` gives us a real Fabric host component whose backing view is a Swift `UIView` we fully control, with a typed props struct generated by nitrogen — no manual `RCTViewManager`/codegen. `packages/nitrocss` already has the full nitrogen + podspec + `nitro.json` autolinking pipeline, so we extend it rather than stand up a new native module.

### 2b. The descriptor → CAGradientLayer mapping

Descriptor the JS/engine layer produces (colors already hex, locations already normalized `[0,1]` and length-matched to colors, stops already fixed-up in TS/C++):

```ts
type GradientType = "linear" | "radial";
interface GradientDescriptor {
  gradientType: GradientType;
  angle: number;          // degrees, CSS convention (linear only)
  position: { x: number; y: number }; // 0..1 fractional center (radial only)
  colors: string[];       // "#RRGGBB" | "#RRGGBBAA"
  locations: number[];    // 0..1, same length as colors
  borderRadius: number;   // uniform, in points (per-corner: see 2e / Open Questions)
}
```

Mapping rules (Swift, applied to a single owned `CAGradientLayer`):

| Descriptor field | `CAGradientLayer` target |
|---|---|
| `gradientType == "linear"` | `.type = .axial` |
| `angle` (deg) | `startPoint`/`endPoint` via ported `getPointsFromAngle(angle, bounds.size)`, normalized to unit square (optionally un-squished) |
| `gradientType == "radial"` | `.type = .radial` |
| `position` | `startPoint = position`; `endPoint = position + radiusVector/size` (default `ellipse farthest-corner` in v1) |
| `colors[]` | `.colors = colors.map { UIColor(hex:).cgColor }` |
| `locations[]` | `.locations = locations.map { NSNumber($0) }` |
| `borderRadius` | `layer.cornerRadius` + `layer.masksToBounds = true` (uniform); `CAShapeLayer` mask for per-corner |

**Angle → points (linear)** — port `getPointsFromAngle` from `RCTLinearGradient.mm` (it is self-contained). Special-case 0/90/180/270 to the exact corner pairs above; general angle via the perpendicular-to-far-corner geometry, then normalize by dividing by `bounds.width`/`bounds.height`.

**Radial** — `startPoint = CGPoint(position.x, position.y)` (already fractional); `endPoint = CGPoint(position.x + rx/W, position.y + ry/H)` where `(rx, ry)` is the farthest-corner radius. For v1, farthest-corner ellipse radius = `(max(centerX, W-centerX), max(centerY, H-centerY))` in points; copy `RadiusToCorner`/`EllipseRadius` from `RCTRadialGradient.mm` when we add sizing keywords.

**`UIColor` from hex** — a small helper parses `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA` → `UIColor(red:green:blue:alpha:)`. If the engine supports CSS `transparent` / fade-to-transparent, also port the transparent-black substitution from `RCTGradientUtils getColors:` (1e).

### 2c. The Swift HybridView class — `HybridGradientView.swift`

Structural model taken from the deleted nitrolist view `git show eb77045:packages/nitrolist/ios/NitroListView.swift`: a `final class ... : UIView` that owns its sublayer/subviews, does all geometry in `layoutSubviews()`, imports `NitroModules`, and is compiled by the podspec's `ios/**/*.{swift,...}` glob. The engine's gradient view follows the same shape but subclasses the nitrogen-generated **`HybridGradientViewSpec`** (a `UIView` subclass emitted by nitrogen for the `.nitro.ts` view spec) instead of raw `UIView`, and reads typed props instead of `@objc` setters.

Reference skeleton (names are engine-renamable; `GradientView` = the view spec name):

```swift
import UIKit
#if canImport(NitroModules)
import NitroModules
#endif

final class HybridGradientView: HybridGradientViewSpec {
  // nitrogen provides `view: UIView` (the backing view) on HybridView specs.
  // We back it with a dedicated UIView whose main layer is a CAGradientLayer,
  // or host a CAGradientLayer as a sublayer. Hosting the layer class is cleanest:
  private final class GradientBackingView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }
    var gradientLayer: CAGradientLayer { layer as! CAGradientLayer }
  }

  private let backing = GradientBackingView(frame: .zero)
  private var descriptor: GradientDescriptor?

  override init() {
    super.init()
    // `view` is the property nitrogen exposes for the mounted UIView.
    view.addSubview(backing)      // or make `backing` the root view — see 2d
  }

  // ---- Nitro prop setters (generated by the .nitro.ts view spec) ----
  // Each prop the spec declares becomes an overridable stored/observed property.
  // On any change we re-apply the descriptor and trigger a relayout.
  var gradient: GradientDescriptor? {
    didSet { descriptor = gradient; applyColorsAndType(); view.setNeedsLayout() }
  }

  private func applyColorsAndType() {
    guard let d = descriptor else { return }
    let gl = backing.gradientLayer
    gl.type = (d.gradientType == .radial) ? .radial : .axial
    gl.colors = d.colors.map { UIColor(hex: $0).cgColor }
    gl.locations = d.locations.map { NSNumber(value: $0) }
    backing.layer.cornerRadius = CGFloat(d.borderRadius)
    backing.layer.masksToBounds = true          // clip gradient to rounded rect
  }

  // ---- Geometry: everything size-dependent recomputed on layout ----
  // Mirrors NitroListView.layoutSubviews(): resize backing to bounds, then
  // recompute start/end points against the *current* size.
  func layoutBacking(in bounds: CGRect) {
    backing.frame = bounds
    backing.gradientLayer.frame = backing.bounds
    guard let d = descriptor else { return }
    let size = bounds.size
    switch d.gradientType {
    case .linear:
      let (s, e) = pointsFromAngle(CGFloat(d.angle), size)   // ported from RCTLinearGradient
      backing.gradientLayer.startPoint = CGPoint(x: s.x / size.width, y: s.y / size.height)
      backing.gradientLayer.endPoint   = CGPoint(x: e.x / size.width, y: e.y / size.height)
    case .radial:
      let c = CGPoint(x: CGFloat(d.position.x), y: CGFloat(d.position.y))  // fractional
      let rx = max(c.x, 1 - c.x), ry = max(c.y, 1 - c.y)                   // farthest-corner (unit)
      backing.gradientLayer.startPoint = c
      backing.gradientLayer.endPoint   = CGPoint(x: c.x + rx, y: c.y + ry)
    }
  }
}
```

Where the layout hook comes from depends on the Nitro HybridView API surface:

- If the mounted `view` is the `GradientBackingView` itself, override `layoutSubviews()` on that class and call `layoutBacking(in: bounds)` — this is the exact pattern `NitroListView` uses (`override func layoutSubviews() { super.layoutSubviews(); scrollView.frame = bounds; ... }`).
- If nitrogen gives us a wrapper `view`, forward its `layoutSubviews` (via a lightweight `UIView` subclass with a layout callback) into `layoutBacking(in:)`.

Because `CAGradientLayer.startPoint`/`endPoint` are in **normalized [0,1] unit-square space**, resizing the layer to `bounds` is enough — the points do not need re-scaling on resize for the axis-aligned cases. They only need recomputation when the *angle* interacts with a changed **aspect ratio** (diagonal un-squish), which is why we recompute in `layoutBacking` rather than only on prop change.

### 2d. Clipping (corner radius) — uniform vs per-corner

Follow RN's rule from `shapeLayerToMatchView:` (1a):

- **Uniform `borderRadius`** → `backing.layer.cornerRadius = r; backing.layer.masksToBounds = true;` (optionally `layer.cornerCurve = .continuous` to match iOS smooth corners / RN's `cornerCurve`).
- **Per-corner radii** (future) → build a `CAShapeLayer` from a rounded-rect `CGPath` (RN uses `RCTPathCreateWithRoundedRect`; the Swift equivalent is `UIBezierPath` with per-corner arcs, or reuse RN's util if we link it) and set it as `backing.layer.mask`, with `cornerRadius = 0`. Rebuild the mask path in `layoutBacking` because it is size-dependent.

`masksToBounds = true` is required (as RN sets `backgroundImageLayer.masksToBounds = YES`) so the gradient does not bleed past rounded corners.

### 2e. The Nitro view spec — `GradientView.nitro.ts`

A HybridView spec (Nitro >= 0.34) declares the props; nitrogen generates the Fabric component + the Swift `HybridGradientViewSpec` base class. Shape (rename-agnostic; mirrors the style of `packages/nitrocss/src/specs/NativePlatform.nitro.ts`):

```ts
import type { HybridView } from "react-native-nitro-modules";

export interface GradientProps {
  gradientType: "linear" | "radial";
  angle: number;
  position: { x: number; y: number };
  colors: string[];
  locations: number[];
  borderRadius: number;
}

export interface GradientMethods {}

export type GradientView = HybridView<GradientProps, GradientMethods, {
  ios: "swift";
  android: "kotlin";
}>;
```

Then register it in `nitro.json` `autolinking` alongside the existing entries, e.g.:

```json
"GradientView": { "swift": "HybridGradientView", "kotlin": "HybridGradientView" }
```

On the JS side the component is obtained via `getHostComponent("GradientView", () => require('...generated config...'))` and re-exported from the engine's public entry.

---

## Part 3 — Exact ordered build steps

Anchored to `packages/nitrocss` as it exists today (rename tokens at implementation time). Do NOT commit generated `nitrogen/generated` by hand — run the generator.

1. **Add the view spec.** Create `packages/nitrocss/src/specs/GradientView.nitro.ts` with the `HybridView<GradientProps, GradientMethods, {...}>` shape from 2e. Export it from `packages/nitrocss/src/specs/index.ts` (the barrel that already re-exports the other `.nitro.ts` specs).

2. **Register autolinking.** Add the `"GradientView": { "swift": "HybridGradientView", "kotlin": "HybridGradientView" }` entry to `packages/nitrocss/nitro.json` `autolinking` (schema/`cxxNamespace`/`iosModuleName` unchanged).

3. **Run nitrogen.** `yarn nitrogen` in `packages/nitrocss` (the `"nitrogen": "nitrogen"` package.json script). This emits:
   - `nitrogen/generated/ios/**` — the Swift `HybridGradientViewSpec` base class + Fabric component glue, and updates `Nitrowind+autolinking.rb` (consumed by the podspec's `add_nitrogen_files(s)`).
   - `nitrogen/generated/shared/**` — the C++ prop struct.
   The podspec (`Nitrowind.podspec`) already globs `ios/**/*.{swift,h,m,mm}` and calls `load .../Nitrowind+autolinking.rb; add_nitrogen_files(s)`, so **no podspec edit is needed** — the new Swift file and generated files are picked up automatically. (Contrast the deleted nitrolist podspec, which used a plain `s.source_files = 'ios/**/*.{h,m,mm,swift}'` glob with no nitrogen step — the engine's podspec is the more capable pattern to keep.)

4. **Write the Swift view.** Create `packages/nitrocss/ios/HybridGradientView.swift` (2c): subclass the generated `HybridGradientViewSpec`, own a `GradientBackingView` whose `layerClass` is `CAGradientLayer`, implement prop setters (`applyColorsAndType`) and `layoutBacking(in:)` (the angle→points / radial center+radius math), and wire `layoutSubviews`. Add the `UIColor(hex:)` helper (own file or extension) and, if `transparent` support is wanted, the transparent-black substitution from `RCTGradientUtils getColors:`.

5. **(Optional) port the geometry helpers** `pointsFromAngle` (from `RCTLinearGradient.mm getPointsFromAngle`) and, for fidelity, the diagonal un-squish (`RCTGradientUtils pointsForCAGradientLayerLinearGradient`) and radial radius helpers (`RCTRadialGradient.mm`) into Swift or a small `.mm` reachable via the existing `NitrowindBridge` seam. Keep them in `ios/` so the podspec glob compiles them.

6. **Android parity (out of scope for this doc, note only).** The same `nitro.json` entry names a Kotlin `HybridGradientView`; the Android renderer is a `View`/`GradientDrawable` or `Paint`+`Shader` (`LinearGradient`/`RadialGradient`) equivalent. Tracked separately.

7. **JS export.** Add `getHostComponent(...)` wiring for `GradientView` and re-export from the engine's public JS entry so the engine's style layer can mount it and feed the descriptor.

8. **Build/verify.** `pod install` in the example app (`example/`), run iOS, and diff the visual output against `experimental_backgroundImage` for a matrix of angles (0/45/90/135/180/270), radial center positions, multi-stop + transparent fades, and rounded corners.

---

## Part 4 — Open questions / risks

1. **Radial fidelity.** `CAGradientLayer`'s `kCAGradientLayerRadial` only draws an axis-aligned ellipse from `startPoint` to `endPoint` (center + radius vector). It has **no native support for CSS `closest/farthest-side/corner` sizing keywords or arbitrary shape** — RN approximates by computing the radius and feeding `endPoint`. v1 should ship `ellipse farthest-corner` (RN's default) and treat other keywords as a follow-up (port `GetRadialGradientRadius`). True radial gradients with non-elliptical falloff or focal points are not expressible with `CAGradientLayer` at all and would need a `CAShapeLayer` + `CGGradient` `drawRadialGradient` fallback.

2. **Diagonal "squish" on non-square views.** Without porting `pointsForCAGradientLayerLinearGradient` (1c/1e), diagonal angles on non-square views render at a visually wrong angle (the classic `CAGradientLayer` squish). Decide up front: ship the un-squish for parity, or accept the deviation in v1. It must be recomputed in `layoutBacking` whenever bounds' aspect ratio changes.

3. **Reanimated / animated transforms.** For animating `angle`, `colors`, or `position` from Reanimated: `CAGradientLayer`'s `colors`/`locations`/`startPoint`/`endPoint` are all animatable `CALayer` properties, but driving them from Reanimated means exposing an imperative hook. Options: (a) a Nitro **method** on the view (`GradientMethods`) that Reanimated's native side can call each frame; (b) animate via `CABasicAnimation`/`CAAnimation` when the descriptor changes; (c) expose `startPoint`/`endPoint`/`colors` as directly settable props and let the engine push per-frame values. Risk: implicit `CALayer` animations (the default 0.25s action on property changes) will cause unwanted lerping on ordinary prop updates — wrap prop application in a `CATransaction` with `setDisableActions(true)` to suppress them, and only opt into animation deliberately.

4. **Per-corner border radius.** The descriptor currently carries a single uniform `borderRadius`. Matching RN's non-uniform path needs a `{topLeft, topRight, bottomRight, bottomLeft}` shape plus the `CAShapeLayer` rounded-rect mask (rebuilt in `layoutBacking`, size-dependent). Also consider `cornerCurve = .continuous` to match RN's `cornerCurve` / iOS smooth corners. Interaction risk: a mask (`layer.mask`) and `masksToBounds` + `cornerRadius` are mutually exclusive strategies — pick one per configuration exactly as RN does.

5. **Color-stop normalization boundary.** RN does stop fixup + transition-hint expansion in native (`RCTGradientUtils`). The engine plan pushes clean `colors[]`/`locations[]` from TS/C++. Ensure that layer owns: unpositioned-stop spacing, monotonic clamping, transition-hint expansion (9-stop interpolation), and the transparent-black fade rule — otherwise gradients with `transparent` or hint syntax (`color, 30%, color`) will diverge from RN/web.

6. **Color space / P3.** RN builds `CGColor`s from `RCTUIColorFromSharedColor`. If the engine's hex parser produces sRGB `UIColor`s while RN uses display-P3 in some paths, wide-gamut colors can differ subtly. Low risk for hex `#RRGGBB`, worth noting if the engine later accepts P3/`color()` syntax.

7. **`layerClass` vs sublayer.** Making the backing view's `layerClass` a `CAGradientLayer` (as in the skeleton) is the cleanest and avoids a manual `frame` sync, but couples the whole view's layer to the gradient. If the view must also host children or its own background, host the `CAGradientLayer` as a dedicated sublayer instead and sync its `frame` in `layoutBacking` (as RN does with sublayers). Decide based on whether the gradient view is a leaf or a container.

STATUS: DONE
