import { describe, expect, it } from "vitest";
import {
  NATIVE_EFFECTS_PROP,
  extractNativeEffects,
  isNativeEffectsProp,
  mergeNativeEffectsDescriptors,
  parseEffectFilters,
  parseEffectShadows,
  type NativeEffectsDescriptor,
} from "../parsers/effectsNative";

const noVars = () => undefined;

function descriptor(
  declarations: Parameters<typeof extractNativeEffects>[0],
): NativeEffectsDescriptor {
  return extractNativeEffects(declarations, noVars)![
    NATIVE_EFFECTS_PROP
  ] as NativeEffectsDescriptor;
}

describe("native effects parser", () => {
  it("preserves multiple outer and inset shadow layers", () => {
    expect(
      parseEffectShadows(
        "0 2px 8px rgba(0, 0, 0, .25), inset 1px -2px 3px 4px #ff000080",
      ),
    ).toEqual([
      {
        inset: false,
        offsetX: 0,
        offsetY: 2,
        blurRadius: 8,
        spreadDistance: 0,
        color: "#00000040",
      },
      {
        inset: true,
        offsetX: 1,
        offsetY: -2,
        blurRadius: 3,
        spreadDistance: 4,
        color: "#ff000080",
      },
    ]);
  });

  it("rejects an invalid shadow list atomically", () => {
    expect(parseEffectShadows("0 2px #000, invalid")).toBeUndefined();
    expect(parseEffectShadows("0 2px -1px #000")).toBeUndefined();
  });

  it("parses every supported foreground filter", () => {
    expect(
      parseEffectFilters(
        "brightness(125%) contrast(.8) grayscale(20%) hue-rotate(.5turn) invert(1) saturate(2) sepia(30%) blur(6px) drop-shadow(1px 2px 4px rgb(0 0 0 / 50%))",
      ),
    ).toEqual([
      { type: "brightness", amount: 1.25 },
      { type: "contrast", amount: 0.8 },
      { type: "grayscale", amount: 0.2 },
      { type: "hueRotate", degrees: 180 },
      { type: "invert", amount: 1 },
      { type: "saturate", amount: 2 },
      { type: "sepia", amount: 0.3 },
      { type: "blur", radius: 6 },
      {
        type: "dropShadow",
        shadow: {
          inset: false,
          offsetX: 1,
          offsetY: 2,
          blurRadius: 4,
          spreadDistance: 0,
          color: "#00000080",
        },
      },
    ]);
  });

  it("rejects unknown and malformed filter functions", () => {
    expect(parseEffectFilters("url(#effect)")).toBeUndefined();
    expect(parseEffectFilters("blur(2px) garbage")).toBeUndefined();
    expect(parseEffectFilters("blur(-2px)")).toBeUndefined();
    expect(parseEffectFilters("drop-shadow(1px 2px 3px 4px #000)")).toBeUndefined();
    expect(
      extractNativeEffects([{ prop: "filter", value: "unknown(1)" }], noVars),
    ).toBeUndefined();
  });

  it("compiles backdrop, blend, isolation, outline, and border curve", () => {
    expect(
      descriptor([
        { prop: "backdrop-filter", value: "blur(16px) saturate(140%)" },
        { prop: "mix-blend-mode", value: "screen" },
        { prop: "isolation", value: "isolate" },
        { prop: "outline", value: "2px dashed rgb(59 130 246)" },
        { prop: "outline-offset", value: "3px" },
        { prop: "border-curve", value: "continuous" },
      ]),
    ).toEqual({
      backdropFilters: [
        { type: "blur", radius: 16 },
        { type: "saturate", amount: 1.4 },
      ],
      mixBlendMode: "screen",
      isolation: "isolate",
      outline: {
        width: 2,
        style: "dashed",
        color: "#3b82f6",
        offset: 3,
      },
      borderCurve: "continuous",
    });
  });

  it("lets longhands override the outline shorthand", () => {
    expect(
      descriptor([
        { prop: "outline", value: "1px solid red" },
        { prop: "outline-width", value: "4px" },
        { prop: "outline-style", value: "dotted" },
        { prop: "outline-color", value: "#00ff00" },
        { prop: "outline-offset", value: "-2px" },
      ]).outline,
    ).toEqual({ width: 4, style: "dotted", color: "#00ff00", offset: -2 });
  });

  it("resolves nested variables before parsing", () => {
    const vars: Record<string, string> = {
      "--effect": "var(--blur) saturate(120%)",
      "--blur": "blur(10px)",
    };
    const style = extractNativeEffects(
      [{ prop: "filter", value: "var(--effect)" }],
      (name) => vars[name],
    );
    expect(style?.[NATIVE_EFFECTS_PROP]).toEqual({
      filters: [
        { type: "blur", radius: 10 },
        { type: "saturate", amount: 1.2 },
      ],
    });
  });

  it("recognizes only declarations owned by this parser", () => {
    expect(isNativeEffectsProp("box-shadow")).toBe(true);
    expect(isNativeEffectsProp("outline-offset")).toBe(true);
    expect(isNativeEffectsProp("border-curve")).toBe(true);
    expect(isNativeEffectsProp("background-image")).toBe(false);
  });

  it("merges independently-authored utilities by effect family", () => {
    expect(
      mergeNativeEffectsDescriptors(
        descriptor([{ prop: "filter", value: "blur(4px)" }]),
        descriptor([{ prop: "outline", value: "2px solid red" }]),
        descriptor([{ prop: "filter", value: "none" }]),
      ),
    ).toEqual({
      filters: [],
      outline: { width: 2, style: "solid", color: "#ff0000", offset: 0 },
    });
  });
});
