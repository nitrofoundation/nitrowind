# Engine v2 Research: Our own C++ CSS value parser

**Goal.** Move CSS value parsing (colors, lengths, angles, transforms, gradients,
filters) into the Nitrowind C++ engine (`packages/nitrocss/cpp/`), modeled on
React Native's `react/renderer/css/`. This lets the JS compiler emit **raw CSS
values** instead of pre-lowering them (culori `formatHex/formatHex8` in
`toRNValue.ts`), and removes any dependency on RN's native parser reaching modern
color functions. We parse at commit time inside `NitroCssEngine::resolve()`.

All paths absolute. Design is rename-agnostic (type/file names illustrative).

---

## 1. RN's native CSS value parser — our model

Location (source tree, and confirmed **shipped in the prebuilt framework**):
- Source headers: `/Users/ashwithsaldanha/MyWork/nitrowind/node_modules/react-native/ReactCommon/react/renderer/css/`
- Prebuilt (example app): `/Users/ashwithsaldanha/MyWork/nitrowind/apps/example/ios/Pods/React-Core-prebuilt/React.xcframework/Headers/React_renderercss/react/renderer/css/`
- Public Pods headers: `/Users/ashwithsaldanha/MyWork/nitrowind/apps/example/ios/Pods/Headers/Public/React-renderercss/react/renderer/css/`

All 27 `CSS*.h` are present in **both** the prebuilt xcframework and the public
Pods headers (verified by directory listing). The pod is `React-renderercss`
(podspec: `node_modules/react-native/ReactCommon/react/renderer/css/React-renderercss.podspec`),
`header_dir = "react/renderer/css"`, module `React_renderercss`, depends on
`React-debug` + `React-utils`.

### 1a. Type inventory (`CSS*.h`)

| Header | Type / role |
|---|---|
| `CSSToken.h` | `CSSTokenType` enum (Number, Dimension, Percentage, Ident, Hash, Function, Comma, parens, Delim, WhiteSpace, EndOfFile) + `CSSToken` (type + string/numeric/unit payload; **non-owning `string_view`**, valid only for tokenizer lifetime). |
| `CSSTokenizer.h` | `CSSTokenizer` — `constexpr`, W3C css-syntax-3 subset. `next()` yields one token. Numbers via `fast_float::from_chars_advanced`. Handles `#hash`, `func(`, dimension (`10px`), percentage (`50%`). |
| `CSSSyntaxParser.h` | `CSSSyntaxParser` — component-value layer. `consumeComponentValue<ReturnT>(delimiter, visitors…)` dispatches to function / simple-block / preserved-token visitors. `CSSDelimiter` enum (None, Whitespace, OptionalWhitespace, Comma, Solidus, SolidusOrWhitespace, CommaOrWhitespace). Block parsing via a child parser with a terminator token. `consumeDelimiter`, `consumeWhitespace`, `peek`, `isFinished`. |
| `CSSDataType.h` | Concepts: `CSSDataType<T>`, `CSSValidDataTypeParser`, and the `CSSDataTypeParser<T>` trait to be specialized per type. Sinks: `CSSPreservedTokenSink`, `CSSFunctionBlockSink`, `CSSSimpleBlockSink`, `CSSParserSink`. |
| `CSSCompoundDataType.h` | `CSSCompoundDataType<Ts…> = std::variant<Ts…>`; `CSSMergedDataTypes`, `CSSVariantWithTypes` template plumbing to flatten allowed-type lists. |
| `CSSValueParser.h` | `CSSValueParser` — typed layer over the syntax parser. `parseNextValue<Types…>(delimiter)` / `peekNextValue<…>` return `std::variant<std::monostate, Types…>`. Free fn **`parseCSSProperty<Types…>(std::string_view)`** = full-string entry point (whitespace-trim, parse one value, require `isFinished()`), returns `monostate` on syntax error. **This is the API shape we mirror.** |
| `CSSNumber.h` / `CSSPercentage.h` / `CSSRatio.h` | scalar `<number>`, `<percentage>`, `<ratio>`. |
| `CSSLength.h` | `CSSLength{float value; CSSLengthUnit unit;}`. Parser: Dimension token → unit via `parseCSSLengthUnit`; bare `0` → `0px`. |
| `CSSLengthUnit.h` | `CSSLengthUnit` enum (Px, Rem, Em, Pt, Vh, Vw, …44 units) + `parseCSSLengthUnit(string_view)` via `fnv1aLowercase` switch. |
| `CSSLengthPercentage.h` | `using CSSLengthPercentage = CSSCompoundDataType<CSSLength, CSSPercentage>`. |
| `CSSAngle.h` / `CSSAngleUnit.h` | `CSSAngle{float degrees;}`; canonicalizes deg/grad/rad/turn to degrees. |
| `CSSColor.h` | **`CSSColor{uint8_t r,g,b,a;}`** — the RGBA target. Parser dispatches: Ident → `parseCSSNamedColor`, Hash → `parseCSSHexColor`, Function → `parseCSSColorFunction`. `CSSColor::black() = {0,0,0,255}`. |
| `CSSHexColor.h` | `parseCSSHexColor<CSSColor>` — 3/4/6/8-digit hash → RGBA. |
| `CSSNamedColor.h` | named-color table → RGBA. |
| `CSSColorFunction.h` | `parseCSSColorFunction<CSSColor>(name, parser)` — see 1c. |
| `CSSTransform.h` | `CSSMatrix, CSSTranslate(3D), CSSTranslateX/Y, CSSScale(X/Y), CSSRotate(X/Y/Z), CSSSkewX/Y, CSSPerspective`; `CSSTransformFunction` variant; `CSSTransformList = CSSWhitespaceSeparatedList<CSSTransformFunction>`. |
| `CSSTransformOrigin.h` | `<transform-origin>`. |
| `CSSFilter.h` | `CSSBlur/Brightness/Contrast/DropShadow/Grayscale/HueRotate/Invert/Opacity/Saturate/Sepia`; `CSSFilterFunction` variant; `CSSFilterList = CSSWhitespaceSeparatedList<…>`. |
| `CSSShadow.h` | `CSSShadow{offsetX, offsetY, blurRadius, spreadDistance: CSSLength; CSSColor color; bool inset;}`; `CSSShadowList = CSSCommaSeparatedList<CSSShadow>`. `consume(parser)` loops length/color/`inset` keyword in any order. |
| `CSSBackgroundImage.h` | linear/radial gradient descriptors (30 KB; stops, positions, directions). |
| `CSSKeyword.h` / `CSSFontVariant.h` / `CSSList.h` / `CSSZero.h` / `CSSDummy.cpp` | keywords, `<0>` special length, list combinators (whitespace/comma separated), compile unit. |

### 1b. Architecture: tokenizer → syntax parser → typed value parser

Three layers, all header-only and mostly `constexpr`:

1. **`CSSTokenizer`** (`CSSTokenizer.h`) — raw string_view → `CSSToken` stream.
   Numbers use `fast_float`; recognizes dimension/percentage/hash/function.
2. **`CSSSyntaxParser`** (`CSSSyntaxParser.h`) — groups tokens into *component
   values* (preserved token / simple block `[]{}()` / function block `name(…)`),
   handling delimiters and nested block scopes via child parsers.
3. **`CSSValueParser`** (`CSSValueParser.h`) — typed layer. For a caller-provided
   allowed-type list it tries each type's `CSSDataTypeParser<T>` specialization in
   order (`consumeValue` → `tryConsumeParser` / `tryConsumePreservedToken` /
   `tryConsumeSimpleBlock` / `tryConsumeFunctionBlock`), returning
   `std::variant<std::monostate, Types…>`.

Per-type parsers are `CSSDataTypeParser<T>` specializations (`CSSDataType.h`
concept). Each declares which component-value kinds it accepts (preserved token,
function block, simple block, or spans-multiple-values via `consume(parser)`).

Public property entry point — the shape we copy:

```cpp
// CSSValueParser.h:190
template <CSSMaybeCompoundDataType... AllowedTypesT>
constexpr auto parseCSSProperty(std::string_view css)
    -> CSSVariantWithTypes<CSSMergedDataTypes<CSSWideKeyword, AllowedTypesT...>, std::monostate>
{
  CSSSyntaxParser syntaxParser(css);
  CSSValueParser parser(syntaxParser);
  syntaxParser.consumeWhitespace();
  auto value = parser.parseNextValue<CSSWideKeyword, AllowedTypesT...>();
  syntaxParser.consumeWhitespace();
  if (syntaxParser.isFinished()) return value;   // require whole string consumed
  return {};                                     // else syntax error
}
```

Usage pattern: `parseCSSProperty<CSSColor>("oklch(...)")`,
`parseCSSProperty<CSSLengthPercentage>("50%")`,
`parseCSSProperty<CSSTransformList>("translateX(10px) rotate(45deg)")`.

### 1c. Colors → RGBA (`CSSColorFunction.h`)

`parseCSSColorFunction<CSSColor>(name, parser)` (`CSSColorFunction.h:382`)
switches on `fnv1aLowercase(functionName)`:

- **`rgb`/`rgba`** → `parseRgbFunction`. Auto-detects legacy (comma) vs modern
  (space) syntax via `isLegacyColorFunction` (peeks for a comma after the first
  value). `normalizeComponent` maps number→raw, percentage→`%/100*base`.
  `clamp255Component` rounds toward +∞ and clamps to `[0,255]`; alpha via
  `clampAlpha` (default 255).
- **`hsl`/`hsla`** → `parseHslFunction` → `hslToRgb` (hue normalized via
  `normalizeHue` = `remainder(h,360)/360`).
- **`hwb`** → `hwbToRgb`.

Helpers we can reuse verbatim: `clamp255Component`, `normalizeHue`,
`hueToRgb`, `hslToRgb`, `hwbToRgb`, `normalizeComponent`, `clampAlpha`.

> **Critical gap (line 399):**
> ```cpp
> // TODO T213000437: support lab(), lch(), oklab(), oklch(), color(), color-mix()
> default:
>   return {};   // ← unsupported functions parse to NOTHING
> ```
> RN's native color parser understands **hex, named, rgb/rgba, hsl/hsla, hwb**
> only. `oklch()`, `oklab()`, `lab()`, `lch()`, `color()`, `color-mix()` — the
> functions **Tailwind v4 emits by default** — return `monostate` (dropped).
> This is exactly why our JS side currently pre-lowers to hex (§2), and exactly
> what our own parser must add (§3).

---

## 2. What our JS side pre-lowers today, and why

### 2a. `toRNValue.ts` — `packages/nitrocss/src/compiler/toRNValue.ts`

`toRNValue(rnProperty, rawValue, ctx)` (line 129) coerces one CSS value string to
the RN representation. Color handling (lines 143–150):

```ts
if (looksLikeColor(rnProperty, value)) {
  const parsed = parseColor(value);            // culori
  if (parsed) {
    return parsed.alpha !== undefined && parsed.alpha < 1
      ? formatHex8(parsed)                      // #rrggbbaa
      : formatHex(parsed);                      // #rrggbb
  }
}
```

- `looksLikeColor` (line 208): true if `rnProperty ∈ COLOR_PROPERTIES` (line 183:
  `color`, `backgroundColor`, all `border*Color`, `shadowColor`, `tintColor`,
  `fill`, `stroke`, …) **or** the value matches
  `/^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(/i` or a hex.
- Lengths: `lengthToPx` collapses `rem/em → *rem`, `px/pt/unitless → number`;
  `%` stays a string; unitless allowed only for `UNITLESS` props (line 50).
- The comment (lines 140–142) states the reason: *"normalize anything culori
  understands to a hex form both JS and Fabric-native RawProps parsing accept.
  This matters because the native engine may merge the JS first-paint style back
  into later C++ commits."* → **JS + native must agree on the byte value.**

### 2b. `normalizeColorValue` + theme lowering

`normalizeColorValue(value)` (line 230) lowers **function-form** colors
(`COLOR_FUNCTION_RE`, line 217) to hex via culori. Its doc (lines 219–228) is the
canonical statement of the problem:

> *"React Native's native (Fabric C++) color parser handles hex and named colors
> but not the modern CSS color functions Tailwind v4 emits (`oklch`, `oklab`,
> `lab`, `lch`, `color()`)… Theme variable values are substituted verbatim on the
> native side (they never go through `toRNValue`), so any such value is dropped at
> commit time unless it is pre-converted."*

Used by `themes.ts` (`normalizeThemeValue`, lines 9–15): **every theme `var`
value is pre-lowered to hex at compile time** so that when the C++ engine
substitutes `var(--color-…)` verbatim (§2c) the result is already native-safe.

### 2c. C++ engine today — `packages/nitrocss/cpp/NitroCssEngine.cpp`

`resolve()` (line 471) **passes values through**; it does **not** parse colors:

- `resolveVarsInString` (line 28): regex `var(--x, fallback)` substitution from
  the theme map. Substitutes the (already-hex) theme value verbatim (line 507).
- No color/length/angle conversion. `resolveInsetValue` (safe-area descriptors,
  numeric only), `foldTransform` (line 95, reorders per-axis props into RN's
  `transform` array — values passed through), `foldGradient` (line 175, string
  composition; comment line 170: *"Colors are already lowered to hex … so this is
  pure string composition"*), `normalizeShadow` (line 142, splices a pre-lowered
  `--nitrowind-shadow-color` into the `boxShadow` string).
- `isUnsupportedNativeColorValue` (line 131): Android-only drop of `color-mix(`.
- **`kBoxShadowColorPattern` (line 111)** already enumerates the exact function
  set we must handle: `#hex | rgba?() | hsla?() | oklch() | oklab() | lab() |
  lch() | color()`.

**Summary of the current contract:** JS lowers **all** colors (literals via
`toRNValue`, theme vars via `normalizeColorValue`) to hex, and pre-composes
gradient/shadow color slots, precisely because the C++ commit path trusts the
values and RN-native can't parse modern color functions. The engine is a
string-shuffler, not a value parser.

---

## 3. Design: our own C++ value-parser module

### 3a. Build-vs-borrow-vs-depend decision

Three options for the parser core:

1. **Depend on RN's `react/renderer/css/` headers directly.**
   *Feasible on iOS* — headers are shipped in the prebuilt xcframework and public
   Pods (§1). *Risks:* (a) the color function set is incomplete — `oklch/oklab/
   lab/lch/color()` are `TODO` (line 399), so we'd still need our own color path;
   (b) header-only `constexpr` templates require **C++20 + libc++ concepts**
   parity with RN's toolchain, and pull in `React-debug`/`React-utils`
   (`fnv1a.h`, `iequals.h`, `TemplateStringLiteral.h`); (c) **not** vendored under
   `node_modules` on Android CMake the same way — availability across build
   systems is uneven; (d) private API with no stability guarantee. **Rejected as a
   hard dependency**, but the layer split and helper math are our template.

2. **Port/vendor a trimmed copy** of the three layers (tokenizer, syntax parser,
   value parser) plus only the types we need. Keeps RN's proven correctness and
   `constexpr` design; drops the template metaprogramming we don't need. Adds the
   missing modern-color path ourselves. **Recommended for the color/length/angle
   core**, because the tokenizer + `hslToRgb`/`hwbToRgb`/`clamp255Component` math
   is worth reusing exactly (byte-parity with any RN path we still touch).

3. **Write a minimal hand-rolled parser** — a small recursive-descent scanner
   tailored to the value shapes Tailwind v4 + our compiler emit. Smallest binary,
   no template/concepts burden, easiest to share identical code with JS. Best for
   the parts RN can't do anyway (oklch/oklab/lab/lch/color).

**Chosen approach:** a self-contained module `nitrocss::css` under
`packages/nitrocss/cpp/css/` (rename-agnostic), no RN dependency. Reuse RN's
*algorithms* (copy the small color-math helpers, mirror the layer split and the
`parseCSSProperty<T>` entry-point shape) but own the code so it compiles
identically under the existing `nitrocss` CMake (C++20, `-fexceptions -frtti`) on
iOS and Android, and so we can add the modern-color path. Fall back to keeping the
same numeric algorithms culori uses so JS first-paint and C++ commit stay
byte-identical (§4).

### 3b. Module shape (`packages/nitrocss/cpp/css/`)

```
packages/nitrocss/cpp/css/
  CssTokenizer.hpp        // port of CSSTokenizer.h (no fast_float dep → strtof/from_chars)
  CssSyntaxParser.hpp     // component-value layer (function/block/token + delimiters)
  CssValueParser.hpp      // parseCssProperty<...>() entry points
  Color.hpp / Color.cpp   // Rgba{uint8_t r,g,b,a}; parseColor(sv) -> optional<Rgba>
  Length.hpp              // Length{float value; Unit}; parseLength / resolveToPx(remCtx)
  Angle.hpp               // Angle{float degrees}; deg/grad/rad/turn canonicalization
  Transform.hpp           // transform-function list -> folly::dynamic array (RN order)
  Gradient.hpp            // keep the descriptor model (foldGradient stays)
  Filter.hpp              // filter-function list (blur/brightness/… ) if/when needed
```

Public façade (one entry the engine calls):

```cpp
namespace nitrocss::css {

struct Rgba { uint8_t r, g, b, a; };

// Colors — the important one. Handles: #hex(3/4/6/8), named,
// rgb/rgba, hsl/hsla, hwb, AND oklch/oklab/lab/lch/color(srgb|display-p3|…).
std::optional<Rgba> parseColor(std::string_view css);

// Serialize back to the form native RawProps + JS both accept (#rrggbb / #rrggbbaa).
std::string toHex(Rgba c);

// Lengths/angles resolved with the engine's rem (and, later, vw/vh/insets).
struct LengthCtx { double rem; /* future: vw, vh, insets, fontScale */ };
std::optional<double> resolveLengthPx(std::string_view css, const LengthCtx&);

// Optional structured parses for transform / filter lists → folly::dynamic.
} // namespace nitrocss::css
```

### 3c. Modern color math (the part RN lacks)

Add the CSS Color 4 conversions RN leaves as `TODO`. Pipeline per function:

- **`oklch(L C H / a)`** → OKLCH→OKLab (`a=C·cos(H)`, `b=C·sin(H)`) → OKLab→linear
  sRGB (the standard 3×3 LMS matrices + cube of `l_,m_,s_`) → linear→gamma sRGB
  (the `≤0.0031308 ? 12.92·x : 1.055·x^(1/2.4)−0.055` transfer) → ×255 + clamp.
- **`oklab(L a b / α)`** → skip the LCh→Lab step; same tail.
- **`lch(L C H / α)` / `lab(L a b / α)`** → CIE Lab/LCh → XYZ (D50) → chromatic
  adaptation D50→D65 (Bradford) → linear sRGB → gamma → 255.
- **`color(colorspace c1 c2 c3 / α)`** → `srgb` passthrough (gamma) ; `srgb-linear`
  → gamma ; `display-p3` → P3-linear → XYZ → sRGB-linear → gamma. Others (rec2020,
  a98, prophoto, xyz) as needed.
- **Gamut clamp:** after conversion, clamp each channel to `[0,1]` (matches
  culori's default `formatHex` behavior — simple per-channel clip, *not* CSS-4
  gamut-mapping-by-chroma-reduction). See §4 open Q.

`normalizeHue`, `clamp255Component`, `hslToRgb`, `hwbToRgb` are copied from
`CSSColorFunction.h` for the legacy functions so those paths stay identical.

### 3d. How it plugs into `NitroCssEngine::resolve()`

Today `resolve()` (`NitroCssEngine.cpp:497–515`) copies each style value through,
only doing `var()` substitution. New flow — **parse at commit time**:

```cpp
for (const auto& pair : bucket.style.items()) {
  const std::string key = pair.first.asString();
  folly::dynamic value = pair.second;

  // 1) var() substitution (unchanged)
  if (value.isString() && value.getString().find("var(") != npos)
    value = resolveVarsInString(value.getString(), vars);   // raw CSS still

  // 2) NEW: type-directed parse when the value is a string
  if (value.isString()) {
    const std::string& s = value.getString();
    if (isColorProp(key) || looksLikeColorValue(s)) {
      if (auto c = css::parseColor(s))            // ← oklch/oklab/lab/lch/color OK
        value = css::toHex(*c);                   // #rrggbb(aa) for RawProps parity
      // else leave as-is (named/keyword the native side may still handle)
    } else if (isLengthProp(key)) {
      if (auto px = css::resolveLengthPx(s, {rem_}))
        value = *px;                              // number
    }
  }
  style[key] = value;
}
```

`isColorProp` reuses the existing `isNativeColorProp` list (line 114).
`foldTransform`/`foldGradient`/`normalizeShadow` stay; but the color slots they
splice can now be raw CSS (colors are parsed here first), so `--nitrowind-shadow-
color` and `--nw-gradient-*` markers may carry `oklch(...)` and get lowered by the
same `css::parseColor` before/inside those folds.

**Why at commit time and not compile time:** theme `var()` values are only known
after substitution against the *live* theme; parsing after substitution means the
compiler never has to pre-lower, and a theme swap that injects an `oklch()` value
resolves correctly on the native commit.

### 3e. What the JS compiler then emits (raw CSS)

- `toRNValue.ts`: **delete** the culori color branch (lines 143–150) and
  `normalizeColorValue` (line 230); emit the trimmed CSS color string verbatim
  (still resolve `var()` at compile time for literals, still do length→px for the
  JS first-paint fast path — see §4). `looksLikeColor` stays only to *route*, not
  to lower.
- `themes.ts`: `normalizeThemeValue` stops calling `normalizeColorValue`; theme
  vars ship as raw `oklch()/oklab()/…`.
- `boxShadow.ts` / `gradient.ts`: stop importing culori; emit raw color slots.
- Remove the `culori` dependency from `packages/nitrocss` once the JS
  first-paint path (§4) also uses a shared JS port of `css::parseColor`, so JS and
  C++ run the *same* algorithm.

---

## 4. Ordered build steps + open questions

### Build steps (each independently landable)

1. **Scaffold module.** Create `packages/nitrocss/cpp/css/` and add its sources to
   `packages/nitrocss/cpp/CMakeLists.txt` (`add_library(nitrocss …)` currently
   lists only `NitroCssEngine.cpp`). Keep C++20, `-fexceptions -frtti`.
2. **Tokenizer + syntax layer.** Port `CSSTokenizer.h` + `CSSSyntaxParser.h`
   trimmed (drop `fast_float`; use `std::from_chars`/`strtof`). Unit-test against
   `node_modules/react-native/ReactCommon/react/renderer/css/tests/` fixtures.
3. **Color core (legacy).** `Color.{hpp,cpp}`: hex (port `CSSHexColor.h`), named
   (port `CSSNamedColor.h`), rgb/hsl/hwb (port `CSSColorFunction.h` helpers).
   Golden-test byte-for-byte vs culori `formatHex/formatHex8`.
4. **Color core (modern).** Add oklch/oklab/lab/lch/color() (§3c). Golden-test vs
   culori for a Tailwind v4 palette. **This closes RN's `TODO T213000437` gap.**
5. **Length + angle.** Port `CSSLength.h`/`CSSLengthUnit.h`/`CSSAngle.h`;
   `resolveLengthPx` with `rem_` (extend later to vw/vh/insets/fontScale).
6. **Wire into `resolve()`.** Implement §3d in `NitroCssEngine.cpp`; add
   `isColorProp`/`isLengthProp`/`looksLikeColorValue` helpers (reuse `isNativeColorProp`).
7. **JS compiler emits raw.** Strip culori lowering from `toRNValue.ts`,
   `themes.ts`, `boxShadow.ts`, `gradient.ts` (§3e).
8. **Shared JS first-paint.** Port `css::parseColor` to TS (or wasm) so the JS
   first-paint resolver produces the *same* bytes as the C++ commit; drop culori.
9. **Transform/filter (optional).** Structured parse only if we want validation;
   `foldTransform`/`foldGradient` already produce RN shapes from raw values.
10. **Remove `color-mix` Android special-case** (`isUnsupportedNativeColorValue`,
    line 131) once our parser handles `color-mix()` itself.

### Open questions

- **oklch→sRGB math & culori parity.** culori uses per-channel clip on
  `formatHex` (not CSS-4 chroma-reduction gamut mapping). To keep JS first-paint
  == native commit we must replicate culori's exact matrices, transfer function,
  rounding, and clip — *not* the spec's gamut-map. Decide: match culori (parity,
  step 8) or match the CSS spec (correctness) — cannot silently do both.
- **Gamut clamping.** Simple `[0,1]` clip vs CSS Color 4 gamut mapping (reduce
  chroma in OKLCh until in-gamut). Clip is what culori/`formatHex` do and is
  cheaper; document the choice. Wide-gamut `color(display-p3 …)` on a P3 display
  loses saturation under sRGB clip — acceptable for RN (sRGB pipeline) but note it.
- **Performance at commit time.** `resolve()` holds `mutex_` and runs on every
  commit for every node's className. Parsing strings per commit adds cost vs
  today's passthrough. Mitigation: (a) **cache** parsed results keyed by the raw
  value string (colors are highly repeated across nodes); (b) only parse
  color/length props (route via prop-name set first); (c) parse lazily/once per
  distinct `(className, theme)` if we memoize resolved styles.
- **First-paint vs native-commit parity.** The existing hazard (`toRNValue.ts`
  comment lines 140–142: native may merge JS first-paint style into later
  commits) is the whole reason bytes must match. Steps 7–8 must land together, or
  a value the JS side leaves raw and the C++ side lowers (or vice-versa) will
  produce a visible flip between first paint and first native commit.
- **Named colors & keywords we *don't* parse.** For values our color parser can't
  resolve (`currentColor`, `transparent` edge cases, platform colors like
  `PlatformColor`), fall through untouched so the native side keeps its current
  behavior — must enumerate the passthrough set explicitly.
- **`string_view` lifetime.** RN's `CSSToken` holds non-owning `string_view` into
  the source; our engine parses from `std::string` values held in `folly::dynamic`
  during `resolve()`, so the source outlives the parse — safe, but the port must
  preserve that invariant (no dangling views past the `folly::dynamic` value).

STATUS: DONE
