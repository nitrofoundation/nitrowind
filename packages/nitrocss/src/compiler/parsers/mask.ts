import type { VarResolver } from "../insetValue";
import type { RNStyle } from "../types";
import {
  extractGradient,
  foldGradient,
  GRADIENT_DESCRIPTOR_PROP,
  type GradientDescriptor,
} from "./gradient";

interface Decl {
  prop: string;
  value: string;
}

export const MASK_DESCRIPTOR_PROP = "--nitrocss-mask";
export const MASK_SOURCE_PROP = "--nw-mask-source";
export const MASK_MODE_PROP = "--nw-mask-mode";
export const MASK_SIZE_PROP = "--nw-mask-size";
export const MASK_REPEAT_PROP = "--nw-mask-repeat";
export const MASK_POSITION_PROP = "--nw-mask-position";

export type MaskSource =
  | { type: "none"; raw: "none" }
  | { type: "url"; url: string; raw: string }
  | { type: "gradient"; gradient: GradientDescriptor; raw: string };

export interface MaskDescriptor {
  source: MaskSource;
  mode: "alpha" | "luminance" | "match-source";
  size: "cover" | "contain" | "stretch" | "auto";
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  positionX: number;
  positionY: number;
}

const parseUrl = (value: string): string | undefined => {
  const match = /^\s*url\(\s*(['"]?)([^'")]*)\1\s*\)\s*$/i.exec(value);
  const url = match?.[2]?.trim();
  return url || undefined;
};

function parseSource(value: string, resolveVar: VarResolver): MaskSource | undefined {
  const raw = value.trim();
  if (raw.toLowerCase() === "none") return { type: "none", raw: "none" };
  const url = parseUrl(raw);
  if (url) return { type: "url", url, raw };
  if (!/^(?:linear|radial|conic)-gradient\(/i.test(raw)) return undefined;
  const markers = extractGradient(
    [{ prop: "background-image", value: raw }],
    resolveVar,
  );
  if (!markers) return undefined;
  foldGradient(markers, "descriptor");
  const gradient = markers[GRADIENT_DESCRIPTOR_PROP] as unknown as
    | GradientDescriptor
    | undefined;
  return gradient ? { type: "gradient", gradient, raw } : undefined;
}

export function extractMask(
  declarations: ReadonlyArray<Decl>,
  resolveVar: VarResolver,
): RNStyle | undefined {
  const out: RNStyle = {};
  const image = declarations.find((d) => d.prop === "mask-image")?.value ??
    declarations.find((d) => d.prop === "-webkit-mask-image")?.value;
  if (image !== undefined) {
    const source = parseSource(image, resolveVar);
    if (source) out[MASK_SOURCE_PROP] = source as unknown as RNStyle[string];
  }
  const mode = declarations.find((d) => d.prop === "mask-mode")?.value ??
    declarations.find((d) => d.prop === "-webkit-mask-source-type")?.value;
  const size = declarations.find((d) => d.prop === "mask-size")?.value ??
    declarations.find((d) => d.prop === "-webkit-mask-size")?.value;
  const repeat = declarations.find((d) => d.prop === "mask-repeat")?.value ??
    declarations.find((d) => d.prop === "-webkit-mask-repeat")?.value;
  const position = declarations.find((d) => d.prop === "mask-position")?.value ??
    declarations.find((d) => d.prop === "-webkit-mask-position")?.value;
  if (mode) out[MASK_MODE_PROP] = mode;
  if (size) out[MASK_SIZE_PROP] = size;
  if (repeat) out[MASK_REPEAT_PROP] = repeat;
  if (position) out[MASK_POSITION_PROP] = position;
  return Object.keys(out).length ? out : undefined;
}

export const isMaskProp = (prop: string): boolean =>
  prop === "mask-image" ||
  prop === "-webkit-mask-image" ||
  prop === "mask-mode" ||
  prop === "-webkit-mask-source-type" ||
  prop === "mask-size" ||
  prop === "-webkit-mask-size" ||
  prop === "mask-repeat" ||
  prop === "-webkit-mask-repeat" ||
  prop === "mask-position" ||
  prop === "-webkit-mask-position" ||
  prop === "mask-composite" ||
  prop === "-webkit-mask-composite";
