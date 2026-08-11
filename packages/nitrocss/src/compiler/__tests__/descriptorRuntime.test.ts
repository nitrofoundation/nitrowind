import { describe, expect, it } from "vitest";
import { parseCssMath } from "../parsers/cssMath";
import {
  cssMathEntries,
  lowerCssMathStyle,
} from "../parsers/cssMathRuntime";
import { parseSemanticColor } from "../parsers/semanticColors";
import {
  lowerNativeColor,
  lowerNativeColorStyle,
  wideGamutToSrgb,
} from "../parsers/semanticColorsRuntime";
import { parseWideGamutColor } from "../parsers/tailwindV4";

describe("runtime descriptor lowering", () => {
  it("lowers CSS math from viewport, container, percent, and font inputs", () => {
    const style = {
      width: parseCssMath("min(80vw, 100cqi)"),
      padding: parseCssMath("calc(10% + 1rem)"),
    };
    const result = lowerCssMathStyle(style, {
      snapshot: { screen: { width: 400, height: 800 }, rem: 16 },
      container: { width: 280, height: 200 },
      percentBase: (property) => (property === "padding" ? 200 : undefined),
    });
    expect(result).toEqual({ width: 280, padding: 36 });
    expect(cssMathEntries(style)).toHaveLength(2);
  });

  it("preserves object identity when no runtime descriptor exists", () => {
    const style = { width: 20, color: "red" } as const;
    expect(
      lowerCssMathStyle(style, {
        snapshot: { screen: { width: 400, height: 800 }, rem: 16 },
      }),
    ).toBe(style);
  });

  it("lowers platform and dynamic colors through injected native adapters", () => {
    const dynamic = parseSemanticColor(
      "dynamic-color(platform-color(labelColor, #111), #fff)",
    )!;
    expect(
      lowerNativeColor(dynamic, {
        scheme: "dark",
        adapter: {
          platformColor: (name) => ({ platform: name }),
          dynamicColor: (options) => ({ dynamic: options }),
        },
      }),
    ).toEqual({
      dynamic: {
        light: { platform: "labelColor" },
        dark: "#fff",
      },
    });
  });

  it("converts wide gamut colors to deterministic sRGB fallbacks", () => {
    const white = parseWideGamutColor("color(display-p3 1 1 1)")!;
    expect(wideGamutToSrgb(white).map((value) => Number(value.toFixed(4)))).toEqual([
      0.9999,
      1,
      1,
      1,
    ]);

    const style = { color: parseWideGamutColor("oklch(72% 0.18 40 / 50%)") };
    expect(
      lowerNativeColorStyle(style, {
        scheme: "light",
        unresolved: "fallback",
        adapter: { platformColor: () => undefined },
      }),
    ).toEqual({ color: "rgba(255, 118, 67, 0.5)" });
  });
});
