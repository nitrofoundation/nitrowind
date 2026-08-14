import { describe, expect, it } from "vitest";
import { Platform } from "react-native";
import { foldMask } from "../../core/normalize";
import {
  extractMask,
  MASK_MODE_PROP,
  MASK_POSITION_PROP,
  MASK_REPEAT_PROP,
  MASK_SIZE_PROP,
  MASK_SOURCE_PROP,
  type MaskSource,
} from "../parsers/mask";

const noVars = () => undefined;

describe("extractMask", () => {
  it("lowers a literal linear gradient to a native gradient descriptor", () => {
    const style = extractMask(
      [{ prop: "mask-image", value: "linear-gradient(to right, transparent, black)" }],
      noVars,
    )!;
    const source = style[MASK_SOURCE_PROP] as unknown as MaskSource;
    expect(source.type).toBe("gradient");
    if (source.type === "gradient") {
      expect(source.gradient).toMatchObject({
        gradientType: "linear",
        angle: 90,
        colors: ["#00000000", "#000000"],
        locations: [0, 1],
      });
    }
  });

  it("expands CSS double-position stops produced by minification", () => {
    const style = extractMask(
      [{
        prop: "mask-image",
        value: "linear-gradient(to right, #0000, #000 25% 75%, #0000)",
      }],
      noVars,
    )!;
    const source = style[MASK_SOURCE_PROP] as unknown as MaskSource;
    expect(source.type).toBe("gradient");
    if (source.type === "gradient") {
      expect(source.gradient).toMatchObject({
        angle: 90,
        colors: ["#00000000", "#000000", "#000000", "#00000000"],
        locations: [0, 0.25, 0.75, 1],
      });
    }
  });

  it("retains url masks and independently mergeable companions", () => {
    expect(
      extractMask(
        [
          { prop: "mask-image", value: 'url("https://x/mask.png")' },
          { prop: "mask-mode", value: "luminance" },
          { prop: "mask-size", value: "cover" },
          { prop: "mask-repeat", value: "repeat-x" },
          { prop: "mask-position", value: "left bottom" },
        ],
        noVars,
      ),
    ).toEqual({
      [MASK_SOURCE_PROP]: {
        type: "url",
        url: "https://x/mask.png",
        raw: 'url("https://x/mask.png")',
      },
      [MASK_MODE_PROP]: "luminance",
      [MASK_SIZE_PROP]: "cover",
      [MASK_REPEAT_PROP]: "repeat-x",
      [MASK_POSITION_PROP]: "left bottom",
    });
  });

  it("keeps mask-none as an explicit clear source", () => {
    expect(
      extractMask([{ prop: "mask-image", value: "none" }], noVars),
    ).toEqual({
      [MASK_SOURCE_PROP]: { type: "none", raw: "none" },
    });
  });

  it("uses CSS mask-position defaults and centers one-value positions", () => {
    const original = Platform.OS;
    Platform.OS = "ios";
    try {
      const source = { type: "url", url: "https://x/mask.png", raw: "url(x)" };
      const topLeft = { [MASK_SOURCE_PROP]: source };
      foldMask(topLeft);
      expect(topLeft["--nitrocss-mask"]).toMatchObject({
        positionX: 0,
        positionY: 0,
      });

      const centered = {
        [MASK_SOURCE_PROP]: source,
        [MASK_POSITION_PROP]: "center",
      };
      foldMask(centered);
      expect(centered["--nitrocss-mask"]).toMatchObject({
        positionX: 0.5,
        positionY: 0.5,
      });
    } finally {
      Platform.OS = original;
    }
  });
});
