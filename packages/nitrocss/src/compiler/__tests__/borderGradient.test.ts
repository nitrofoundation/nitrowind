import { describe, expect, it } from "vitest";
import { extractBorderGradient } from "../parsers/borderGradient";
import { GRADIENT_DESCRIPTOR_PROP } from "../parsers/gradient";

const RECIPE =
  "linear-gradient(#fff, #fff) padding-box padding-box, linear-gradient(to right, #00008b, #9932cc) border-box";

describe("extractBorderGradient", () => {
  it("bakes the padding-box/border-box recipe into a gradient descriptor", () => {
    const out = extractBorderGradient([
      { prop: "background", value: RECIPE },
      { prop: "border", value: "4px solid #0000" },
    ]);
    expect(out).toBeDefined();
    expect(out![GRADIENT_DESCRIPTOR_PROP]).toEqual({
      gradientType: "linear",
      angle: 90,
      positionX: 0.5,
      positionY: 0.5,
      colors: ["#00008b", "#9932cc"],
      locations: [0, 1],
      inner: "#ffffff",
    });
    expect(out!.borderWidth).toBe(4);
    expect(out!.borderStyle).toBe("solid");
    expect(out!.borderColor).toBe("#00000000");
  });

  it("accepts a plain color as the padding-box layer and stop positions", () => {
    const out = extractBorderGradient([
      {
        prop: "background",
        value:
          "white padding-box, linear-gradient(45deg, #ff0000 20%, #0000ff 80%) border-box",
      },
    ]);
    const descriptor = out![GRADIENT_DESCRIPTOR_PROP] as Record<
      string,
      unknown
    >;
    expect(descriptor.inner).toBe("#ffffff");
    expect(descriptor.angle).toBe(45);
    expect(descriptor.colors).toEqual(["#ff0000", "#0000ff"]);
    expect(descriptor.locations).toEqual([0.2, 0.8]);
  });

  it("ignores rules without the two-layer box pattern", () => {
    expect(
      extractBorderGradient([
        { prop: "background", value: "linear-gradient(#fff, #000)" },
      ]),
    ).toBeUndefined();
    expect(
      extractBorderGradient([{ prop: "background-color", value: "#fff" }]),
    ).toBeUndefined();
  });
});
