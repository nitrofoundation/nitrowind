import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Platform } from "react-native";
import { compileFromCss } from "../index";
import {
  formatBoxShadow,
  spliceBoxShadowColor,
} from "../parsers/boxShadow";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import {
  ColorScheme,
  Orientation,
  type RuntimeSnapshot,
} from "../../specs/types";

/**
 * The exact (flattened) shapes Tailwind v4 + lightningcss emit for transform,
 * shadow and font-variant utilities. Tailwind sets per-axis `--tw-*` helpers
 * and composes them in the `transform` / `scale` / `translate` / `box-shadow`
 * longhands; the parsers reduce all of that to RN style shapes.
 */
const CSS = String.raw`
@theme {
  --color-red-500: #ef4444;
}
@layer utilities {
  .rotate-45 {
    rotate: 45deg;
  }
  .-rotate-12 {
    rotate: -12deg;
  }
  .translate-x-4 {
    --tw-translate-x: calc(var(--spacing) * 4);
    translate: var(--tw-translate-x) var(--tw-translate-y);
  }
  .-translate-y-2 {
    --tw-translate-y: calc(var(--spacing) * -2);
    translate: var(--tw-translate-x) var(--tw-translate-y);
  }
  .scale-110 {
    --tw-scale-x: 110%;
    --tw-scale-y: 110%;
    --tw-scale-z: 110%;
    scale: var(--tw-scale-x) var(--tw-scale-y);
  }
  .scale-x-50 {
    --tw-scale-x: 50%;
    scale: var(--tw-scale-x) var(--tw-scale-y);
  }
  .scale-y-150 {
    --tw-scale-y: 150%;
    scale: var(--tw-scale-x) var(--tw-scale-y);
  }
  .skew-x-3 {
    --tw-skew-x: skewX(3deg);
    transform: var(--tw-rotate-x, ) var(--tw-rotate-y, ) var(--tw-rotate-z, ) var(--tw-skew-x, ) var(--tw-skew-y, );
  }
  .shadow-md {
    --tw-shadow: 0 4px 6px -1px var(--tw-shadow-color, #0000001a), 0 2px 4px -2px var(--tw-shadow-color, #0000001a);
    box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .shadow-red-500 {
    --tw-shadow-color: var(--color-red-500);
  }
  .shadow-red-500\/50 {
    --tw-shadow-color: #ef444480;
  }
  .shadow-\[\#ef4444\] {
    --tw-shadow-color: #ef4444;
  }
  .shadow-\[0_8px_20px_rgba\(239\,68\,68\,0\.45\)\] {
    --tw-shadow: 0 8px 20px var(--tw-shadow-color, #ef444473);
    box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .shadow-\[inset_0_2px_4px_\#0000000d\] {
    --tw-shadow: inset 0 2px 4px var(--tw-shadow-color, #0000000d);
    box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .shadow-\[0_1rem_2rem_\#ef4444\] {
    --tw-shadow: 0 1rem 2rem var(--tw-shadow-color, #ef4444);
    box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .text-shadow-sm {
    text-shadow: 0px 1px 2px var(--tw-text-shadow-color, #0000001a);
  }
  .tabular-nums {
    --tw-numeric-spacing: tabular-nums;
    font-variant-numeric: var(--tw-ordinal, ) var(--tw-slashed-zero, ) var(--tw-numeric-figure, ) var(--tw-numeric-spacing, ) var(--tw-numeric-fraction, );
  }
}
`;

function makeSnapshot(): RuntimeSnapshot {
  return {
    colorScheme: ColorScheme.Light,
    hasAdaptiveThemes: true,
    currentThemeName: "light",
    screen: { width: 390, height: 844 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: Orientation.Portrait,
    pixelRatio: 3,
    fontScale: 1,
    rtl: false,
    rem: 16,
    hairlineWidth: 1 / 3,
  };
}

const stylesFor = (className: string) =>
  resolveStyles(className, makeSnapshot()).styles;

describe("value parsers", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  // Registry is a module global; (re)register before each test so this file's
  // artifact wins regardless of run order with the other suites.
  beforeEach(() => {
    Platform.OS = "web";
    registerStyles(compileFromCss(CSS, 16));
  });

  describe("transforms", () => {
    it("turns a 2D rotate longhand into a transform entry", () => {
      expect(stylesFor("rotate-45").transform).toEqual([{ rotate: "45deg" }]);
      expect(stylesFor("-rotate-12").transform).toEqual([{ rotate: "-12deg" }]);
    });

    it("resolves spacing-based translate to px numbers", () => {
      // --spacing defaults to 0.25rem → 4px, so *4 = 16 and *-2 = -8.
      expect(stylesFor("translate-x-4").transform).toEqual([
        { translateX: 16 },
      ]);
      expect(stylesFor("-translate-y-2").transform).toEqual([
        { translateY: -8 },
      ]);
    });

    it("coerces percentage scale to unitless numbers", () => {
      expect(stylesFor("scale-110").transform).toEqual([
        { scaleX: 1.1 },
        { scaleY: 1.1 },
      ]);
    });

    it("extracts the angle from a skew function token", () => {
      expect(stylesFor("skew-x-3").transform).toEqual([{ skewX: "3deg" }]);
    });

    it("folds multiple classes into one array in canonical order", () => {
      // Declared in className order translate→rotate→scale, but the fold emits
      // canonical order: translateX, rotate, scaleX, scaleY.
      expect(stylesFor("scale-110 rotate-45 translate-x-4").transform).toEqual([
        { translateX: 16 },
        { rotate: "45deg" },
        { scaleX: 1.1 },
        { scaleY: 1.1 },
      ]);
    });

    it("merges the same axis last-wins and different axes union", () => {
      // scale-x-50 and scale-y-150 each set only one axis: both survive.
      expect(stylesFor("scale-x-50 scale-y-150").transform).toEqual([
        { scaleX: 0.5 },
        { scaleY: 1.5 },
      ]);
    });

    it("does not leak the intermediate axis props", () => {
      const styles = stylesFor("rotate-45 translate-x-4");
      expect(styles.rotate).toBeUndefined();
      expect(styles.translateX).toBeUndefined();
    });
  });

  describe("box-shadow", () => {
    it("compiles --tw-shadow to RN's processed BoxShadowValue[]", () => {
      // The artifact carries the array form RN's native parser accepts with
      // `enableNativeCSSParsing` OFF (parseProcessedBoxShadow): numeric px
      // lengths, boolean `inset`, hex colors.
      const artifact = compileFromCss(CSS, 16);
      expect(artifact.classes["shadow-md"]?.[0]?.style.boxShadow).toEqual([
        {
          offsetX: 0,
          offsetY: 4,
          blurRadius: 6,
          spreadDistance: -1,
          color: "#0000001a",
        },
        {
          offsetX: 0,
          offsetY: 2,
          blurRadius: 4,
          spreadDistance: -2,
          color: "#0000001a",
        },
      ]);
    });

    it("parses the inset keyword into the layer's inset flag", () => {
      const artifact = compileFromCss(CSS, 16);
      const style = artifact.classes["shadow-[inset_0_2px_4px_#0000000d]"]?.[0]
        ?.style as Record<string, unknown>;
      expect(style.boxShadow).toEqual([
        {
          offsetX: 0,
          offsetY: 2,
          blurRadius: 4,
          color: "#0000000d",
          inset: true,
        },
      ]);
      // Inset shadows have no legacy iOS approximation.
      expect(style.shadowOffset).toBeUndefined();
      expect(style.elevation).toBeUndefined();
    });

    it("falls back to the CSS string form for non-px units (web-only)", () => {
      const artifact = compileFromCss(CSS, 16);
      const style = artifact.classes["shadow-[0_1rem_2rem_#ef4444]"]?.[0]
        ?.style as Record<string, unknown>;
      expect(style.boxShadow).toBe("0px 1rem 2rem #ef4444");
      expect(style.shadowOffset).toBeUndefined();
    });

    it("builds RN shadow props from --tw-shadow", () => {
      expect(stylesFor("shadow-md").boxShadow).toBe(
        "0px 4px 6px -1px #0000001a, 0px 2px 4px -2px #0000001a",
      );
      expect(stylesFor("shadow-md")).toMatchObject({
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: expect.closeTo(0.102, 3),
        shadowRadius: 6,
        elevation: 3,
      });
    });

    it("applies Tailwind shadow color utilities to legacy and boxShadow props", () => {
      const styles = stylesFor("shadow-md shadow-red-500");
      expect(styles.shadowColor).toBe("#ef4444");
      expect(styles.shadowOpacity).toBe(1);
      expect(styles.boxShadow).toBe(
        "0px 4px 6px -1px #ef4444, 0px 2px 4px -2px #ef4444",
      );
    });

    it("preserves opacity from translucent shadow color utilities", () => {
      const styles = stylesFor("shadow-md shadow-red-500/50");
      expect(styles.shadowColor).toBe("#ef4444");
      expect(styles.shadowOpacity).toBeCloseTo(0.502, 3);
      expect(styles.boxShadow).toBe(
        "0px 4px 6px -1px #ef444480, 0px 2px 4px -2px #ef444480",
      );
    });

    it("parses arbitrary shadow colors and arbitrary shadow values", () => {
      expect(stylesFor("shadow-md shadow-[#ef4444]").shadowColor).toBe(
        "#ef4444",
      );
      expect(
        stylesFor("shadow-[0_8px_20px_rgba(239,68,68,0.45)]"),
      ).toMatchObject({
        boxShadow: "0px 8px 20px #ef444473",
        shadowColor: "#ef4444",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: expect.closeTo(0.451, 3),
        shadowRadius: 20,
      });
    });

    it("serializes inset layers back to a CSS string on web", () => {
      expect(stylesFor("shadow-[inset_0_2px_4px_#0000000d]").boxShadow).toBe(
        "inset 0px 2px 4px #0000000d",
      );
    });

    it("splices the marker color into new layer objects", () => {
      const layers = [
        { offsetX: 0, offsetY: 4, blurRadius: 6, color: "#0000001a" },
        { offsetX: 0, offsetY: 2, color: "#0000001a", inset: true },
      ];
      const spliced = spliceBoxShadowColor(layers, "#ef444480");
      expect(spliced).toEqual([
        { offsetX: 0, offsetY: 4, blurRadius: 6, color: "#ef444480" },
        { offsetX: 0, offsetY: 2, color: "#ef444480", inset: true },
      ]);
      // Compiled bucket styles are shared state: the splice must not mutate.
      expect(layers[0]?.color).toBe("#0000001a");
      expect(spliced[0]).not.toBe(layers[0]);
      expect(formatBoxShadow(spliced)).toBe(
        "0px 4px 6px #ef444480, inset 0px 2px #ef444480",
      );
    });

    it("strips boxShadow on native platforms, keeping the fallbacks", () => {
      Platform.OS = "ios";
      const styles = stylesFor("shadow-md shadow-red-500/50");
      expect(styles.boxShadow).toBeUndefined();
      expect(styles.shadowColor).toBe("#ef4444");
      expect(styles.shadowOpacity).toBeCloseTo(0.502, 3);
      expect(styles.shadowRadius).toBe(6);
      expect(styles.elevation).toBe(3);
    });
  });

  describe("text-shadow", () => {
    it("splits the first layer into RN text-shadow props", () => {
      const styles = stylesFor("text-shadow-sm");
      expect(styles.textShadowColor).toBe("#0000001a");
      expect(styles.textShadowOffset).toEqual({ width: 0, height: 1 });
      expect(styles.textShadowRadius).toBe(2);
      expect(styles.textShadow).toBeUndefined();
    });
  });

  describe("font-variant", () => {
    it("resolves the composed value into an RN fontVariant array", () => {
      expect(stylesFor("tabular-nums").fontVariant).toEqual(["tabular-nums"]);
    });
  });
});
