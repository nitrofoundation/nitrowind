#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

/**
 * nitrocss::css — self-contained CSS color value parser.
 *
 * Parses every color syntax the JS compiler can emit and lowers it to packed
 * 8-bit sRGB. Supported syntaxes:
 *
 *   - #rgb / #rgba / #rrggbb / #rrggbbaa
 *   - named colors (CSS Color 4 table) + `transparent`
 *   - rgb() / rgba()  — modern (space/slash) and legacy (comma) syntax
 *   - hsl() / hsla()  — modern and legacy syntax
 *   - hwb()
 *   - oklch() / oklab() / lab() / lch()          ← RN's native parser gap
 *   - color(srgb …) / color(srgb-linear …) / color(display-p3 …)
 *
 * Parity contract: the parse grammar, channel scaling, conversion matrices,
 * transfer functions, gamut handling and rounding replicate culori 4.0.2
 * (node_modules/culori/src) *exactly*, so the hex produced here is
 * byte-for-byte identical to the JS compiler's culori
 * `formatHex`/`formatHex8` pre-lowering (see src/compiler/toRNValue.ts).
 * In particular out-of-gamut results are clipped per channel to [0,1]
 * (culori formatHex behavior), NOT gamut-mapped by chroma reduction as
 * CSS Color 4 specifies.
 *
 * Not supported (callers must leave such values untouched): currentColor,
 * system colors, relative color syntax, rec2020/a98/prophoto/
 * xyz color() spaces.
 */
namespace nitrocss::css {

/**
 * Packed sRGB color, 8 bits per channel (the same shape as RN's
 * react/renderer/css CSSColor and culori's serializeHex fixup output).
 */
struct Rgba {
  uint8_t r;
  uint8_t g;
  uint8_t b;
  uint8_t a;

  bool operator==(const Rgba& other) const {
    return r == other.r && g == other.g && b == other.b && a == other.a;
  }
};

/**
 * Parse a CSS color value to packed RGBA. Returns std::nullopt on any value
 * the grammar does not cover (unknown function, malformed syntax, keyword).
 * Alpha defaults to 255 when the syntax carries no alpha.
 */
std::optional<Rgba> parseColor(std::string_view css);

/**
 * Serialize to the hex form both RN RawProps and the JS runtime accept:
 * `#rrggbb` when fully opaque, `#rrggbbaa` otherwise.
 */
std::string toHexString(const Rgba& color);

/**
 * parseColor + serialize with culori/JS parity for the hex-length decision:
 * the JS compiler emits `formatHex8` only when the *unquantized* alpha is
 * present and < 1 (toRNValue.ts), so e.g. `rgb(0 0 0 / 0.999)` serializes as
 * `#000000ff` (8 digits) while `rgb(0 0 0)` is `#000000`. Use this for any
 * value that must match the JS pre-lowered bytes exactly.
 */
std::optional<std::string> parseColorToHex(std::string_view css);

/**
 * Resolve CSS Color 5 `color-mix()` to sRGB hex. Supports the interpolation
 * spaces emitted by Tailwind (`oklab`, `srgb`, `srgb-linear`), optional stop
 * percentages, nested color functions and alpha-premultiplied interpolation.
 */
std::optional<std::string> parseColorMixToHex(std::string_view css);

/**
 * True when the trimmed value starts with one of the color function names the
 * parser understands (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `hwb(`, `oklch(`,
 * `oklab(`, `lab(`, `lch(`, `color(`), case-insensitively. Hex and named
 * colors return false — they pass through the engine untouched.
 */
bool looksLikeColorFunction(std::string_view value);

} // namespace nitrocss::css
