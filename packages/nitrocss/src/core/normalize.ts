import { TRANSFORM_AXES } from "../compiler/parsers/transform";
import { foldGradient as foldGradientBase } from "../compiler/parsers/gradient";
import {
  formatBoxShadow,
  spliceBoxShadowColor,
  type BoxShadowValue,
} from "../compiler/parsers/boxShadow";
import type { RNStyle } from "../compiler/types";
import {
  FILTER_DESCRIPTOR_PROP,
  type FilterDescriptorEntry,
} from "../compiler/parsers/filter";
import { Platform } from "react-native";
import {
  BACKGROUND_IMAGE_POSITION_PROP,
  BACKGROUND_IMAGE_RAW_PROP,
  BACKGROUND_IMAGE_REPEAT_PROP,
  BACKGROUND_IMAGE_SIZE_PROP,
} from "../compiler/parsers/backgroundImage";
import {
  MASK_DESCRIPTOR_PROP,
  MASK_MODE_PROP,
  MASK_POSITION_PROP,
  MASK_REPEAT_PROP,
  MASK_SIZE_PROP,
  MASK_SOURCE_PROP,
  type MaskDescriptor,
  type MaskSource,
} from "../compiler/parsers/mask";

/**
 * NEW visual-effect marker prop names (effects contract §"Marker prop names").
 * The compiler emits these; runtime/engine consume & STRIP them before the RN
 * commit. Defined locally (structural) so the runtime does not hard-depend on
 * the compiler agent's landing order.
 */
export const CLIP_PATH_PROP = "--nitrocss-clip-path";
export const BACKGROUND_IMAGE_PROP = "--nitrocss-background-image";
export const GRADIENT_ANGLE_PROP = "--nitrocss-gradient-angle";
export const MASK_TRANSFORM_PROP = "--nitrocss-mask-transform";

const maskAxis = (token: string | undefined, axis: "x" | "y"): number | undefined => {
  if (!token) return undefined;
  if (token === "center") return 0.5;
  if (axis === "x" && token === "left") return 0;
  if (axis === "x" && token === "right") return 1;
  if (axis === "y" && token === "top") return 0;
  if (axis === "y" && token === "bottom") return 1;
  if (token.endsWith("%")) {
    const value = Number.parseFloat(token);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : undefined;
  }
  return undefined;
};

/** Assemble independently-authored mask source/geometry utilities. */
export function foldMask(style: RNStyle): void {
  const source = style[MASK_SOURCE_PROP] as unknown as MaskSource | undefined;
  const modeRaw = style[MASK_MODE_PROP];
  const sizeRaw = style[MASK_SIZE_PROP];
  const repeatRaw = style[MASK_REPEAT_PROP];
  const positionRaw = style[MASK_POSITION_PROP];
  delete style[MASK_SOURCE_PROP];
  delete style[MASK_MODE_PROP];
  delete style[MASK_SIZE_PROP];
  delete style[MASK_REPEAT_PROP];
  delete style[MASK_POSITION_PROP];
  if (!source) return;

  if (Platform.OS === "web") {
    const web = style as Record<string, unknown>;
    web.maskImage = source.raw;
    if (typeof modeRaw === "string") web.maskMode = modeRaw;
    if (typeof sizeRaw === "string") web.maskSize = sizeRaw;
    if (typeof repeatRaw === "string") web.maskRepeat = repeatRaw;
    if (typeof positionRaw === "string") web.maskPosition = positionRaw;
    return;
  }

  const position = typeof positionRaw === "string"
    ? positionRaw.trim().toLowerCase().split(/\s+/)
    : [];
  // CSS mask-position defaults to 0% 0%. A single component leaves the other
  // axis centered (for example `center`, `left`, or `25%`).
  let x = 0;
  let y = 0;
  if (position.length === 1) {
    const token = position[0]!;
    if (token === "center") x = y = 0.5;
    else if (token === "left" || token === "right") {
      x = maskAxis(token, "x") ?? x;
      y = 0.5;
    } else if (token === "top" || token === "bottom") {
      x = 0.5;
      y = maskAxis(token, "y") ?? y;
    } else {
      x = maskAxis(token, "x") ?? x;
      y = 0.5;
    }
  }
  for (const token of position) {
    const px = maskAxis(token, "x");
    const py = maskAxis(token, "y");
    if (token === "left" || token === "right") x = px ?? x;
    else if (token === "top" || token === "bottom") y = py ?? y;
  }
  const remaining = position.filter(
    (token) => !["left", "right", "top", "bottom"].includes(token),
  );
  if (position.length > 1) {
    x = maskAxis(remaining[0], "x") ?? x;
    y = maskAxis(remaining[1], "y") ?? y;
  }
  const descriptor: MaskDescriptor = {
    source,
    mode:
      modeRaw === "luminance" || modeRaw === "alpha"
        ? modeRaw
        : "match-source",
    size:
      sizeRaw === "cover" || sizeRaw === "contain"
        ? sizeRaw
        : sizeRaw === "100% 100%"
          ? "stretch"
          : "auto",
    repeat:
      repeatRaw === "repeat" || repeatRaw === "repeat-x" || repeatRaw === "repeat-y"
        ? repeatRaw
        : "no-repeat",
    positionX: x,
    positionY: y,
  };
  style[MASK_DESCRIPTOR_PROP] = descriptor as unknown as RNStyle[string];
}

/** Expand the compact ordered filter IR into React Native's filter objects. */
export function foldFilter(style: RNStyle): void {
  const descriptor = style[FILTER_DESCRIPTOR_PROP] as unknown as
    | FilterDescriptorEntry[]
    | undefined;
  delete style[FILTER_DESCRIPTOR_PROP];
  if (!Array.isArray(descriptor)) return;
  const names = [
    "blur",
    "brightness",
    "contrast",
    "grayscale",
    "hueRotate",
    "invert",
    "opacity",
    "saturate",
    "sepia",
  ] as const;
  const filters: Array<Record<string, unknown>> = [];
  for (const entry of descriptor) {
    if (!Array.isArray(entry)) continue;
    if (entry[0] === 9) {
      filters.push({
        dropShadow: {
          offsetX: entry[1],
          offsetY: entry[2],
          standardDeviation: entry[3],
          color: entry[4],
        },
      });
      continue;
    }
    const name = names[entry[0]];
    if (name) filters.push({ [name]: entry[1] });
  }
  style.filter = filters as RNStyle["filter"];
}

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
  | { type: "path"; d: string; fr?: "evenodd" };

interface BackgroundImageDescriptor {
  type?: "url";
  url: string;
  size: "cover" | "contain" | "stretch" | "auto";
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  /** 0..1 */
  positionX: number;
  /** 0..1 */
  positionY: number;
}

interface BackgroundImageNoneDescriptor {
  type: "none";
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
      return desc.fr === "evenodd"
        ? `path(evenodd, "${desc.d}")`
        : `path("${desc.d}")`;
    default:
      return undefined;
  }
}

/**
 * Route the `--nitrocss-clip-path` marker. WEB: convert the descriptor back into
 * a real CSS `clipPath` string the browser paints and delete the marker. Native
 * keeps the marker until `View` consumes it: the marker is how `View` knows the
 * node must be linked to the C++ engine and kept out of Fabric flattening. `View`
 * strips it before composing the host style, so it never reaches an RN prop.
 */
export function foldClipPath(style: RNStyle): void {
  const marker = style[CLIP_PATH_PROP] as unknown as
    | ClipPathDescriptor
    | undefined;
  if (Platform.OS !== "web") return;
  delete style[CLIP_PATH_PROP];
  if (marker == null || typeof marker !== "object") {
    return;
  }
  const css = clipPathToCss(marker);
  if (css) (style as Record<string, unknown>).clipPath = css;
}

/**
 * Route the `--nitrocss-background-image` marker. WEB: set the real CSS
 * `backgroundImage: url("…")` plus companion `backgroundSize` /
 * `backgroundRepeat` / `backgroundPosition` from the descriptor; DELETE the
 * marker. Native keeps the marker until `View` uses it to opt into native
 * registration and prevent Fabric flattening, then strips it from the host
 * style. The C++ engine paints from its own resolve pipeline by tag.
 */
export function foldBackgroundImage(style: RNStyle): void {
  const raw = style[BACKGROUND_IMAGE_RAW_PROP];
  if (typeof raw === "string") {
    const url = /^\s*url\(\s*(['"]?)([^'")]*)\1\s*\)\s*$/i.exec(raw)?.[2]?.trim();
    if (url) {
      const positionRaw = style[BACKGROUND_IMAGE_POSITION_PROP];
      const tokens = typeof positionRaw === "string"
        ? positionRaw.trim().toLowerCase().split(/\s+/)
        : [];
      const axis = (value: string | undefined, fallback: number): number => {
        if (value === "left" || value === "top") return 0;
        if (value === "right" || value === "bottom") return 1;
        if (value === "center") return 0.5;
        if (value?.endsWith("%")) return Math.max(0, Math.min(1, parseFloat(value) / 100));
        return fallback;
      };
      style[BACKGROUND_IMAGE_PROP] = {
        url,
        size: style[BACKGROUND_IMAGE_SIZE_PROP] ?? "auto",
        repeat: style[BACKGROUND_IMAGE_REPEAT_PROP] ?? "no-repeat",
        positionX: axis(tokens[0], 0.5),
        positionY: axis(tokens[1], 0.5),
      } as unknown as RNStyle[string];
    }
  }
  delete style[BACKGROUND_IMAGE_RAW_PROP];
  delete style[BACKGROUND_IMAGE_SIZE_PROP];
  delete style[BACKGROUND_IMAGE_REPEAT_PROP];
  delete style[BACKGROUND_IMAGE_POSITION_PROP];

  const marker = style[BACKGROUND_IMAGE_PROP] as unknown as
    | BackgroundImageDescriptor
    | BackgroundImageNoneDescriptor
    | undefined;
  if (marker == null || typeof marker !== "object") {
    return;
  }
  if (marker.type === "none") {
    delete style[BACKGROUND_IMAGE_PROP];
    if (Platform.OS === "web") style.backgroundImage = "none";
    return;
  }
  if (Platform.OS !== "web") return;
  delete style[BACKGROUND_IMAGE_PROP];
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

/** "6s" | "600ms" | 600 → milliseconds. */
function toMs(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const s = v.trim();
  if (s.endsWith("ms")) return parseFloat(s) || 0;
  if (s.endsWith("s")) return (parseFloat(s) || 0) * 1000;
  return parseFloat(s) || 0;
}

/** "infinite" | "3" | 3 → count (-1 for infinite). */
function toIterations(v: unknown): number {
  if (v === "infinite") return -1;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 1;
}

/** Keyframe key ("0%"|"from"|"to"|"50%") → offset 0..1. */
function stepOffset(key: string): number {
  if (key === "from") return 0;
  if (key === "to") return 1;
  const n = parseFloat(key);
  return Number.isFinite(n) ? n / 100 : 0;
}

/**
 * Derive the animated gradient-angle track at RUNTIME. Tailwind compiles the
 * gradient utilities and the angle animation to SEPARATE classes, so the
 * compiler can't tie them together per-class — but by the time styles resolve,
 * the merged node carries BOTH the folded linear/conic `--nitrocss-gradient` and an
 * `animationName` whose keyframes animate an angle custom property. Here we
 * lift that into a `--nitrocss-gradient-angle` track (read by `View`, driven
 * per-frame through the native override channel) and remove the angle custom
 * property from `animationName` so Reanimated doesn't run a no-op animation.
 * Native only — on web the browser interpolates the angle via `@property`.
 */
export function foldGradientAngle(style: RNStyle): void {
  if (Platform.OS === "web") return;
  const gradient = style["--nitrocss-gradient"] as
    | { gradientType?: string }
    | undefined;
  if (
    gradient == null ||
    typeof gradient !== "object" ||
    (gradient.gradientType !== "linear" && gradient.gradientType !== "conic")
  ) {
    return;
  }
  const animationName = style.animationName as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (animationName == null || typeof animationName !== "object") return;

  // Find an angle-bearing custom property across the keyframe steps.
  let angleProp: string | undefined;
  for (const step of Object.values(animationName)) {
    if (step == null || typeof step !== "object") continue;
    for (const [prop, value] of Object.entries(step)) {
      if (prop.startsWith("--") && prop.includes("angle") && typeof value === "number") {
        angleProp = prop;
        break;
      }
    }
    if (angleProp) break;
  }
  if (!angleProp) return;

  const keyframes = Object.entries(animationName)
    .map(([key, step]) => ({
      at: stepOffset(key),
      angle: typeof step?.[angleProp] === "number" ? (step[angleProp] as number) : 0,
    }))
    .filter((k) => k.angle !== undefined)
    .sort((a, b) => a.at - b.at);
  if (keyframes.length < 2) return;

  style[GRADIENT_ANGLE_PROP] = {
    durationMs: toMs(style.animationDuration),
    delayMs: toMs(style.animationDelay),
    iterations: toIterations(style.animationIterationCount),
    direction: (style.animationDirection as string) ?? "normal",
    easing: (style.animationTimingFunction as string) ?? "linear",
    keyframes,
  } as unknown as RNStyle[string];

  // Strip the angle custom prop into NEW step objects — never in place. The
  // merged style holds the compiled table's keyframe objects BY REFERENCE
  // (applyBucketStyle assigns shallowly), so an in-place `delete` would destroy
  // the angle keyframes for every node that resolves the same class afterwards:
  // the first animated node works, all later ones render a static gradient.
  let remainingProps = false;
  const stripped: Record<string, Record<string, unknown>> = {};
  for (const [key, step] of Object.entries(animationName)) {
    if (step && typeof step === "object") {
      const { [angleProp]: _angle, ...rest } = step;
      stripped[key] = rest;
      if (Object.keys(rest).length > 0) remainingProps = true;
    }
  }
  if (!remainingProps) {
    delete style.animationName;
    delete style.animationDuration;
    delete style.animationTimingFunction;
    delete style.animationIterationCount;
    delete style.animationDelay;
    delete style.animationDirection;
  } else {
    style.animationName = stripped as unknown as RNStyle[string];
  }
}

/**
 * Lift mask-only angle/scale custom properties out of CSS keyframes. The
 * resulting track is consumed by View's JSI driver and applied to the native
 * mask layer, never to the host view or its photo/background content.
 */
export function foldMaskTransform(style: RNStyle): void {
  if (Platform.OS === "web") return;
  const mask = style[MASK_DESCRIPTOR_PROP];
  if (mask == null || typeof mask !== "object") return;
  const animationName = style.animationName as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (animationName == null || typeof animationName !== "object") return;

  const entries = Object.entries(animationName).sort(
    ([a], [b]) => stepOffset(a) - stepOffset(b),
  );
  let angle = 0;
  let scale = 1;
  const keyframes = entries.map(([key, step]) => {
    if (typeof step?.["--mask-angle"] === "number") {
      angle = step["--mask-angle"] as number;
    }
    if (typeof step?.["--mask-scale"] === "number") {
      scale = step["--mask-scale"] as number;
    }
    return { at: stepOffset(key), angle, scale };
  });
  if (
    keyframes.length < 2 ||
    !entries.some(([, step]) =>
      typeof step?.["--mask-angle"] === "number" ||
      typeof step?.["--mask-scale"] === "number",
    )
  ) return;

  style[MASK_TRANSFORM_PROP] = {
    durationMs: toMs(style.animationDuration),
    delayMs: toMs(style.animationDelay),
    iterations: toIterations(style.animationIterationCount),
    direction: (style.animationDirection as string) ?? "normal",
    easing: (style.animationTimingFunction as string) ?? "linear",
    keyframes,
  } as unknown as RNStyle[string];

  let remainingProps = false;
  const stripped: Record<string, Record<string, unknown>> = {};
  for (const [key, step] of Object.entries(animationName)) {
    const {
      ["--mask-angle"]: _angle,
      ["--mask-scale"]: _scale,
      ...rest
    } = step;
    stripped[key] = rest;
    if (Object.keys(rest).length > 0) remainingProps = true;
  }
  if (!remainingProps) {
    delete style.animationName;
    delete style.animationDuration;
    delete style.animationTimingFunction;
    delete style.animationIterationCount;
    delete style.animationDelay;
    delete style.animationDirection;
  } else {
    style.animationName = stripped as unknown as RNStyle[string];
  }
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
