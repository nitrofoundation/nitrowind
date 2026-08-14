import { describe, expect, it } from "vitest";
import {
  angleFromPosition,
  conicGeometryFromPosition,
  extractGradient,
  foldGradient,
  parseCssAngle,
  parseStopLocation,
  radialCenterFromPosition,
  radialGeometryFromPosition,
  GRADIENT_DESCRIPTOR_PROP,
  GRADIENT_FROM_PROP,
  GRADIENT_FROM_POSITION_PROP,
  GRADIENT_INTERPOLATION_PROP,
  GRADIENT_POSITION_PROP,
  GRADIENT_STYLE_PROPS,
  GRADIENT_STOPS_PROP,
  GRADIENT_TO_PROP,
  GRADIENT_TO_POSITION_PROP,
  GRADIENT_TYPE_PROP,
  GRADIENT_VIA_PROP,
  GRADIENT_VIA_POSITION_PROP,
  type GradientDescriptor,
} from "../parsers/gradient";
import type { RNStyle } from "../types";

const descriptorOf = (style: RNStyle): GradientDescriptor =>
  style[GRADIENT_DESCRIPTOR_PROP] as unknown as GradientDescriptor;

describe("foldGradient (descriptor target)", () => {
  it("emits the compact numeric descriptor for a linear gradient", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_POSITION_PROP]: "to right",
      [GRADIENT_FROM_PROP]: "#d946ef",
      [GRADIENT_TO_PROP]: "#22d3ee",
    };
    foldGradient(style);
    expect(descriptorOf(style)).toEqual({
      gradientType: "linear",
      angle: 90,
      positionX: 0.5,
      positionY: 0.5,
      colors: ["#d946ef", "#22d3ee"],
      locations: [0, 1],
    });
    // Marker props are consumed.
    for (const prop of GRADIENT_STYLE_PROPS) {
      expect(style[prop]).toBeUndefined();
    }
    expect(style.experimental_backgroundImage).toBeUndefined();
    expect(style.backgroundImage).toBeUndefined();
  });

  it("includes via stops with the 50% default location", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_POSITION_PROP]: "to bottom right",
      [GRADIENT_FROM_PROP]: "#6366f1",
      [GRADIENT_VIA_PROP]: "#a855f7",
      [GRADIENT_TO_PROP]: "#ec4899",
    };
    foldGradient(style);
    const descriptor = descriptorOf(style);
    expect(descriptor.angle).toBe(135);
    expect(descriptor.colors).toEqual(["#6366f1", "#a855f7", "#ec4899"]);
    expect(descriptor.locations).toEqual([0, 0.5, 1]);
  });

  it("parses explicit degree angles and stop positions", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_POSITION_PROP]: "45deg",
      [GRADIENT_FROM_PROP]: "#fbbf24",
      [GRADIENT_FROM_POSITION_PROP]: "10%",
      [GRADIENT_TO_PROP]: "#e11d48",
      [GRADIENT_TO_POSITION_PROP]: "90%",
    };
    foldGradient(style);
    const descriptor = descriptorOf(style);
    expect(descriptor.angle).toBe(45);
    expect(descriptor.locations).toEqual([0.1, 0.9]);
  });

  it("normalizes negative angles into [0, 360)", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_POSITION_PROP]: "-90deg",
      [GRADIENT_FROM_PROP]: "#000000",
      [GRADIENT_TO_PROP]: "#ffffff",
    };
    foldGradient(style);
    expect(descriptorOf(style).angle).toBe(270);
  });

  it("evaluates Tailwind negative calc angles and CSS angle units", () => {
    const linear: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_POSITION_PROP]: "calc(45deg * -1) in oklab",
      [GRADIENT_FROM_PROP]: "#000000",
      [GRADIENT_TO_PROP]: "#ffffff",
    };
    foldGradient(linear);
    expect(descriptorOf(linear).angle).toBe(315);

    const conic: RNStyle = {
      [GRADIENT_TYPE_PROP]: "conic",
      [GRADIENT_POSITION_PROP]: "from calc(0.25turn * -1) in oklab",
      [GRADIENT_FROM_PROP]: "#000000",
      [GRADIENT_TO_PROP]: "#ffffff",
    };
    foldGradient(conic);
    expect(descriptorOf(conic).angle).toBe(270);
  });

  it("samples Tailwind OKLab interpolation into native RGB stops", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_INTERPOLATION_PROP]: "oklab",
      [GRADIENT_FROM_PROP]: "#ff0000",
      [GRADIENT_TO_PROP]: "#0000ff",
    };
    foldGradient(style);
    const descriptor = descriptorOf(style);
    expect(descriptor.interpolation).toBe("oklab");
    expect(descriptor.colors).toHaveLength(9);
    expect(descriptor.locations).toHaveLength(9);
    expect(descriptor.colors[0]).toBe("#ff0000");
    expect(descriptor.colors.at(-1)).toBe("#0000ff");
  });

  it("extracts arbitrary literal gradients with more than three stops", () => {
    const markers = extractGradient(
      [
        {
          prop: "background-image",
          value:
            "linear-gradient(45deg in oklab, red 0%, #00ff00 40%, blue 75%, white 100%)",
        },
      ],
      () => undefined,
    )!;
    expect(markers[GRADIENT_TYPE_PROP]).toBe("linear");
    expect(markers[GRADIENT_POSITION_PROP]).toBe("45deg");
    expect(markers[GRADIENT_INTERPOLATION_PROP]).toBe("oklab");
    expect(JSON.parse(markers[GRADIENT_STOPS_PROP] as string)).toHaveLength(4);
    foldGradient(markers);
    expect(descriptorOf(markers).colors).toHaveLength(25);
    expect(descriptorOf(markers).locations.at(-1)).toBe(1);
  });

  it("treats arbitrary/custom gradient-position stop lists as stops", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_POSITION_PROP]: "red 10%, lime 45%, blue 90%",
    };
    foldGradient(style);
    expect(descriptorOf(style)).toMatchObject({
      colors: ["#ff0000", "#00ff00", "#0000ff"],
      locations: [0.1, 0.45, 0.9],
    });
  });

  it("resolves radial center from the `at` clause", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "radial",
      [GRADIENT_POSITION_PROP]: "at 25% 25%",
      [GRADIENT_FROM_PROP]: "#fde047",
      [GRADIENT_TO_PROP]: "#ea580c",
    };
    foldGradient(style);
    const descriptor = descriptorOf(style);
    expect(descriptor.gradientType).toBe("radial");
    expect(descriptor.angle).toBe(0);
    expect(descriptor.positionX).toBe(0.25);
    expect(descriptor.positionY).toBe(0.25);
  });

  it("defaults radial center to 0.5/0.5 and handles keywords", () => {
    const centered: RNStyle = {
      [GRADIENT_TYPE_PROP]: "radial",
      [GRADIENT_FROM_PROP]: "#ffffff",
      [GRADIENT_TO_PROP]: "#0ea5e9",
    };
    foldGradient(centered);
    expect(descriptorOf(centered).positionX).toBe(0.5);
    expect(descriptorOf(centered).positionY).toBe(0.5);

    const cornered: RNStyle = {
      [GRADIENT_TYPE_PROP]: "radial",
      [GRADIENT_POSITION_PROP]: "circle at top left",
      [GRADIENT_FROM_PROP]: "#ffffff",
      [GRADIENT_TO_PROP]: "#0ea5e9",
    };
    foldGradient(cornered);
    expect(descriptorOf(cornered).positionX).toBe(0);
    expect(descriptorOf(cornered).positionY).toBe(0);
  });

  it("retains radial shape and extent for native radius calculation", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "radial",
      [GRADIENT_POSITION_PROP]: "circle closest-side at 20% 70%",
      [GRADIENT_FROM_PROP]: "#ffffff",
      [GRADIENT_TO_PROP]: "#000000",
    };
    foldGradient(style);
    expect(descriptorOf(style)).toMatchObject({
      gradientType: "radial",
      positionX: 0.2,
      positionY: 0.7,
      radialShape: "circle",
      radialExtent: "closest-side",
    });
  });

  it("emits conic geometry from the gradient prelude", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "conic",
      [GRADIENT_POSITION_PROP]: "from -45deg at 25% 75%",
      [GRADIENT_FROM_PROP]: "#f43f5e",
      [GRADIENT_VIA_PROP]: "#8b5cf6",
      [GRADIENT_TO_PROP]: "#06b6d4",
    };
    foldGradient(style);
    expect(descriptorOf(style)).toEqual({
      gradientType: "conic",
      angle: 315,
      positionX: 0.25,
      positionY: 0.75,
      colors: ["#f43f5e", "#8b5cf6", "#06b6d4"],
      locations: [0, 0.5, 1],
    });
  });

  it("substitutes transparent for missing from/to colors", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_TO_PROP]: "#123456",
    };
    foldGradient(style);
    expect(descriptorOf(style).colors).toEqual(["transparent", "#123456"]);
  });

  it("clamps stop locations to be monotonic non-decreasing", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_FROM_PROP]: "#111111",
      [GRADIENT_FROM_POSITION_PROP]: "80%",
      [GRADIENT_VIA_PROP]: "#222222",
      [GRADIENT_VIA_POSITION_PROP]: "20%",
      [GRADIENT_TO_PROP]: "#333333",
    };
    foldGradient(style);
    expect(descriptorOf(style).locations).toEqual([0.8, 0.8, 1]);
  });

  it("is a no-op (marker cleanup only) without a gradient type", () => {
    const style: RNStyle = {
      [GRADIENT_FROM_PROP]: "#ff0000",
      backgroundColor: "#ffffff",
    };
    foldGradient(style);
    expect(style[GRADIENT_DESCRIPTOR_PROP]).toBeUndefined();
    expect(style[GRADIENT_FROM_PROP]).toBeUndefined();
    expect(style.backgroundColor).toBe("#ffffff");
  });
});

describe("foldGradient (css target — web)", () => {
  it("emits a real CSS backgroundImage string", () => {
    const style: RNStyle = {
      [GRADIENT_TYPE_PROP]: "linear",
      [GRADIENT_POSITION_PROP]: "to right",
      [GRADIENT_FROM_PROP]: "#d946ef",
      [GRADIENT_TO_PROP]: "#22d3ee",
    };
    foldGradient(style, "css");
    expect(style.backgroundImage).toBe(
      "linear-gradient(to right, #d946ef 0%, #22d3ee 100%)",
    );
    expect(style[GRADIENT_DESCRIPTOR_PROP]).toBeUndefined();
  });
});

describe("gradient fold helpers (mirrored in C++)", () => {
  it("parseCssAngle handles native units and reducible calc expressions", () => {
    expect(parseCssAngle("45deg")).toBe(45);
    expect(parseCssAngle("0.25turn")).toBe(90);
    expect(parseCssAngle("100grad")).toBe(90);
    expect(parseCssAngle(`${Math.PI}rad`)).toBeCloseTo(180);
    expect(parseCssAngle("calc(45deg * -1) in oklab")).toBe(-45);
    expect(parseCssAngle("var(--angle)")).toBeUndefined();
  });

  it("angleFromPosition matches the keyword table", () => {
    expect(angleFromPosition(undefined)).toBe(180);
    expect(angleFromPosition("to top")).toBe(0);
    expect(angleFromPosition("to top right")).toBe(45);
    expect(angleFromPosition("to right")).toBe(90);
    expect(angleFromPosition("to bottom right")).toBe(135);
    expect(angleFromPosition("to bottom")).toBe(180);
    expect(angleFromPosition("to bottom left")).toBe(225);
    expect(angleFromPosition("to left")).toBe(270);
    expect(angleFromPosition("to top left")).toBe(315);
    expect(angleFromPosition("144deg")).toBe(144);
    expect(angleFromPosition("450deg")).toBe(90);
    expect(angleFromPosition("garbage")).toBe(180);
  });

  it("parseStopLocation handles percents, numbers and fallbacks", () => {
    expect(parseStopLocation(undefined, 0.5)).toBe(0.5);
    expect(parseStopLocation("40%", 0)).toBe(0.4);
    expect(parseStopLocation("0.25", 0)).toBe(0.25);
    expect(parseStopLocation("150%", 0)).toBe(1);
    expect(parseStopLocation("-10%", 1)).toBe(0);
    expect(parseStopLocation("junk", 0.75)).toBe(0.75);
  });

  it("radialCenterFromPosition resolves keywords and percents", () => {
    expect(radialCenterFromPosition("at 50% 100%")).toEqual({ x: 0.5, y: 1 });
    expect(radialCenterFromPosition("ellipse at bottom right")).toEqual({
      x: 1,
      y: 1,
    });
    expect(radialCenterFromPosition("circle")).toEqual({ x: 0.5, y: 0.5 });
    expect(radialCenterFromPosition(undefined)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("radialGeometryFromPosition resolves shape and extent", () => {
    expect(
      radialGeometryFromPosition("ellipse closest-corner at bottom right"),
    ).toEqual({
      x: 1,
      y: 1,
      shape: "ellipse",
      extent: "closest-corner",
    });
  });

  it("conicGeometryFromPosition resolves angle and center", () => {
    expect(conicGeometryFromPosition("from 90deg at top left")).toEqual({
      angle: 90,
      x: 0,
      y: 0,
    });
    expect(conicGeometryFromPosition(undefined)).toEqual({
      angle: 0,
      x: 0.5,
      y: 0.5,
    });
  });
});
