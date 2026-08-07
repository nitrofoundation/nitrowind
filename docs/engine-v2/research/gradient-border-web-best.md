# `.btn-gradient-2` and `background-image` — Final Recommended Version

Date: 2026-07-03

## Final verdict

For a rounded button, the best approach is a two-layer background with:
- a transparent real border
- a solid inner fill layer
- a gradient outer layer
- explicit `background-clip`

This is the best default because it:
- preserves `border-radius` correctly
- works well in modern Chrome, Firefox, Safari, and mobile browsers
- avoids the rounded-corner limitations of `border-image`
- stays simple and performant for normal button usage

For general `background-image` usage, the same CSS system is also a good base for:
- live remote image URLs
- local image assets
- layered image + gradient combinations
- fill, repeat, size, and position control

## Recommended CSS

```css
.btn-gradient-2 {
  border: 4px solid transparent;
  border-radius: 50em;
  background-image:
    linear-gradient(white, white),
    linear-gradient(to right, darkblue, darkorchid);
  background-origin: border-box;
  background-clip: padding-box, border-box;
}
```

## Structure we should use

Use this structure as the default plan:

1. Use layered `background-image` for gradient borders and image overlays.
2. Use `background-clip` and `background-origin` when the border area and inner fill need different behavior.
3. Use `background-size`, `background-repeat`, and `background-position` explicitly whenever a real image is involved.
4. Keep the border case and the image-fill case as separate patterns so the CSS stays readable.

Recommended pattern split:

### Pattern A — Rounded gradient border

```css
.btn-gradient-2 {
  border: 4px solid transparent;
  border-radius: 50em;
  background-image:
    linear-gradient(white, white),
    linear-gradient(to right, darkblue, darkorchid);
  background-origin: border-box;
  background-clip: padding-box, border-box;
}
```

### Pattern B — Real background image that fills the box

```css
.bg-cover {
  background-image: url("/images/hero.jpg");
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
```

### Pattern C — Real background image that must fully fit inside

```css
.bg-contain {
  background-image: url("/images/logo.png");
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}
```

### Pattern D — Exact width and height control

```css
.bg-stretch {
  background-image: url("/images/pattern.png");
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
```

Use Pattern D carefully because it can distort the image.

## Why this version is the best

- The first background layer is painted on top, so the white fill stays visible inside the button.
- The second gradient layer sits behind it and shows through the transparent border area.
- `background-clip: padding-box, border-box` makes the inner fill stop before the border while letting the gradient cover the full rounded outline.
- `border-image` is not the right default for pill buttons because `border-radius` does not affect it the same way.

## How `background-image` should handle URLs and local assets

The W3Schools page you linked and the MDN docs both confirm that `background-image` can take `url(...)`, multiple URLs, gradients, or mixed image layers.

Examples:

```css
background-image: url("/images/photo.jpg");
background-image: url("/images/top.png"), url("/images/base.png");
background-image: linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url("/images/photo.jpg");
```

Recommended asset plan:

- For live remote images, use full URLs:

```css
background-image: url("https://example.com/banner.jpg");
```

- For local web assets in CSS, use relative or root-based URLs:

```css
background-image: url("./banner.jpg");
background-image: url("/images/banner.jpg");
```

- For app code that imports assets through a bundler, let JS resolve the asset and pass the URL into styles if needed.

Important note:
- Plain CSS does not use `require(...)` directly the way JS does.
- In CSS files, prefer `url("./file.png")` or `url("/images/file.png")`.
- In JS or TS, if a bundler resolves the asset, use the resolved URL in `backgroundImage`.

Example in JS:

```js
import heroUrl from "./hero.jpg";

const style = {
  backgroundImage: `url(${heroUrl})`,
};
```

## Fill, repeat, width, and height plan

When using real background images, choose the sizing rule based on intent:

### If the image should fill the box

```css
background-size: cover;
background-position: center;
background-repeat: no-repeat;
```

Use this when:
- the box must be fully covered
- cropping is acceptable

### If the whole image must stay visible

```css
background-size: contain;
background-position: center;
background-repeat: no-repeat;
```

Use this when:
- the entire image must remain visible
- empty space around the image is acceptable

### If the image should repeat

```css
background-repeat: repeat;
background-repeat: repeat-x;
background-repeat: repeat-y;
background-repeat: round;
background-repeat: space;
```

Use this when:
- the image is a texture or pattern
- tiling is intentional

### If the image should match exact width and height

```css
background-size: 100% 100%;
```

Use this when:
- exact fit matters more than preserving aspect ratio

Warning:
- this can stretch or squash the image

### If width and height should stay proportional

```css
background-size: 320px auto;
background-size: 100% auto;
background-size: auto 100%;
```

Use this when:
- one dimension should be locked
- the other should scale automatically

## Recommended defaults by use case

For buttons with gradient borders:

```css
background-image:
  linear-gradient(white, white),
  linear-gradient(to right, darkblue, darkorchid);
background-origin: border-box;
background-clip: padding-box, border-box;
```

For hero or card images:

```css
background-image: url("/images/hero.jpg");
background-position: center;
background-repeat: no-repeat;
background-size: cover;
```

For logos or illustrations that must stay fully visible:

```css
background-image: url("/images/logo.png");
background-position: center;
background-repeat: no-repeat;
background-size: contain;
```

For textures or patterns:

```css
background-image: url("/images/pattern.png");
background-repeat: repeat;
background-size: auto;
```

## Performance

This is performant enough for normal UI use.

Use it freely for:
- regular buttons
- small button groups
- static or lightly animated controls

Be more careful only when:
- you animate gradient stops every frame
- you render very large dense lists of these buttons

If heavy animation is needed later, prefer transform or opacity based motion, or move the animated effect to a pseudo-element.

For image backgrounds:
- `cover` and `contain` are usually fine
- very large images should be optimized before use
- repeating tiny textures is usually cheap
- large animated layered backgrounds can increase paint cost quickly

## Recommendation

Keep this pattern and standardize on the CSS above as the single source of truth for gradient pill borders.

Also standardize the image-background rules:
- `cover + center + no-repeat` for fill-style images
- `contain + center + no-repeat` for full-visibility images
- `repeat` only for true textures and patterns
- `100% 100%` only when stretching is intentionally acceptable

## NitroCSS integration research

Current NitroCSS engine status in this repo:

- Gradients already have a native engine path.
- Plain `background-image: url(...)` is intentionally skipped on native today.
- Web already keeps real CSS `backgroundImage` strings and lets the browser paint them.

This is documented directly in:
- [packages/nitro-css/README.md](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/README.md)

Key finding from the current implementation:
- NitroCSS already supports native gradient descriptors end to end.
- The compiler lowers gradient pieces into marker props.
- The JS runtime folds those markers into a compact descriptor on native, or a CSS `backgroundImage` string on web.
- The C++ engine mirrors the same fold and registers the result with a native gradient applier.
- `View` strips the gradient marker before styles reach React Native props.

Relevant implementation files:
- [parseStyles.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/compiler/parseStyles.ts)
- [gradient.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/compiler/parsers/gradient.ts)
- [normalize.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/core/normalize.ts)
- [View.tsx](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/components/View.tsx)
- [NitroCssEngine.cpp](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/NitroCssEngine.cpp)
- [GradientTargets.hpp](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/gradient/GradientTargets.hpp)
- [NitroCssGradientApplier.mm](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/ios/NitroCssGradientApplier.mm)
- [GradientApplierJNI.cpp](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/android/src/main/cpp/GradientApplierJNI.cpp)

### What this means

For `.btn-gradient-2`, integration is already aligned with NitroCSS's architecture because:
- it uses gradients, not URL images
- gradients are already first-class in the native engine
- border-radius clipping is already part of the native gradient paint path

For general `background-image: url(...)`, NitroCSS does not yet have the equivalent native image paint path.

## How to integrate this into NitroCSS now

### Immediate recommendation

Do this now:
- Use the recommended layered-gradient pattern for gradient borders.
- Keep using NitroCSS's existing gradient pipeline for that case.
- Do not try to route `.btn-gradient-2` through `border-image`.

That means the current implementation path for `.btn-gradient-2` should stay:

1. CSS compiler reads the gradient declarations.
2. Gradient parser lowers them into NitroCSS marker props.
3. JS/native fold emits the compact gradient descriptor.
4. Native gradient applier paints the view background layer.
5. Border radius clips the painted result.

This fits NitroCSS today with no new architecture needed.

## How `background-image: url(...)` should integrate into NitroCSS

This needs a separate native feature, not a small parser tweak.

Why:
- gradients are numeric paint descriptors
- image URLs need asset resolution, sizing rules, repeat behavior, and platform image loading
- React Native does not accept full CSS `background-image` behavior directly on `View`

So the correct integration plan is:
- keep gradients on the current native gradient path
- add a new native background-image descriptor path for real images

## Best integration structure for NitroCSS

Use two parallel feature paths:

### Path 1 — Gradient backgrounds

Keep the current architecture.

Descriptor shape:
- gradient type
- angle or radial center
- colors
- stop locations
- border radius or clip information as needed by the painter

This is already effectively implemented.

### Path 2 — Image backgrounds

Add a new background image descriptor for native.

Recommended descriptor fields:

```ts
interface BackgroundImageDescriptor {
  kind: "image";
  source: string;
  resizeMode: "cover" | "contain" | "stretch" | "center";
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y" | "round" | "space";
  positionX: string | number;
  positionY: string | number;
  sizeWidth?: string | number;
  sizeHeight?: string | number;
}
```

Practical note:
- Native v1 should probably not start with every CSS repeat mode.
- `no-repeat`, `repeat`, `cover`, `contain`, and centered positioning are the best first slice.

## NitroCSS rollout plan

### Phase 1 — Keep gradients as-is and document the supported pattern

Scope:
- `.btn-gradient-2`
- linear gradients
- radial gradients
- layered gradient-border technique

Work:
- no engine architecture change required
- only standardize how users author the CSS

### Phase 2 — Add compile-time support for `background-image: url(...)`

Compiler work:
- detect `background-image: url(...)`
- preserve multiple image layers if possible
- parse companion properties:
  - `background-size`
  - `background-repeat`
  - `background-position`
- emit a NitroCSS background-image marker or descriptor

Likely files:
- [parseStyles.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/compiler/parseStyles.ts)
- [toRNValue.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/compiler/toRNValue.ts)
- add a new parser near [gradient.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/compiler/parsers/gradient.ts)

### Phase 3 — Add runtime/native descriptor folding

JS/runtime work:
- fold image markers into a background-image descriptor on native
- keep outputting normal CSS `backgroundImage` on web

Likely files:
- [normalize.ts](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/core/normalize.ts)
- [View.tsx](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/src/components/View.tsx)

C++ work:
- mirror the same fold in the native engine
- register the image descriptor similarly to the gradient descriptor

Likely files:
- [NitroCssEngine.cpp](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/NitroCssEngine.cpp)
- add a sibling registry to [GradientTargets.hpp](/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitro-css/cpp/gradient/GradientTargets.hpp) or generalize it into a broader background-paint registry

### Phase 4 — Add platform painters

iOS:
- render image backgrounds on the target view's own layer
- likely via `CALayer.contents`, sublayers, or a dedicated painter view/layer
- apply sizing, repeat, and clipping

Android:
- render via `Drawable`, `BitmapShader`, or layered `Drawable` composition
- apply repeat/tile mode and scaling

Important:
- this should mirror the existing gradient strategy of painting on the target view's own background layer, not by creating an unrelated wrapper tree

## Best v1 feature slice for NitroCSS image backgrounds

To keep this practical, start with this subset only:

Supported:
- `background-image: url(...)`
- one image layer
- `background-size: cover`
- `background-size: contain`
- `background-size: 100% 100%`
- `background-repeat: no-repeat`
- `background-repeat: repeat`
- `background-position: center`

Defer:
- multiple image URLs on native
- mixed image + gradient multi-layer native composition
- `round` and `space` repeat modes
- full CSS shorthand parsing for every background sub-property combination
- `border-box` / `padding-box` clipping for image layers beyond the simple box case

This v1 slice gives the most value with the smallest engine complexity.

## Best authoring plan for NitroCSS users

Use this guidance in NitroCSS:

For gradient pill borders:
- use the current gradient path
- prefer explicit longhand

For real images:
- use `url(...)`
- always pair it with `background-size`, `background-repeat`, and `background-position`

Recommended authoring examples:

```css
.hero-cover {
  background-image: url("/images/hero.jpg");
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.logo-fit {
  background-image: url("/images/logo.png");
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.texture {
  background-image: url("/images/noise.png");
  background-repeat: repeat;
  background-size: auto;
}
```

## Final NitroCSS plan

1. Keep `.btn-gradient-2` on the existing NitroCSS native gradient path.
2. Treat gradient borders and URL image backgrounds as two separate engine features.
3. Add a new background-image descriptor path for native images instead of overloading the gradient descriptor.
4. Start with a narrow native image subset: single image, cover/contain/stretch, no-repeat/repeat, centered positioning.
5. Expand to layered image composition only after the first image-background path is stable.

## Sources

- [W3Schools: background-image](https://www.w3schools.com/cssref/pr_background-image.php)
- [MDN: background](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background)
- [MDN: background-image](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-image)
- [MDN: background-clip](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-clip)
- [MDN: background-origin](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-origin)
- [MDN: background-size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-size)
- [MDN: background-repeat](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-repeat)
- [MDN: background-position](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-position)
- [MDN: linear-gradient()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/gradient/linear-gradient)
- [MDN: border-image](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/border-image)
- [Can I Use: CSS3 Multiple backgrounds](https://caniuse.com/multibackgrounds)
- [Can I Use: CSS3 Border images](https://caniuse.com/border-image)
- [W3C: CSS Backgrounds and Borders Level 3](https://www.w3.org/TR/css-backgrounds-3/)
