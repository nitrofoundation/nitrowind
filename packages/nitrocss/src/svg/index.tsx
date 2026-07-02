/**
 * `@nitrofoundation/nitrocss/svg` — className-styled `react-native-svg` primitives.
 *
 * Pre-wraps the common svg elements with {@link cssInterop} so the utility compiler's svg
 * utilities drive them directly:
 *
 * ```tsx
 * import { Svg, Path } from "@nitrofoundation/nitrocss/svg";
 *
 * <Svg viewBox="0 0 24 24" className="h-6 w-6">
 *   <Path d={ICON} className="fill-primary stroke-white/50 stroke-2" />
 * </Svg>
 * ```
 *
 * `react-native-svg` paints from *props* (`fill`, `stroke`, …), not from
 * `style`, so on top of the usual `className → style` behavior each wrapped
 * element hoists the resolved svg paint values out of the class styles onto
 * the matching props (extending the `colorFromStyle`/`HOST_COLOR_PROPS`
 * approach in `withNitroCss`). Verified compiled output:
 *
 * - `fill-red-500` / `fill-primary` / `fill-none` → style key `fill`  → `fill` prop
 * - `stroke-blue-500` / `stroke-none`             → style key `stroke` → `stroke` prop
 * - `stroke-2` / `stroke-[3px]`                   → `strokeWidth`      → `strokeWidth` prop
 * - `opacity-50`                                  → `opacity`          → `opacity` prop
 * - `[fill-opacity:0.5]`                          → `fillOpacity`      → `fillOpacity` prop
 * - `[stroke-opacity:0.4]`                        → `strokeOpacity`    → `strokeOpacity` prop
 *
 * `react-native-svg` is an **optional** peer dependency: it is only
 * `require`d when one of these components first renders, and a missing
 * install fails with a clear error instead of an opaque module-resolution
 * stack.
 */
import React, { forwardRef, type ComponentType } from "react";
import type { StyleProp } from "react-native";
import {
  cssInterop,
  type CssInteropComponent,
} from "../hoc/cssInterop";
import type { WithNitroCssAdvancedOptions } from "../hoc/withNitroCss";

/**
 * The svg paint properties hoisted from resolved className styles onto
 * `react-native-svg` props. the utility compiler's `fill-*` / `stroke-*` utilities compile
 * to these exact style keys (see the module docblock for the verified table).
 */
export const SVG_PAINT_PROPS = [
  "fill",
  "stroke",
  "strokeWidth",
  "opacity",
  "fillOpacity",
  "strokeOpacity",
] as const;

export type SvgPaintProp = (typeof SVG_PAINT_PROPS)[number];

type SvgHostProps = { style?: StyleProp<unknown>; [prop: string]: unknown };

/**
 * The `cssInterop` mapping used for every wrapped svg element: each paint
 * prop is filled from the same style key of the resolved `className` styles
 * (an explicit prop always wins). Exported so callers can wrap additional
 * svg elements (`TSpan`, `Use`, …) with identical behavior.
 */
export const SVG_CSS_INTEROP_MAPPING: WithNitroCssAdvancedOptions<SvgHostProps> =
  {
    props: Object.fromEntries(
      SVG_PAINT_PROPS.map((prop) => [
        prop,
        { fromClassName: "className", styleProperty: prop },
      ]),
    ),
  };

type SvgModule = Record<string, unknown> & { default?: unknown };

let svgModule: SvgModule | null | undefined;

function loadSvgModule(): SvgModule {
  if (svgModule === undefined) {
    try {
      // Lazy so apps that never import `@nitrofoundation/nitrocss/svg` components at runtime
      // don't need react-native-svg installed.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      svgModule = require("react-native-svg") as SvgModule;
    } catch {
      svgModule = null;
    }
  }
  if (!svgModule) {
    throw new Error(
      "@nitrofoundation/nitrocss/svg requires the optional peer dependency 'react-native-svg'. " +
        "Install it (e.g. `yarn add react-native-svg`) and rebuild the app to " +
        "use className-styled svg components.",
    );
  }
  return svgModule;
}

function baseComponent(exportName: string): ComponentType<SvgHostProps> {
  const mod = loadSvgModule();
  const base =
    (mod[exportName] as ComponentType<SvgHostProps> | undefined) ??
    (exportName === "Svg"
      ? (mod.default as ComponentType<SvgHostProps> | undefined)
      : undefined);
  if (!base) {
    throw new Error(
      `@nitrofoundation/nitrocss/svg: the installed react-native-svg does not export "${exportName}".`,
    );
  }
  return base;
}

/**
 * Wrap a `react-native-svg` export with the svg className preset. The wrap is
 * lazy: `react-native-svg` is resolved on first render, then cached.
 */
function styledSvg(
  exportName: string,
  displayName: string = exportName,
): CssInteropComponent<SvgHostProps> {
  let Styled: CssInteropComponent<SvgHostProps> | null = null;
  const Lazy = forwardRef<unknown, SvgHostProps & { className?: string }>(
    function NitroCssSvg(props, ref) {
      Styled ??= cssInterop(
        baseComponent(exportName),
        SVG_CSS_INTEROP_MAPPING,
        displayName,
      );
      const Comp = Styled;
      return <Comp ref={ref} {...props} />;
    },
  );
  Lazy.displayName = `NitroCss(${displayName})`;
  return Lazy as CssInteropComponent<SvgHostProps>;
}

/** Re-export a `react-native-svg` component as-is (still lazily resolved). */
function passthroughSvg(exportName: string): ComponentType<SvgHostProps> {
  const Lazy = forwardRef<unknown, SvgHostProps>(
    function NitroCssSvgPassthrough(props, ref) {
      const Base = baseComponent(exportName) as ComponentType<
        SvgHostProps & { ref?: unknown }
      >;
      return <Base ref={ref} {...props} />;
    },
  );
  Lazy.displayName = `NitroCss(${exportName})`;
  return Lazy as ComponentType<SvgHostProps>;
}

/**
 * Wrap any additional `react-native-svg` (or svg-like) component with the
 * same className → svg-prop hoisting the preset components use.
 */
export function withSvgClassName<P extends SvgHostProps>(
  Component: ComponentType<P>,
  componentName?: string,
): CssInteropComponent<P> {
  return cssInterop(
    Component,
    SVG_CSS_INTEROP_MAPPING as WithNitroCssAdvancedOptions<P>,
    componentName,
  );
}

// ---------------------------------------------------------------------------
// Pre-wrapped elements
// ---------------------------------------------------------------------------

export const Svg = styledSvg("Svg");
export const Path = styledSvg("Path");
export const Rect = styledSvg("Rect");
export const Circle = styledSvg("Circle");
export const Ellipse = styledSvg("Ellipse");
export const Line = styledSvg("Line");
export const Polygon = styledSvg("Polygon");
export const Polyline = styledSvg("Polyline");
export const G = styledSvg("G");
export const SvgText = styledSvg("Text", "SvgText");

// Structural / paint-server elements take no className — passed through as-is.
export const Defs = passthroughSvg("Defs");
export const Stop = passthroughSvg("Stop");
export const LinearGradient = passthroughSvg("LinearGradient");
export const RadialGradient = passthroughSvg("RadialGradient");
