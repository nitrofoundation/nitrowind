// Standalone parity check for nitrocss::css::parseColorToHex vs. culori 4.0.2
// (the library the JS compiler uses to pre-lower colors in toRNValue.ts). NOT
// part of the pod/gradle build (cpptests/ is outside the cpp/** and ios/**
// globs). Run manually:
//   clang++ -std=c++20 -I ../../nitro-css/cpp/css css_color_test.cpp \
//     ../../nitro-css/cpp/css/CssColor.cpp -o /tmp/css_color_test && /tmp/css_color_test
//
// Every expected value below was produced by running node against the repo's
// own node_modules/culori (src/index.js) with the exact serialization rule
// from packages/nitro-css/src/compiler/toRNValue.ts:
//   alpha !== undefined && alpha < 1 ? formatHex8(parsed) : formatHex(parsed)
// (generator: parse(css) -> formatHex/formatHex8; "FAIL" = culori returned
// undefined). Cases marked [scope] are intentionally unsupported by our
// parser even though culori parses them; they must return nullopt so the
// engine passes them through untouched.
#include "CssColor.hpp"
#include <cstdio>
#include <string>

using nitrocss::css::parseColor;
using nitrocss::css::parseColorToHex;
using nitrocss::css::toHexString;

static int failures = 0;
static int total = 0;

// expected == nullptr means: parser must reject (culori FAIL or [scope]).
static void check(const char* css, const char* expected) {
  total++;
  auto got = parseColorToHex(css);
  if (expected == nullptr) {
    if (got.has_value()) {
      std::printf("FAIL %-42s got %s want <no-parse>\n", css, got->c_str());
      failures++;
    } else {
      std::printf("ok   %-42s <no-parse>\n", css);
    }
    return;
  }
  if (!got.has_value()) {
    std::printf("FAIL %-42s got <no-parse> want %s\n", css, expected);
    failures++;
  } else if (*got != expected) {
    std::printf("FAIL %-42s got %s want %s\n", css, got->c_str(), expected);
    failures++;
  } else {
    std::printf("ok   %-42s = %s\n", css, got->c_str());
  }
}

int main() {
  // --- hex ---------------------------------------------------------- culori
  check("#f00", "#ff0000");
  check("#abcd", "#aabbccdd");
  check("#3b82f6", "#3b82f6");
  check("#ff000080", "#ff000080");
  check("#112233FF", "#112233"); // alpha == 1 -> 6-digit form

  // --- named ----------------------------------------------------------------
  check("rebeccapurple", "#663399");
  check("Tomato", "#ff6347"); // case-insensitive lookup
  check("transparent", "#00000000");

  // --- rgb()/rgba(), modern + legacy ------------------------------------------
  check("rgb(255 0 0)", "#ff0000");
  check("rgb(59 130 246 / 0.5)", "#3b82f680");
  check("rgba(16, 185, 129, 0.35)", "#10b98159"); // legacy comma syntax
  check("rgb(100% 50% 0%)", "#ff8000");
  check("rgb(300 -20 50)", "#ff0032"); // out-of-range channels clip at 0/255
  check("rgb(41.7% 8% 92.1% / 25%)", "#6a14eb40");
  check("rgb(none 128 255)", "#0080ff"); // `none` channel -> 0

  // --- hsl()/hsla() -----------------------------------------------------------
  check("hsl(220 90% 56%)", "#2a6df4");
  check("hsla(120, 50%, 50%, 0.5)", "#40bf4080"); // legacy comma syntax
  check("hsl(-120 50% 50%)", "#4040bf");          // negative hue normalizes
  check("hsl(0.5turn 80% 40%)", "#14b8b8");       // turn angle unit
  check("hsl(200grad 60% 50%)", "#33cccc");       // grad angle unit

  // --- hwb() ------------------------------------------------------------------
  check("hwb(200 20% 10%)", "#33aae6");
  check("hwb(90 40% 80%)", "#555555"); // w+b > 1 renormalizes

  // --- oklch() — Tailwind v4 palette + edge cases -------------------------------
  check("oklch(0.623 0.214 259.815)", "#2b7fff"); // tw blue-500
  check("oklch(0.723 0.219 149.579)", "#00c950"); // tw green-500
  check("oklch(0.637 0.237 25.331)", "#fb2c36");  // tw red-500
  check("oklch(70% 0.15 180)", "#00bca2");        // percentage lightness
  check("oklch(0.7 0.4 30)", "#ff0000");    // out-of-gamut chroma -> clip
  check("oklch(0.85 0.3 -90)", "#86b3ff");  // negative hue + gamut clip
  check("oklch(0.55 0.25 262 / 40%)", "#055eff66"); // percent alpha
  check("oklch(0.5 0.2 500)", "#007b00");   // hue > 360
  check("oklch(1.2 0.1 100)", "#ffffb2");   // L clamps to 1 at parse
  check("oklch(0.6 -0.1 100)", "#808080");  // negative chroma clamps to 0
  check("oklch(none 0.1 100)", "#000200");  // `none` lightness -> 0
  check("oklch(0.6 0.1 0.25turn)", "#977d30"); // angle unit on hue

  // --- oklab() ----------------------------------------------------------------
  check("oklab(0.623 -0.1 0.15)", "#729700");
  check("oklab(59.69% 0.1007 0.1191 / 0.5)", "#c65d0780");

  // --- lab() ------------------------------------------------------------------
  check("lab(52.23 40.16 59.99)", "#c65d06");
  check("lab(29.2345% 39.3825 20.0664)", "#7d2329"); // L% uses raw value
  check("lab(60 -80% 30% / 0.75)", "#00b346bf");     // a/b% scale by 125/100

  // --- lch() ------------------------------------------------------------------
  check("lch(52.2 72.2 50)", "#cd561a");
  check("lch(56.29% 106.83% 40.86 / 50%)", "#ff000080"); // C% scales by 150/100

  // --- color() ----------------------------------------------------------------
  check("color(srgb 0.25 0.5 0.75)", "#4080bf");
  check("color(srgb 25% 50% 75% / 0.2)", "#4080bf33");
  check("color(display-p3 1 0 0)", "#ff0000"); // wide gamut clips to sRGB
  check("color(display-p3 0.48 0.63 0.42 / 0.8)", "#6fa265cc");
  check("color(srgb-linear 0.5 0.5 0.5)", "#bcbcbc");

  // --- rejects ------------------------------------------------------------------
  check("oklch(0.5 0.1)", nullptr);                 // culori FAIL (2 coords)
  check("notacolor", nullptr);                      // culori FAIL
  check("color-mix(in oklab, red, blue)", nullptr); // culori FAIL
  check("color(rec2020 1 0 0)", nullptr);           // [scope] unsupported space
  check("currentColor", nullptr);                   // [scope] keyword passthrough

  // --- Rgba / toHexString shape -------------------------------------------------
  {
    total++;
    auto rgba = parseColor("oklch(0.623 0.214 259.815)");
    if (!rgba || toHexString(*rgba) != "#2b7fff") {
      std::printf("FAIL parseColor/toHexString round-trip\n");
      failures++;
    } else {
      std::printf("ok   parseColor/toHexString round-trip = #2b7fff\n");
    }
    total++;
    auto rgba8 = parseColor("rgb(59 130 246 / 0.5)");
    if (!rgba8 || toHexString(*rgba8) != "#3b82f680") {
      std::printf("FAIL parseColor alpha round-trip\n");
      failures++;
    } else {
      std::printf("ok   parseColor alpha round-trip = #3b82f680\n");
    }
  }

  if (failures == 0) std::printf("\nALL PASS (%d cases)\n", total);
  else std::printf("\n%d/%d FAILURES\n", failures, total);
  return failures == 0 ? 0 : 1;
}
