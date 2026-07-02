# engine-v2 research: CSS `filter` (blur / brightness / etc.) — native rendering

Scope: how React Native 0.86 renders CSS `filter` natively (iOS SwiftUI / Android
`RenderEffect`), what our `nitrocss` compiler emits today, and how the engine-v2
would own native filter rendering itself — driven by our own parsed
`FilterFunction` descriptors, tied to the future C++ CSS parser.

All paths absolute. Names in this doc (functions, files) may be renamed during
implementation; the shapes and control flow are what matters.

RN version in tree: `0.86.0` (`node_modules/react-native/package.json`).

---

## 1. RN 0.86 filter path

### 1.1 Prop shape and storage

`filter` is a `BaseViewProps` field:

`node_modules/react-native/ReactCommon/react/renderer/components/view/BaseViewProps.h`
```cpp
#include <react/renderer/graphics/Filter.h>
...
// Filter
std::vector<FilterFunction> filter{};
```

The descriptor type lives in
`node_modules/react-native/ReactCommon/react/renderer/graphics/Filter.h`:
```cpp
enum class FilterType {
  Blur, Brightness, Contrast, Grayscale, HueRotate,
  Invert, Opacity, Saturate, Sepia, DropShadow
};

struct DropShadowParams {
  Float offsetX{};
  Float offsetY{};
  Float standardDeviation{};
  SharedColor color{};
};

struct FilterFunction {
  FilterType type{};
  std::variant<Float, DropShadowParams> parameters{};
};
```

So every filter primitive is one of 9 scalar filters (parameter = a single
`Float`) or `drop-shadow` (parameter = `DropShadowParams`). `filterTypeFromString`
in the same header is the string↔enum table; note the JS/serialized key for hue
rotation is camelCase **`hueRotate`** and for drop shadow **`dropShadow`** (this
matters for what we emit — see §2).

### 1.2 Parsing: the `enableNativeCSSParsing` branch

`node_modules/react-native/ReactCommon/react/renderer/components/view/FilterPropsConversions.h`

The single entry point is `fromRawValue(...) -> std::vector<FilterFunction>`
(bottom of file), which forks on a feature flag:
```cpp
inline void fromRawValue(const PropsParserContext &context, const RawValue &value,
                         std::vector<FilterFunction> &result) {
  if (ReactNativeFeatureFlags::enableNativeCSSParsing()) {
    parseUnprocessedFilter(context, value, result);   // accepts CSS strings + raw maps
  } else {
    parseProcessedFilter(context, value, result);     // pre-processed object form only
  }
}
```

- **`parseProcessedFilter`** (flag OFF, the default — see §1.5) expects the value
  to already be a `std::vector<map<string,RawValue>>`, i.e. the exact
  `[{ blur: 4 }, { brightness: 0.5 }, ...]` shape. It reads the single key of each
  map via `rawFilterFunction.begin()->first`, maps it through
  `filterTypeFromString`, and for everything except `dropShadow` just does
  `filterFunction.parameters = (float)rawFilterFunction.begin()->second;`.
  DropShadow is read field-by-field (`offsetX`, `offsetY`, `standardDeviation`,
  `color`). **Malformed → whole filter list dropped** (`result = {}`), matching
  web behavior.

- **`parseUnprocessedFilter`** (flag ON) additionally accepts a raw **CSS string**
  (`parseUnprocessedFilterString`) or a list of raw maps
  (`parseUnprocessedFilterList`). The string path runs RN's own C++ CSS parser:
  ```cpp
  auto filterList = parseCSSProperty<CSSFilterList>((std::string)value);
  for (const auto &cssFilter : std::get<CSSFilterList>(filterList))
    if (auto filter = fromCSSFilter(cssFilter)) result.push_back(*filter);
  ```
  `fromCSSFilter` converts each `CSSFilterFunction` variant (from
  `node_modules/react-native/ReactCommon/react/renderer/css/CSSFilter.h`) into a
  `FilterFunction`. Notable limits today: `CSSBlurFilter` and `CSSDropShadowFilter`
  **only accept `px` lengths** (`if (filter.amount.unit != CSSLengthUnit::Px) return {};`),
  and `hue-rotate` carries `degrees` while brightness/contrast/etc. carry a
  normalized `amount`.

This is the key tie-in for engine-v2: **RN already ships a C++ CSS filter grammar
(`CSSFilter.h` + `CSSValueParser` + `parseCSSProperty<CSSFilterList>`)**, gated
behind `enableNativeCSSParsing`. Our own C++ CSS parser (see the native-CSS-parser
research) either wraps/reuses this or produces the same `std::vector<FilterFunction>`.

### 1.3 iOS rendering — `enableSwiftUIBasedFilters` + SwiftUI

`node_modules/react-native/React/Fabric/Mounting/ComponentViews/View/RCTViewComponentView.mm`

Two distinct rendering strategies coexist:

**(a) Cheap CALayer-only filters** (always available, no flag): applied inline in
the props-update block (~line 1146+). These do *not* need SwiftUI:
- `Opacity` → `self.layer.opacity *= amount`
- `Brightness` → an extra `_filterLayer` `CALayer` with
  `compositingFilter = @"multiplyBlendMode"` and a solid gray
  (`multiplicativeBrightness`) background composited over the view.

**(b) SwiftUI-hosted filters** (`Blur`, `Grayscale`, `DropShadow`, `Saturate`,
`Contrast`, `HueRotate`): require the `_swiftUIWrapper`. Gate:
```cpp
- (BOOL)styleNeedsSwiftUIContainer {
  for (const auto &primitive : _props->filter)
    if (primitive.type == FilterType::Blur   || FilterType::Grayscale ||
        FilterType::DropShadow || FilterType::Saturate ||
        FilterType::Contrast   || FilterType::HueRotate) return YES;
  return NO;
}
```
`effectiveContentView` (~line 908) lazily wraps the view's subtree in a
`RCTSwiftUIContainerViewWrapper` **only when `enableSwiftUIBasedFilters()` is on
AND `styleNeedsSwiftUIContainer` is YES**. If the flag is off, it early-returns
`self` and those filters silently do nothing on iOS. When wrapping, it moves the
subviews, `clipsToBounds`, and layer mask into a SwiftUI-hosted content view and
transfers visual props.

Then in the props-update loop each primitive is pushed to the wrapper:
```cpp
[_swiftUIWrapper updateBlurRadius:@(blurRadius)];
[_swiftUIWrapper updateGrayscale:@(grayscale)];
[_swiftUIWrapper updateSaturation:@(saturation)];
[_swiftUIWrapper updateContrast:@(contrast)];
[_swiftUIWrapper updateHueRotate:@(hueRotateDegrees)];
[_swiftUIWrapper updateDropShadow:@(sd) x:@(x) y:@(y) color:shadowColor];
```

Wrapper ObjC surface:
`node_modules/react-native/ReactApple/RCTSwiftUIWrapper/RCTSwiftUIContainerViewWrapper.h`
(`.m` forwards to a Swift `RCTSwiftUIContainerView`).

The Swift view is where CSS maps to SwiftUI modifiers —
`node_modules/react-native/ReactApple/RCTSwiftUI/RCTSwiftUIContainerView.swift`:
```swift
UIViewWrapper(view: contentView)
  .blur(radius: viewModel.blurRadius)
  .grayscale(viewModel.grayscale)
  .shadow(color: ..., radius: shadowRadius, x: shadowX, y: shadowY)
  .saturation(viewModel.saturationAmount)
  .contrast(viewModel.contrastAmount)
  .hueRotation(.degrees(viewModel.hueRotationDegrees))
```
i.e. RN delegates the actual filter math to SwiftUI's built-in `.blur`,
`.grayscale`, `.saturation`, `.contrast`, `.hueRotation` modifiers (which under
the hood are CoreImage/Metal). `resetStyles` restores identity values
(blur 0, grayscale 0, saturation 1, contrast 1). **`invert` and `sepia` are not
mapped on the iOS SwiftUI path** — only the six enumerated in
`styleNeedsSwiftUIContainer` plus the two CALayer ones (opacity, brightness).

### 1.4 Android rendering — `RenderEffect` chains, API 31+

`node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/FilterHelper.kt`
(`@TargetApi(31)`, i.e. Android S).

Two code paths, chosen at apply time by
`node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/BaseViewManager.java`
in the `LayerEffectsHelper.apply(view, filter, useHWLayer)` inner class:
```java
if (filter != null) {
  if (FilterHelper.isOnlyColorMatrixFilters(filter)) {        // no blur / dropShadow
    p = new Paint();
    p.setColorFilter(FilterHelper.parseColorMatrixFilters(filter));   // works < API 31 too
  } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    view.setRenderEffect(FilterHelper.parseFilters(filter));   // RenderEffect chain, API 31+
  }
}
// then setLayerType(HARDWARE, p) when a color-matrix Paint was built
```
`setFilter` just stores the array as a view tag (`R.id.filter`); it is applied in
the layout/draw pass.

`FilterHelper` details:
- `parseFilters` folds the array into a **chained `RenderEffect`**, threading the
  previous effect into the next (`createBlurEffect(r, r, chainedEffects, DECAL)`,
  etc.). Filter-name keys are the camelCase serialized keys
  (`hueRotate`, `dropShadow`).
- `createBlurEffect` uses `sigmaToRadius` (web sigma → Android radius, ratio
  `0.57735`, from hwui `Blur.cpp`); ignores sigma ≤ 0.5.
- brightness/contrast/grayscale/sepia/saturate/hueRotate/invert/opacity are each a
  `ColorMatrix` (spec formulas cited inline, `w3.org/TR/filter-effects-1`), wrapped
  by `RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(...))`.
- `dropShadow` = offset + `BlendModeColorFilter(color, SRC_IN)` + blur, blended
  back over the identity offset with `SRC_OVER`.
- `parseColorMatrixFilters` pre-concats all matrices into one
  `ColorMatrixColorFilter` — used when the list has **no** blur/dropShadow, so it
  can run as a cheap `Paint` color filter (and works below API 31).
- `isOnlyColorMatrixFilters` returns false if any `blur` or `dropShadow` present.

**Key Android takeaway:** color-matrix-only filter stacks work on all supported
API levels via `Paint`/`ColorMatrixColorFilter`; **blur and drop-shadow require
API 31+ `RenderEffect`** and are simply skipped below S (no fallback in RN).

### 1.5 Feature-flag defaults

`node_modules/react-native/ReactCommon/react/featureflags/ReactNativeFeatureFlagsDefaults.h`
```cpp
bool enableNativeCSSParsing()      override { return false; }
bool enableSwiftUIBasedFilters()   override { return false; }
```
Both default **off** in 0.86. Consequence: out of the box, RN's iOS SwiftUI filters
(blur/grayscale/saturate/contrast/hueRotate/dropShadow) are **inert** unless the
host app flips `enableSwiftUIBasedFilters`; and `filter` values must arrive as the
pre-processed object array (`parseProcessedFilter`) because native CSS-string
parsing is off. This is the crux of why engine-v2 should not simply lean on the
RN `filter` prop for blur on iOS.

---

## 2. What `nitrocss` emits today

`packages/nitrocss/src/compiler/parsers/filter.ts`

`extractFilter(declarations, resolveVar)` picks up `filter`, `backdrop-filter`,
and `-webkit-backdrop-filter` declarations, resolves `var(--tw-*)` (Tailwind
composes filters via `--tw-blur` etc.), normalizes (`none`/`initial` → dropped),
then `parseFilterList` regex-splits `fn(args)` tokens and emits **RN's object
array form** matching `parseProcessedFilter`:
```ts
case "blur":        out.push({ blur: parseLength(raw) });          // px number
case "brightness":  // and contrast/grayscale/invert/opacity/saturate/sepia
                    out.push({ [name]: parseNumberOrPercent(raw) }); // % → /100
case "hue-rotate":  out.push({ hueRotate: parseAngleDegrees(raw) }); // deg (rad→deg)
case "drop-shadow": out.push({ dropShadow: { offsetX, offsetY,
                              standardDeviation, color } });
```
Return shape: `{ filter: [ {blur:4}, {brightness:0.5}, ... ] }` assigned onto the
`RNStyle` in `packages/nitrocss/src/compiler/parseStyles.ts` (line ~382). The
camelCase keys (`hueRotate`, `dropShadow`) already match RN's
`filterTypeFromString` / `FilterHelper` keys — good.

`isFilterProp` covers `filter` / `-webkit-filter` only. `parseStyles`'
`isParsedProp` additionally routes `backdrop-filter` /
`-webkit-backdrop-filter` through the filter path (line ~330–338).

**What we ship today, and its ceiling:**
- We emit the exact `parseProcessedFilter` object array → so on **Android** our
  filters work (color-matrix always, blur/dropShadow on API 31+). Good.
- On **iOS**, blur/grayscale/saturate/contrast/hueRotate/dropShadow only render if
  the app has `enableSwiftUIBasedFilters` on. With the default-off flag, our
  emitted `{blur:N}` is silently ignored on iOS. Only opacity + brightness
  (CALayer path) render unconditionally.
- **`backdrop-filter` is collapsed into the same `filter` prop** — RN has no
  backdrop-filter concept, so this is wrong semantically (it filters the element's
  own content, not what's behind it). This is a real gap for a glass/blur-behind
  effect (open question in §4).
- Non-px blur units and non-`Px` lengths are lossy vs. web.

---

## 3. engine-v2 design: own the native filter path

The recommendation is that engine-v2 **owns filter rendering natively** rather than
round-tripping through RN's `filter` prop for the effects that RN gates behind
flags (iOS blur family) or can't express (backdrop-filter). This mirrors what we
already do for gradients: `nitrocss` gradient utilities compile to `--nw-gradient-*`
marker props and fold into a native representation
(`packages/nitrocss/src/compiler/parsers/gradient.ts`,
`experimental_backgroundImage`) rather than a stock RN style. Filters should get
the same treatment via a dedicated engine-owned filter layer/host view.

### 3.1 Descriptor model (shared, C++-first)

Define our own `FilterFunction`-equivalent descriptor list in the C++ engine
(`packages/nitrocss/cpp/NitroCssEngine.{hpp,cpp}` currently exposes
`resolve(className) -> folly::dynamic`). Two build options:
- **Reuse RN's grammar**: call `parseCSSProperty<CSSFilterList>` (from
  `react/renderer/css/CSSFilter.h`) and convert with the same `fromCSSFilter`
  logic as `FilterPropsConversions.h`. Pros: zero new grammar, exact web math.
  Cons: couples us to RN internal headers and their px-only limits.
- **Own parser**: our C++ CSS parser (see native-CSS-parser research) produces the
  descriptor directly. Preferred long-term; lets us support non-px units,
  `backdrop-filter`, and animatable params. **This is the hard dependency on the
  native CSS parser research** — the filter descriptor is one of its outputs.

Either way the runtime artifact should carry a structured filter descriptor
(type + scalar/dropShadow params), not just the RN object array, so the engine can
choose how to render per platform.

### 3.2 iOS: apply on our own host/filter layer

- For the **CALayer-cheap** filters (opacity, brightness) we can replicate RN's
  approach ourselves on the host view's layer — no SwiftUI, no flag. Straight
  `layer.opacity` and a `compositingFilter=@"multiplyBlendMode"` sublayer
  (see RCTViewComponentView.mm ~1201).
- For **blur / grayscale / saturate / contrast / hueRotate / dropShadow**, apply
  SwiftUI/CoreImage modifiers ourselves so we do **not** depend on
  `enableSwiftUIBasedFilters`. Options, in order of preference:
  1. **CALayer CoreImage filters** on our host view:
     `layer.filters = @[ CIFilter … ]` (e.g. `CIGaussianBlur`,
     `CIColorControls` for saturation/contrast/brightness,
     `CIColorMonochrome`/`CIPhotoEffect` for grayscale, `CIHueAdjust`). This is
     the lowest-overhead path and does not require reparenting the subtree into a
     SwiftUI host. Note `CIGaussianBlur` clips at edges — may need `imageByClamping`
     / a slightly larger sample rect, same class of problem RN solves with
     `TileMode.DECAL` on Android.
  2. Wrap in a SwiftUI `UIViewRepresentable` host mirroring RN's
     `RCTSwiftUIContainerView.swift` modifier chain, but owned by us (so it's
     always on). Heavier (subtree reparenting) — reserve for cases where CALayer
     CoreImage is insufficient.
  - For **blur specifically**, a `UIVisualEffectView` (`UIBlurEffect`) gives the
    system frosted look but is not a numeric radius; `CIGaussianBlur` (radius from
    our sigma) matches CSS semantics better. Prefer CIGaussianBlur for
    `filter: blur()`; reserve `UIVisualEffectView` for `backdrop-filter` (§4).
- Tie-in with gradient work: because our gradient already renders on an
  engine-owned native surface, applying the filter to **that same host layer**
  (a single filter layer wrapping background + content) keeps ordering correct and
  avoids a second reparenting.

### 3.3 Android: own `RenderEffect` chain

- Re-implement the `FilterHelper.kt` logic in our native module: build a chained
  `RenderEffect` from our descriptor and call `view.setRenderEffect(...)` on our
  host view, plus the `ColorMatrixColorFilter`-on-`Paint` fast path for
  color-matrix-only stacks (which we can support below API 31).
- We can lift the exact spec-correct matrices/`sigmaToRadius` constants from
  `FilterHelper.kt` (they are MIT-licensed RN source) rather than re-deriving.
- Because we own the apply site we can decide layer type (`LAYER_TYPE_HARDWARE`)
  and combine with our gradient host drawable in one pass.

### 3.4 Should we still rely on RN's `filter` prop?

Decision: **hybrid, defaulting to engine-owned for blur/backdrop.**
- Keep emitting the RN `filter` object array for **color-matrix filters on
  Android** and **opacity/brightness on iOS** — those work today with zero flags
  and no native code, so there's no reason to reimplement them first.
- Take over natively for: **iOS blur/grayscale/saturate/contrast/hueRotate/
  dropShadow** (RN gates them behind `enableSwiftUIBasedFilters`, off by default),
  and **`backdrop-filter` on both platforms** (RN can't express it).
- Longer term, once the C++ parser + native filter layer is proven, migrate the
  remaining cases off the RN prop for consistency and to escape the px-only and
  flag limitations.

---

## 4. Ordered steps + open questions

### Ordered implementation steps
1. **Descriptor**: add a structured filter descriptor to the runtime artifact
   (type + params), produced by `extractFilter` today and by the C++ CSS parser
   later. Keep the RN object-array emit as a compatibility output. (Depends on
   native-CSS-parser research for the C++ side.)
2. **Android native filter layer**: port `FilterHelper.kt` (RenderEffect chain +
   color-matrix fast path + `sigmaToRadius`) into our native module; apply on our
   host/gradient view. Wire the `< API 31` color-matrix fallback.
3. **iOS native filter layer**: implement CALayer CoreImage filters
   (`CIGaussianBlur`, `CIColorControls`, `CIHueAdjust`, grayscale) on our host
   view, flag-independent; keep opacity/brightness on the cheap CALayer path.
4. **Route blur/backdrop through the engine** in `parseStyles`/runtime fold;
   leave color-matrix + opacity/brightness on the RN prop initially.
5. **backdrop-filter**: stop collapsing it into `filter`; render it as a
   blur-behind on a separate backdrop layer (iOS `UIVisualEffectView` /
   `CIGaussianBlur` sampling backdrop; Android — no direct `RenderEffect` backdrop,
   needs a captured-backdrop bitmap or `BackdropNode`-style approach).
6. **Animation**: hook filter scalar params into the AnimationBackend/Reanimated
   path so `transition`/animated blur radius updates drive native filter params
   without a full re-resolve.

### Open questions
- **backdrop-filter**: neither RN path supports it. iOS `UIVisualEffectView`
  approximates blur-behind but not arbitrary color-matrix backdrops; Android has no
  first-class backdrop `RenderEffect` (would need to snapshot what's behind the
  view). How faithful must we be vs. shipping "blur only" backdrop first?
- **Animating filter values**: SwiftUI/`@Published` (RN's iOS path) and
  `RenderEffect` are both re-created per update, not interpolated. Can our
  AnimationBackend drive `CIGaussianBlur.inputRadius` / rebuild the Android
  `RenderEffect` per frame cheaply enough, or do we need a dedicated animatable
  filter uniform path? Confirm how the Reanimated bridge would push per-frame
  scalar updates to the native filter layer without going through props.
- **Android < 31 fallback**: blur/dropShadow have no `RenderEffect`. Options: a
  RenderScript/`ScriptIntrinsicBlur` (deprecated) fallback, a downscale+blur
  bitmap, or graceful no-op. Which is acceptable for our min SDK?
- **iOS blur edge clamping**: `CIGaussianBlur` shrinks/darkens edges; RN's Android
  path uses `TileMode.DECAL`. Need the CoreImage equivalent (clamp-to-edge sample
  + crop) to match.
- **Ownership of the RN internal grammar**: do we depend on
  `react/renderer/css/CSSFilter.h` + `parseCSSProperty<CSSFilterList>` (fast, exact,
  but private RN headers and px-only), or fully own parsing in our C++ parser?
- **Non-px / unit support**: RN's `fromCSSFilter` rejects non-px blur/shadow
  lengths; our parser should resolve `rem`/`em`/`%` to px at resolve time.
- **`invert`/`sepia` on iOS**: not on RN's SwiftUI path; confirm our CoreImage
  mapping (`CIColorInvert`, `CISepiaTone`) matches the spec matrices in
  `FilterHelper.kt`.

STATUS: DONE
