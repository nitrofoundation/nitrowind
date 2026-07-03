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
 * The single resolved-style key carrying the parsed `clip-path` shape. The
 * value is a compact descriptor (no CSS-string parsing at paint time) consumed
 * by the engine's native clip painter; the runtime (core/normalize.ts) decides
 * web vs. native — on web it keeps the literal CSS string, on native it feeds
 * this descriptor to the ClipPathTargets registry. The compiler stays
 * platform-agnostic and only emits the marker.
 */
export const CLIP_PATH_PROP = "--nitrocss-clip-path";

/** A single clip-path coordinate: a value with its unit (`pct` is 0..100). */
export interface ClipValue {
  v: number;
  u: "pct" | "px";
}

export type ClipPathDescriptor =
  | { type: "polygon"; points: Array<[ClipValue, ClipValue]> }
  | { type: "circle"; cx: ClipValue; cy: ClipValue; r: ClipValue }
  | {
      type: "ellipse";
      cx: ClipValue;
      cy: ClipValue;
      rx: ClipValue;
      ry: ClipValue;
    }
  | {
      type: "inset";
      top: ClipValue;
      right: ClipValue;
      bottom: ClipValue;
      left: ClipValue;
      round?: number;
    }
  | { type: "path"; d: string };

/**
 * Coerce a single length/percentage token into the contract `{ v, u }` shape.
 * `50%` → `{50,"pct"}`, `12px`/`12` → `{12,"px"}`. Keyword positions
 * (`center`/`left`/…) resolve to their percentage. Returns undefined for
 * anything unparseable.
 */
function toClipValue(raw: string | undefined): ClipValue | undefined {
  if (raw === undefined) return undefined;
  const token = raw.trim().toLowerCase();
  if (!token) return undefined;
  switch (token) {
    case "left":
    case "top":
      return { v: 0, u: "pct" };
    case "right":
    case "bottom":
      return { v: 100, u: "pct" };
    case "center":
      return { v: 50, u: "pct" };
  }
  if (token.endsWith("%")) {
    const n = Number.parseFloat(token);
    return Number.isFinite(n) ? { v: n, u: "pct" } : undefined;
  }
  const n = Number.parseFloat(token.replace(/px$/, ""));
  return Number.isFinite(n) ? { v: n, u: "px" } : undefined;
}

/** Split a shape function's inner arg list on whitespace, dropping empties. */
const splitWs = (raw: string): string[] =>
  raw.trim().split(/\s+/).filter(Boolean);

/** Split a `polygon(...)` point list on commas (points have no nested parens). */
const splitPoints = (raw: string): string[] =>
  raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

function parsePolygon(raw: string): ClipPathDescriptor | undefined {
  const points: Array<[ClipValue, ClipValue]> = [];
  for (const pointRaw of splitPoints(raw)) {
    const tokens = splitWs(pointRaw);
    const x = toClipValue(tokens[0]);
    const y = toClipValue(tokens[1]);
    if (!x || !y) return undefined;
    points.push([x, y]);
  }
  return points.length >= 3 ? { type: "polygon", points } : undefined;
}

/**
 * `circle( [<radius>] [at <cx> <cy>] )`. Radius defaults to the
 * closest-side approximation `{50,"pct"}`; center defaults to `50% 50%`.
 */
function parseCircle(raw: string): ClipPathDescriptor | undefined {
  const atIdx = raw.toLowerCase().indexOf("at ");
  const radiusPart = (atIdx >= 0 ? raw.slice(0, atIdx) : raw).trim();
  const centerPart = atIdx >= 0 ? raw.slice(atIdx + 3).trim() : "";

  const r = toClipValue(splitWs(radiusPart)[0]) ?? { v: 50, u: "pct" };
  const centerTokens = splitWs(centerPart);
  const cx = toClipValue(centerTokens[0]) ?? { v: 50, u: "pct" };
  const cy = toClipValue(centerTokens[1]) ?? { v: 50, u: "pct" };
  return { type: "circle", cx, cy, r };
}

/**
 * `ellipse( [<rx> <ry>] [at <cx> <cy>] )`. Radii default to `{50,"pct"}`
 * each; center defaults to `50% 50%`.
 */
function parseEllipse(raw: string): ClipPathDescriptor | undefined {
  const atIdx = raw.toLowerCase().indexOf("at ");
  const radiusPart = (atIdx >= 0 ? raw.slice(0, atIdx) : raw).trim();
  const centerPart = atIdx >= 0 ? raw.slice(atIdx + 3).trim() : "";

  const radiusTokens = splitWs(radiusPart);
  const rx = toClipValue(radiusTokens[0]) ?? { v: 50, u: "pct" };
  const ry = toClipValue(radiusTokens[1]) ?? { v: 50, u: "pct" };
  const centerTokens = splitWs(centerPart);
  const cx = toClipValue(centerTokens[0]) ?? { v: 50, u: "pct" };
  const cy = toClipValue(centerTokens[1]) ?? { v: 50, u: "pct" };
  return { type: "ellipse", cx, cy, rx, ry };
}

/**
 * `inset( <t> [<r> [<b> [<l>]]] [round <radius>] )`. Missing edges follow the
 * CSS 1–4 value shorthand rule; missing edges default to `0`. Only a uniform
 * `round <px>` radius is captured (the first radius token).
 */
function parseInset(raw: string): ClipPathDescriptor | undefined {
  let body = raw.trim();
  let round: number | undefined;
  const roundIdx = body.toLowerCase().indexOf("round");
  if (roundIdx >= 0) {
    const roundPart = body.slice(roundIdx + "round".length).trim();
    body = body.slice(0, roundIdx).trim();
    const radius = toClipValue(splitWs(roundPart)[0]);
    if (radius) round = radius.v;
  }
  const edges = splitWs(body).map(toClipValue);
  const zero: ClipValue = { v: 0, u: "px" };
  const top = edges[0] ?? zero;
  const right = edges[1] ?? top;
  const bottom = edges[2] ?? top;
  const left = edges[3] ?? right;
  return {
    type: "inset",
    top,
    right,
    bottom,
    left,
    ...(round !== undefined ? { round } : {}),
  };
}

function parsePath(raw: string): ClipPathDescriptor | undefined {
  const match = /^\s*(?:[a-z-]+\s*,\s*)?["']([^"']*)["']\s*$/i.exec(raw);
  const d = match?.[1]?.trim();
  return d ? { type: "path", d } : undefined;
}

const SHAPE_RE = /^([a-z-]+)\((.*)\)$/is;

/**
 * Parse a CSS `clip-path` value into the compact {@link ClipPathDescriptor}
 * marker. Supports `polygon`, `circle`, `ellipse`, `inset`, and (best-effort)
 * `path`. Returns undefined for `none`, empty, or an unparseable value so the
 * generic loop leaves the node unclipped.
 */
export function extractClipPath(
  declarations: ReadonlyArray<Decl>,
  resolveVar: VarResolver,
): RNStyle | undefined {
  const raw = declarations.find((d) => d.prop === "clip-path")?.value;
  if (raw === undefined) return undefined;
  const resolved = resolveVars(raw, resolveVar).trim();
  if (!resolved || resolved.toLowerCase() === "none") return undefined;

  const match = SHAPE_RE.exec(resolved);
  if (!match) return undefined;
  const fn = match[1]!.toLowerCase();
  const args = match[2]!.trim();

  let descriptor: ClipPathDescriptor | undefined;
  switch (fn) {
    case "polygon":
      descriptor = parsePolygon(args);
      break;
    case "circle":
      descriptor = parseCircle(args);
      break;
    case "ellipse":
      descriptor = parseEllipse(args);
      break;
    case "inset":
      descriptor = parseInset(args);
      break;
    case "path":
      descriptor = parsePath(args);
      break;
  }
  if (descriptor === undefined) return undefined;
  return { [CLIP_PATH_PROP]: descriptor as unknown as RNStyle[string] };
}

/** True for declarations consumed by the clip-path parser. */
export const isClipPathProp = (prop: string): boolean =>
  prop === "clip-path" || prop === "clip-rule";
