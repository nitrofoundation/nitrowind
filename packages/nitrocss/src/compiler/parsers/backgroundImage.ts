import type { VarResolver } from "../insetValue";
import type { RNStyle } from "../types";

interface Decl {
  prop: string;
  value: string;
}

const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;

const resolveVars = (expr: string, resolveVar: VarResolver): string =>
  expr.replace(VAR_RE, (_, name: string, fallback?: string) => {
    const v = resolveVar(name);
    return v ?? (fallback !== undefined ? fallback.trim() : "");
  });

/**
 * The single resolved-style key carrying a `background-image: url(...)`. The
 * value is a compact descriptor consumed by the engine's native background
 * painter (BackgroundImageTargets); the web runtime keeps the literal CSS
 * instead. Gradients are NOT captured here — they flow through the gradient
 * parser into {@link GRADIENT_DESCRIPTOR_PROP}.
 */
export const BACKGROUND_IMAGE_PROP = "--nitrocss-background-image";
export const BACKGROUND_IMAGE_RAW_PROP = "--nw-background-image-raw";
export const BACKGROUND_IMAGE_SIZE_PROP = "--nw-background-image-size";
export const BACKGROUND_IMAGE_REPEAT_PROP = "--nw-background-image-repeat";
export const BACKGROUND_IMAGE_POSITION_PROP = "--nw-background-image-position";

export interface BackgroundImageDescriptor {
  type?: "url";
  url: string;
  size: "cover" | "contain" | "stretch" | "auto";
  repeat: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  /** Horizontal focal point as a fraction of the box (`0..1`). */
  positionX: number;
  /** Vertical focal point as a fraction of the box (`0..1`). */
  positionY: number;
}

export interface BackgroundImageNoneDescriptor {
  type: "none";
}

/** Extract the URL from a `url("…")` / `url(…)` token, else undefined. */
function parseUrl(value: string): string | undefined {
  const match = /^\s*url\(\s*(['"]?)([^'")]*)\1\s*\)\s*$/i.exec(value);
  const url = match?.[2]?.trim();
  return url ? url : undefined;
}

function parseSize(raw: string | undefined): BackgroundImageDescriptor["size"] {
  if (!raw) return "auto";
  const value = raw.trim().toLowerCase();
  if (value === "cover" || value === "contain") return value;
  if (value.replace(/\s+/g, " ") === "100% 100%") return "stretch";
  return "auto";
}

function parseRepeat(
  raw: string | undefined,
): BackgroundImageDescriptor["repeat"] {
  if (!raw) return "no-repeat";
  const value = raw.trim().toLowerCase();
  if (
    value === "repeat" ||
    value === "repeat-x" ||
    value === "repeat-y" ||
    value === "no-repeat"
  ) {
    return value;
  }
  return "no-repeat";
}

/** Map a single-axis position keyword / percentage to a `0..1` fraction. */
function positionAxis(
  token: string | undefined,
  axis: "x" | "y",
): number | undefined {
  if (!token) return undefined;
  const value = token.trim().toLowerCase();
  switch (value) {
    case "center":
      return 0.5;
    case "left":
      return axis === "x" ? 0 : undefined;
    case "right":
      return axis === "x" ? 1 : undefined;
    case "top":
      return axis === "y" ? 0 : undefined;
    case "bottom":
      return axis === "y" ? 1 : undefined;
  }
  if (value.endsWith("%")) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : undefined;
  }
  return undefined;
}

/**
 * Resolve `background-position` (keywords/percentages) into `0..1` focal
 * fractions. Keyword order is normalized so `top left` and `left top` both
 * resolve correctly. Defaults to center (`0.5, 0.5`).
 */
function parsePosition(raw: string | undefined): { x: number; y: number } {
  let x = 0.5;
  let y = 0.5;
  if (!raw) return { x, y };
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Resolve axis-locked keywords first (top/bottom → y, left/right → x) so
  // order-independent forms like `top left` land on the right axis.
  const remaining: string[] = [];
  for (const token of tokens) {
    if (token === "left" || token === "right") x = positionAxis(token, "x")!;
    else if (token === "top" || token === "bottom") {
      y = positionAxis(token, "y")!;
    } else remaining.push(token);
  }
  // Positional (percent / center) tokens fill x then y in order.
  if (remaining[0] !== undefined) {
    const px = positionAxis(remaining[0], "x");
    if (px !== undefined) x = px;
  }
  if (remaining[1] !== undefined) {
    const py = positionAxis(remaining[1], "y");
    if (py !== undefined) y = py;
  }
  return { x, y };
}

/**
 * Extract a `background-image: url(...)` (plus its companion
 * `background-size` / `background-repeat` / `background-position`
 * declarations) into the {@link BACKGROUND_IMAGE_PROP} descriptor. Returns
 * undefined when `background-image` is absent or a gradient — the gradient
 * parser owns gradients. `none` is retained as an explicit sentinel so it can
 * override an earlier image bucket and clear already-mounted native paint.
 */
export function extractBackgroundImage(
  declarations: ReadonlyArray<Decl>,
  resolveVar: VarResolver,
): RNStyle | undefined {
  const raw = declarations.find((d) => d.prop === "background-image")?.value;
  if (raw === undefined) return undefined;
  if (/gradient\(/i.test(raw)) {
    return {
      [BACKGROUND_IMAGE_PROP]: {
        type: "none",
      } as unknown as RNStyle[string],
    };
  }
  if (raw.includes("var(")) {
    const size = declarations.find((d) => d.prop === "background-size")?.value;
    const repeat = declarations.find((d) => d.prop === "background-repeat")?.value;
    const position = declarations.find(
      (d) => d.prop === "background-position",
    )?.value;
    return {
      [BACKGROUND_IMAGE_PROP]: {
        type: "none",
      } as unknown as RNStyle[string],
      [BACKGROUND_IMAGE_RAW_PROP]: raw,
      ...(size ? { [BACKGROUND_IMAGE_SIZE_PROP]: size } : {}),
      ...(repeat ? { [BACKGROUND_IMAGE_REPEAT_PROP]: repeat } : {}),
      ...(position ? { [BACKGROUND_IMAGE_POSITION_PROP]: position } : {}),
    };
  }
  const resolved = resolveVars(raw, resolveVar).trim();
  if (!resolved) return undefined;
  if (resolved.toLowerCase() === "none") {
    return {
      [BACKGROUND_IMAGE_PROP]: {
        type: "none",
      } as unknown as RNStyle[string],
    };
  }
  // Gradients are handled by the gradient parser — leave them alone.
  const url = parseUrl(resolved);
  if (url === undefined) return undefined;

  const sizeRaw = declarations.find((d) => d.prop === "background-size")?.value;
  const repeatRaw = declarations.find(
    (d) => d.prop === "background-repeat",
  )?.value;
  const positionRaw = declarations.find(
    (d) => d.prop === "background-position",
  )?.value;

  const position = parsePosition(
    positionRaw ? resolveVars(positionRaw, resolveVar) : undefined,
  );

  const descriptor: BackgroundImageDescriptor = {
    url,
    size: parseSize(sizeRaw ? resolveVars(sizeRaw, resolveVar) : undefined),
    repeat: parseRepeat(
      repeatRaw ? resolveVars(repeatRaw, resolveVar) : undefined,
    ),
    positionX: position.x,
    positionY: position.y,
  };
  return { [BACKGROUND_IMAGE_PROP]: descriptor as unknown as RNStyle[string] };
}

/**
 * True for declarations the background-image parser consumes. `background-image`
 * is shared with the gradient parser: this only causes the generic value loop
 * to SKIP these props (so they never produce junk RN props) — the extractor
 * itself decides url-vs-gradient.
 */
export const isBackgroundImageProp = (prop: string): boolean =>
  prop === "background-image" ||
  prop === "background-size" ||
  prop === "background-repeat" ||
  prop === "background-position";
