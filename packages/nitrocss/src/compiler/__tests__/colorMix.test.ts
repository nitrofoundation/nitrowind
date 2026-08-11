import { describe, expect, it } from "vitest";
import { resolveColorMix } from "../parsers/colorMix";

describe("resolveColorMix", () => {
  it("mixes sRGB stops with omitted complementary percentages", () => {
    expect(resolveColorMix("color-mix(in srgb, #ff0000 25%, #0000ff)")).toBe(
      "#4000bf",
    );
  });

  it("premultiplies alpha for Tailwind opacity colors", () => {
    expect(
      resolveColorMix("color-mix(in oklab, #2b7fff 15%, transparent)"),
    ).toBe("#2b7fff26");
  });

  it("handles nested color functions and linear sRGB", () => {
    expect(
      resolveColorMix(
        "color-mix(in srgb-linear, rgb(255 0 0), rgb(0 0 255))",
      ),
    ).toBe("#bc00bc");
  });

  it("leaves unsupported interpolation spaces unresolved", () => {
    expect(resolveColorMix("color-mix(in lch, red, blue)")).toBeUndefined();
  });
});
