import { formatHex, formatHex8, parse as parseColor } from "culori";
import type { RNStyle } from "../types";
import {
  GRADIENT_DESCRIPTOR_PROP,
  angleFromPosition,
  parseStopLocation,
  type GradientDescriptor,
} from "./gradient";

interface Decl {
  prop: string;
  value: string;
}

/**
 * The classic web gradient-border recipe, supported verbatim:
 *
 *     background: linear-gradient(white, white) padding-box,
 *                 linear-gradient(to right, darkblue, darkorchid) border-box;
 *     border: 4px solid transparent;
 *
 * Two background layers — an inner fill clipped to the padding box painted on
 * top of a gradient clipped to the border box — so the gradient shows only
 * through the transparent border ring. Radius follows `border-radius`
 * automatically (pill buttons "just work"), unlike a fixed-coordinate
 * clip-path.
 *
 * The compiler bakes the whole thing into the ONE existing gradient descriptor
 * (`--nitrocss-gradient`) plus two extra keys the native gradient applier
 * understands:
 *   - `inner`: the padding-box fill color (hex) painted as an inset sublayer
 *   - the `borderWidth`/`borderColor` RN props from the `border` shorthand,
 *     which both reserve the layout ring (RN) and size the inset (applier).
 *
 * v1 scope: literal colors (no `var()` in the layers), linear border-box
 * gradient, uniform border width. iOS paints natively; web keeps the original
 * CSS untouched through its own pipeline.
 */

/** Split on top-level commas (paren-aware), trimming each part. */
function splitTopLevel(value: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === separator && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter((p) => p.length > 0);
}

const lowerColor = (value: string): string | undefined => {
  const parsed = parseColor(value.trim());
  if (!parsed) return undefined;
  return (parsed.alpha ?? 1) < 1 ? formatHex8(parsed) : formatHex(parsed);
};

/** `linear-gradient( [<angle>|to <dir>,] <stop> [, <stop>…] )` → pieces. */
function parseLinearGradientLiteral(
  value: string,
): Pick<GradientDescriptor, "angle" | "colors" | "locations"> | undefined {
  const match = /^linear-gradient\((.*)\)$/is.exec(value.trim());
  if (!match) return undefined;
  const args = splitTopLevel(match[1]!);
  if (args.length === 0) return undefined;

  let angle = 180; // CSS default: to bottom.
  let stopArgs = args;
  const first = args[0]!.toLowerCase();
  if (first.startsWith("to ") || /^-?\d*\.?\d+deg$/.test(first)) {
    angle = angleFromPosition(first);
    stopArgs = args.slice(1);
  }
  if (stopArgs.length < 2) return undefined;

  const colors: string[] = [];
  const locations: number[] = [];
  for (let i = 0; i < stopArgs.length; i++) {
    const tokens = splitTopLevel(stopArgs[i]!, " ");
    const positionToken =
      tokens.length > 1 && tokens[tokens.length - 1]!.endsWith("%")
        ? tokens.pop()
        : undefined;
    const color = lowerColor(tokens.join(" "));
    if (!color) return undefined;
    const fallback = i / (stopArgs.length - 1);
    const previous = locations.length > 0 ? locations[locations.length - 1]! : 0;
    const location = parseStopLocation(positionToken, fallback);
    colors.push(color);
    locations.push(location < previous ? previous : location);
  }
  return { angle, colors, locations };
}

/** Strip the trailing `padding-box`/`border-box` origin/clip keywords. */
function stripBoxKeywords(layer: string): {
  value: string;
  box: "padding" | "border" | undefined;
} {
  let box: "padding" | "border" | undefined;
  const value = layer
    .replace(/\b(padding-box|border-box|content-box)\b/gi, (kw) => {
      const k = kw.toLowerCase();
      if (k === "padding-box") box ??= "padding";
      if (k === "border-box") box = box === "padding" ? box : "border";
      return "";
    })
    .trim();
  return { value, box };
}

/** The padding-box layer: `linear-gradient(c, c)` idiom or a plain color. */
function innerFillColor(value: string): string | undefined {
  const gradient = parseLinearGradientLiteral(value);
  if (gradient) return gradient.colors[0];
  return lowerColor(value);
}

/** `border: <width> <style> <color>` → RN border props (uniform, v1). */
function parseBorderShorthand(value: string): RNStyle | undefined {
  const out: RNStyle = {};
  for (const token of splitTopLevel(value, " ")) {
    const width = /^(\d*\.?\d+)px$/.exec(token);
    if (width) {
      out.borderWidth = Number.parseFloat(width[1]!);
      continue;
    }
    if (/^(solid|dashed|dotted)$/i.test(token)) {
      out.borderStyle = token.toLowerCase();
      continue;
    }
    const color = lowerColor(token);
    if (color) out.borderColor = color;
  }
  return out.borderWidth !== undefined ? out : undefined;
}

/** True when this rule's `background`/`border` decls were consumed here. */
export const isBorderGradientProp = (prop: string): boolean =>
  prop === "background" || prop === "border";

/**
 * Detect + fold the two-layer padding-box/border-box background. Returns the
 * baked descriptor (+ border props) or undefined when the rule doesn't use the
 * pattern, leaving its declarations to the other parsers.
 */
export function extractBorderGradient(
  declarations: ReadonlyArray<Decl>,
): RNStyle | undefined {
  const background = declarations.find(
    (d) =>
      (d.prop === "background" || d.prop === "background-image") &&
      /border-box/i.test(d.value) &&
      /gradient\(/i.test(d.value),
  );
  if (!background) return undefined;

  const layers = splitTopLevel(background.value).map(stripBoxKeywords);
  if (layers.length !== 2) return undefined;
  const gradientLayer = layers.find((l) => l.box === "border");
  const innerLayer = layers.find((l) => l.box === "padding");
  if (!gradientLayer || !innerLayer) return undefined;

  const gradient = parseLinearGradientLiteral(gradientLayer.value);
  const inner = innerFillColor(innerLayer.value);
  if (!gradient || !inner) return undefined;

  const descriptor: GradientDescriptor & { inner: string } = {
    gradientType: "linear",
    angle: gradient.angle,
    positionX: 0.5,
    positionY: 0.5,
    colors: gradient.colors,
    locations: gradient.locations,
    inner,
  };
  const out: RNStyle = {
    [GRADIENT_DESCRIPTOR_PROP]: descriptor as unknown as RNStyle[string],
  };

  const border = declarations.find((d) => d.prop === "border");
  if (border) {
    const borderProps = parseBorderShorthand(border.value);
    if (borderProps) Object.assign(out, borderProps);
  }
  return out;
}
