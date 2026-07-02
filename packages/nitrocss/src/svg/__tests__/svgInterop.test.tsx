import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { compileFromCss } from "../../compiler";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import {
  cssInterop,
  normalizeCssInteropMapping,
} from "../../hoc/cssInterop";
import { resolveGeneratedProps } from "../../hoc/withNitrowind";
import { ColorScheme, Orientation } from "../../specs/types";
import { SVG_CSS_INTEROP_MAPPING, SVG_PAINT_PROPS } from "../index";
import * as SvgPreset from "../index";

/**
 * The shapes Tailwind v4 emits for the svg paint utilities (verified against
 * the real `nitrocss` compile pipeline):
 *   fill-red-500        → fill: <color>
 *   stroke-blue-500     → stroke: <color>
 *   stroke-2            → stroke-width: 2px   (→ strokeWidth: 2)
 *   fill-none           → fill: none
 *   opacity-50          → opacity: .5
 *   [fill-opacity:0.5]  → fill-opacity: .5    (→ fillOpacity: 0.5)
 *   [stroke-opacity:.4] → stroke-opacity: .4  (→ strokeOpacity: 0.4)
 */
const CSS = String.raw`
.fill-red-500 { fill: #ef4444; }
.fill-none { fill: none; }
.stroke-blue-500 { stroke: #3b82f6; }
.stroke-2 { stroke-width: 2px; }
.opacity-50 { opacity: .5; }
.fill-opacity-50 { fill-opacity: .5; }
.stroke-opacity-40 { stroke-opacity: .4; }
.h-6 { height: 24px; }
`;

const snapshot = {
  currentThemeName: "light",
  colorScheme: ColorScheme.Light,
  hasAdaptiveThemes: false,
  screen: { width: 390, height: 844 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  orientation: Orientation.Portrait,
  pixelRatio: 3,
  fontScale: 1,
  rtl: false,
};

beforeAll(() => {
  registerStyles(compileFromCss(CSS, 16));
});

describe("svg className compilation", () => {
  it("compiles fill/stroke utilities to the svg style keys the preset hoists", () => {
    const { styles } = resolveStyles(
      "fill-red-500 stroke-blue-500 stroke-2 opacity-50",
      snapshot,
    );
    expect(styles).toMatchObject({
      fill: "#ef4444",
      stroke: "#3b82f6",
      strokeWidth: 2,
      opacity: 0.5,
    });
  });
});

describe("SVG_CSS_INTEROP_MAPPING resolution", () => {
  const resolve = (
    className: string,
    props: Record<string, unknown> = {},
  ): Record<string, unknown> =>
    resolveGeneratedProps(props, snapshot, SVG_CSS_INTEROP_MAPPING, className);

  it("hoists resolved paint values from className onto svg props", () => {
    expect(
      resolve("fill-red-500 stroke-blue-500 stroke-2 opacity-50"),
    ).toEqual({
      fill: "#ef4444",
      stroke: "#3b82f6",
      strokeWidth: 2,
      opacity: 0.5,
    });
  });

  it("hoists fillOpacity / strokeOpacity and `fill: none`", () => {
    expect(
      resolve("fill-none fill-opacity-50 stroke-opacity-40"),
    ).toEqual({
      fill: "none",
      fillOpacity: 0.5,
      strokeOpacity: 0.4,
    });
  });

  it("omits paint props the className does not set (no explicit undefined)", () => {
    const generated = resolve("fill-red-500");
    expect(generated).toEqual({ fill: "#ef4444" });
    expect(Object.keys(generated)).not.toContain("stroke");
  });

  it("never overrides an explicitly-passed prop", () => {
    expect(
      resolve("fill-red-500 stroke-blue-500", { fill: "#000000" }),
    ).toEqual({ stroke: "#3b82f6" });
  });

  it("ignores non-paint utilities (h-6 stays in style, not props)", () => {
    expect(resolve("h-6 fill-red-500")).toEqual({ fill: "#ef4444" });
  });

  it("covers every documented paint prop", () => {
    expect(Object.keys(SVG_CSS_INTEROP_MAPPING.props ?? {}).sort()).toEqual(
      [...SVG_PAINT_PROPS].sort(),
    );
  });
});

describe("cssInterop", () => {
  function Mock(_props: { style?: unknown }): React.ReactElement | null {
    return null;
  }

  it("wraps a component via withNitrowind", () => {
    const Styled = cssInterop(Mock);
    expect(Styled).toBeTruthy();
    expect(
      (Styled as { displayName?: string }).displayName,
    ).toBe("withNitrowind(Mock)");
  });

  it("normalizes shorthand mappings to withNitrowind prop options", () => {
    expect(
      normalizeCssInteropMapping({
        className: "style",
        labelClassName: "labelStyle",
        iconClassName: "icon",
      }),
    ).toEqual({
      labelStyle: { fromClassName: "labelClassName" },
      icon: { fromClassName: "iconClassName" },
    });
  });

  it("passes full withNitrowind options through untouched", () => {
    const options = {
      props: { fill: { fromClassName: "className", styleProperty: "fill" } },
    };
    expect(normalizeCssInteropMapping(options)).toBe(options);
  });

  it("resolves shorthand-mapped props into style targets", () => {
    const mapping = normalizeCssInteropMapping({
      labelClassName: "labelStyle",
    });
    const generated = resolveGeneratedProps(
      { labelClassName: "opacity-50" },
      snapshot,
      mapping,
    );
    expect(generated.labelStyle).toMatchObject({ opacity: 0.5 });
  });
});

describe("svg preset exports", () => {
  it("exposes wrapped + passthrough elements", () => {
    for (const name of [
      "Svg",
      "Path",
      "Rect",
      "Circle",
      "Ellipse",
      "Line",
      "Polygon",
      "Polyline",
      "G",
      "SvgText",
      "Defs",
      "Stop",
      "LinearGradient",
      "RadialGradient",
    ]) {
      expect(
        SvgPreset[name as keyof typeof SvgPreset],
        `missing export ${name}`,
      ).toBeTruthy();
    }
  });
});
