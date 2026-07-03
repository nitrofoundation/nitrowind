import { TRANSFORM_AXES } from "../compiler/parsers/transform";
import { foldGradient as foldGradientBase } from "../compiler/parsers/gradient";
import {
  formatBoxShadow,
  spliceBoxShadowColor,
  type BoxShadowValue,
} from "../compiler/parsers/boxShadow";
import type { RNStyle } from "../compiler/types";
import { Platform } from "react-native";

/**
 * NEW visual-effect marker prop names (effects contract §"Marker prop names").
 * The compiler emits these; runtime/engine consume & STRIP them before the RN
 * commit. Defined locally (structural) so the runtime does not hard-depend on
 * the compiler agent's landing order.
 */
export const CLIP_PATH_PROP = "--nitrocss-clip-path";
export const BACKGROUND_IMAGE_PROP = "--nitrocss-background-image";
export const GRADIENT_ANGLE_PROP = "--nitrocss-gradient-angle";

/** `{ v, u }` length used by the clip-path descriptor (pct is 0..100). */
interface ClipLen {
  v: number;
  u: "pct" | "px";
}

type ClipPathDescriptor =
  | { type: "polygon"; points: Array<[ClipLen, ClipLen]> }
  | { type: "circle"; cx: ClipLen; cy: ClipLen; r: ClipLen }
  | { type: "ellipse"; cx: ClipLen; cy: ClipLen; rx: ClipLen; ry: ClipLen }
  | {
      type: "inset";
      top: ClipLen;
      right: ClipLen;
      bottom: ClipLen;
      left: ClipLen;
      round?: number;
    }
  | { type: "path"; d: string };

interface BackgroundImageDescriptor {
  url: string;
  size: "cover" | "contain" | "stretch" | "auto";
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  /** 0..1 */
  positionX: number;
  /** 0..1 */
  positionY: number;
}

function clipLen({ v, u }: ClipLen): string {
  return u === "pct" ? `${v}%` : `${v}px`;
}

/**
 * Serialize a {@link ClipPathDescriptor} back into a CSS `clip-path` value
 * (web only). Mirrors the descriptor shapes in the effects contract.
 */
function clipPathToCss(desc: ClipPathDescriptor): string | undefined {
  switch (desc.type) {
    case "polygon": {
      const pts = desc.points
        .map(([x, y]) => `${clipLen(x)} ${clipLen(y)}`)
        .join(", ");
      return `polygon(${pts})`;
    }
    case "circle":
      return `circle(${clipLen(desc.r)} at ${clipLen(desc.cx)} ${clipLen(desc.cy)})`;
    case "ellipse":
      return `ellipse(${clipLen(desc.rx)} ${clipLen(desc.ry)} at ${clipLen(desc.cx)} ${clipLen(desc.cy)})`;
    case "inset": {
      const box = `${clipLen(desc.top)} ${clipLen(desc.right)} ${clipLen(desc.bottom)} ${clipLen(desc.left)}`;
      return desc.round
        ? `inset(${box} round ${desc.round}px)`
        : `inset(${box})`;
    }
    case "path":
      return `path("${desc.d}")`;
    default:
      return undefined;
  }
}

/**
 * Route the `--nitrocss-clip-path` marker. WEB: convert the descriptor back into
 * a real CSS `clipPath` string the browser paints; DELETE the marker. NATIVE:
 * just DELETE the marker so it never reaches an RN prop — the C++ engine reads
 * the descriptor from its OWN resolve pipeline (by tag), so JS deletion here does
 * not remove it from the engine. Called next to {@link foldGradient}.
 */
export function foldClipPath(style: RNStyle): void {
  const marker = style[CLIP_PATH_PROP] as unknown as
    | ClipPathDescriptor
    | undefined;
  delete style[CLIP_PATH_PROP];
  if (Platform.OS !== "web" || marker == null || typeof marker !== "object") {
    return;
  }
  const css = clipPathToCss(marker);
  if (css) (style as Record<string, unknown>).clipPath = css;
}

/**
 * Route the `--nitrocss-background-image` marker. WEB: set the real CSS
 * `backgroundImage: url("…")` plus companion `backgroundSize` /
 * `backgroundRepeat` / `backgroundPosition` from the descriptor; DELETE the
 * marker. NATIVE: just DELETE the marker (the C++ engine paints from its own
 * resolve pipeline by tag). Called next to {@link foldGradient}.
 */
export function foldBackgroundImage(style: RNStyle): void {
  const marker = style[BACKGROUND_IMAGE_PROP] as unknown as
    | BackgroundImageDescriptor
    | undefined;
  delete style[BACKGROUND_IMAGE_PROP];
  if (Platform.OS !== "web" || marker == null || typeof marker !== "object") {
    return;
  }
  const s = style as Record<string, unknown>;
  s.backgroundImage = `url("${marker.url}")`;
  s.backgroundSize =
    marker.size === "stretch"
      ? "100% 100%"
      : marker.size === "auto"
        ? "auto"
        : marker.size; // cover | contain
  s.backgroundRepeat = marker.repeat;
  const px = Math.round((marker.positionX ?? 0.5) * 100);
  const py = Math.round((marker.positionY ?? 0.5) * 100);
  s.backgroundPosition = `${px}% ${py}%`;
}

/**
 * Platform-gated gradient fold. Native emits the compact numeric descriptor
 * (routed by the C++ engine to the platform gradient applier, which paints a
 * CAGradientLayer on the view's own layer); web keeps a real CSS
 * `backgroundImage` string since the browser owns the paint there. The native
 * C++ engine performs the identical descriptor fold so both paths agree.
 */
export function foldGradient(style: RNStyle): void {
  foldGradientBase(style, Platform.OS === "web" ? "css" : "descriptor");
}

/**
 * Fold the individual transform-axis props the compiler emits (`translateX`,
 * `rotate`, `scaleX`, …) into RN's single `transform` array, in canonical
 * order. Mutates `style` in place.
 *
 * Running this once after every matching class has been merged is what makes
 * multi-class transform composition behave like CSS: the same axis resolves
 * last-wins (plain object merge) while different axes union into one array.
 * The native C++ engine performs the identical fold so both paths agree.
 */
export function foldTransform(style: RNStyle): void {
  let transform: Array<Record<string, string | number>> | undefined;
  for (const axis of TRANSFORM_AXES) {
    const value = style[axis];
    if (value === undefined) continue;
    (transform ??= []).push({ [axis]: value as string | number });
    delete style[axis];
  }
  if (transform) style.transform = transform;
}

const BOX_SHADOW_COLOR_RE =
  /#(?:[0-9a-f]{3,8})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)|color\([^)]*\)/gi;

export function normalizeShadow(style: RNStyle): void {
  // NOTE: the `--nitrocss-backdrop-filter` marker (parsers/filter.ts) is
  // intentionally NOT stripped here anymore: `View` consumes it from the
  // JS-resolved styles to render the native `BackdropLayer`, then strips it
  // before the style reaches RN. The native C++ engine still erases it at its
  // resolve() tail so COMMITTED RN props never carry it.
  const marker = style["--nitrocss-shadow-color"];
  delete style["--nitrocss-shadow-color"];
  if (Platform.OS !== "web") {
    // The JS render path paints native shadows via the legacy iOS `shadow*` /
    // Android `elevation` fallbacks the compiler emits alongside `boxShadow`.
    // The processed `BoxShadowValue[]` the compiler now emits is for the
    // native C++ engine, whose ShadowTree re-commits splice the marker into
    // each layer and commit the array directly (NitroCssEngine.cpp
    // `normalizeShadow`) — parseable by stable RN without the experimental
    // `enableNativeCSSParsing` flag.
    delete style.boxShadow;
    return;
  }
  const boxShadow = style.boxShadow;
  if (Array.isArray(boxShadow)) {
    // The compiler emits processed `BoxShadowValue[]`; the browser owns the
    // paint on web, so fold it back into a CSS string, splicing the
    // theme-resolved shadow color into every layer first.
    const layers =
      typeof marker === "string"
        ? spliceBoxShadowColor(boxShadow as BoxShadowValue[], marker)
        : (boxShadow as BoxShadowValue[]);
    style.boxShadow = formatBoxShadow(layers);
    return;
  }
  // String fallback: layers the compiler could not lower to the processed
  // form (non-px units in arbitrary values) stay a CSS string on web; splice
  // the theme-resolved color by regex as before.
  if (typeof marker !== "string" || typeof boxShadow !== "string") {
    return;
  }
  style.boxShadow = boxShadow.replace(BOX_SHADOW_COLOR_RE, marker);
}

/**
 * The `--nitrocss-gradient-angle` marker is intentionally NOT stripped in
 * normalize. It is a runtime-only animated track (never an RN prop, never a C++
 * registry entry). `View` reads the track from the resolved styles to start the
 * per-frame {@link import("./gradientAngle").startGradientAngleDriver}, then
 * strips the marker before the style reaches RN — the same pattern `View` uses
 * for the `--nitrocss-gradient` / `--nitrocss-backdrop-filter` markers. Keeping
 * the raw track on `resolved.styles` here is what makes it available to `View`
 * without a re-scan.
 */
