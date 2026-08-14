/**
 * CSS animation + Reanimated value parsing.
 *
 * Two distinct mechanisms share this file:
 *
 * 1. **CSS `@keyframes` animations** (`animate-wiggle`, …). The `animation`
 *    shorthand + the matching `@keyframes` block are folded — at compile time —
 *    into the discrete `animation*` style props Reanimated's CSS-animation
 *    engine consumes (`animationName`, `animationDuration`, …). These run
 *    natively with no JS driver.
 *
 * 2. **Reanimated entering/exiting/layout presets** (`entering-fade-in`, …),
 *    which compile to `--reanimated-*` custom properties. Those are *kept* in
 *    the bucket so the runtime can rebuild the Reanimated animation object on
 *    the JS/UI thread (see `src/core/reanimated.ts`).
 */

import { toRNProperty, toRNValue } from "../toRNValue";
import { extractTextShadow } from "./textShadow";
import type { Keyframes, KeyframeStep, RNStyle } from "../types";

export const REANIMATED_VAR_PREFIX = "--reanimated-";

/** True for a Reanimated entering/exiting/layout custom property. */
export const isReanimatedVar = (prop: string): boolean =>
  prop.startsWith(REANIMATED_VAR_PREFIX);

/** True for the CSS `animation` shorthand (the only animation prop we fold). */
export const isAnimationProp = (prop: string): boolean => prop === "animation";

/** True for CSS transition declarations consumed by Reanimated's CSS engine. */
export const isTransitionProp = (prop: string): boolean =>
  prop === "transition-property" ||
  prop === "transition-duration" ||
  prop === "transition-delay" ||
  prop === "transition-timing-function";

/** Collect a rule's `--reanimated-*` declarations into a plain object. */
export const extractReanimatedVars = (
  declarations: ReadonlyArray<{ prop: string; value: string }>,
): Record<string, string> => {
  const vars: Record<string, string> = {};
  for (const d of declarations) {
    if (isReanimatedVar(d.prop)) vars[d.prop] = d.value.trim();
  }
  return vars;
};

const TRANSFORM_FN_RE = /([a-zA-Z]+)\(([^)]*)\)/g;
const ANGLE_RE = /^-?\d*\.?\d+(deg|rad|grad|turn)$/;
const PERCENT_RE = /^[+-]?\d*\.?\d+%$/;
const VAR_TOKEN_RE =
  /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*|var\([^)]*\)))?\s*\)/g;

const lengthToNumber = (raw: string, rem: number): number => {
  const value = raw.trim();
  const m = /^(-?\d*\.?\d+)(px|rem|em|pt)?$/.exec(value);
  if (!m) return Number.parseFloat(value) || 0;
  const num = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? num * rem : num;
};

function resolveVars(
  value: string,
  resolveVar: (name: string) => string | undefined,
): string {
  let current = value;
  for (let i = 0; i < 5 && current.includes("var("); i++) {
    const next = current.replace(
      VAR_TOKEN_RE,
      (_match, name: string, fallback?: string) =>
        resolveVar(name) ?? fallback?.trim() ?? "",
    );
    if (next === current) break;
    current = next;
  }
  return current.trim();
}

const splitCommaList = (value: string): string[] => {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;
    if (ch === "," && depth === 0) {
      const item = current.trim();
      if (item) out.push(item);
      current = "";
      continue;
    }
    current += ch;
  }
  const item = current.trim();
  if (item) out.push(item);
  return out;
};

const timeToMs = (value: string): number | string => {
  const raw = value.trim();
  if (raw.endsWith("ms")) return Number.parseFloat(raw);
  if (raw.endsWith("s")) return Number.parseFloat(raw) * 1000;
  return Number.isNaN(Number(raw)) ? raw : Number(raw);
};

export const normalizeTimingFunction = (value: string): string => {
  const raw = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (TIMING_FUNCTIONS.has(raw)) return raw;

  const compact = raw.replace(/\s+/g, "");
  switch (compact) {
    case "cubic-bezier(.4,0,1,1)":
    case "cubic-bezier(0.4,0,1,1)":
      return "ease-in";
    case "cubic-bezier(0,0,.2,1)":
    case "cubic-bezier(0,0,0.2,1)":
      return "ease-out";
    case "cubic-bezier(.4,0,.2,1)":
    case "cubic-bezier(0.4,0,0.2,1)":
      return "ease-in-out";
    case "cubic-bezier(0,0,1,1)":
      return "linear";
    case "cubic-bezier(.25,.1,.25,1)":
    case "cubic-bezier(0.25,0.1,0.25,1)":
      return "ease";
    default:
      return compact.startsWith("cubic-bezier(") ? "ease" : raw;
  }
};

const transitionProperty = (value: string): string | readonly string[] => {
  if (value.trim() === "all") return "all";
  const properties = splitCommaList(value)
    .filter((prop) => !prop.startsWith("--"))
    .map((prop) => toRNProperty(prop));
  return properties.length === 1 ? properties[0]! : properties;
};

/** Coerce a CSS transition declaration into Reanimated's RN style props. */
export function foldTransition(
  prop: string,
  value: string,
  resolveVar: (name: string) => string | undefined,
): RNStyle | undefined {
  const resolved = resolveVars(value, resolveVar);
  if (!resolved) return undefined;
  switch (prop) {
    case "transition-property":
      return { transitionProperty: transitionProperty(resolved) };
    case "transition-duration": {
      const values = splitCommaList(resolved).map(timeToMs);
      return { transitionDuration: values.length === 1 ? values[0]! : values };
    }
    case "transition-delay": {
      const values = splitCommaList(resolved).map(timeToMs);
      return { transitionDelay: values.length === 1 ? values[0]! : values };
    }
    case "transition-timing-function": {
      const values = splitCommaList(resolved).map(normalizeTimingFunction);
      return {
        transitionTimingFunction: values.length === 1 ? values[0]! : values,
      };
    }
    default:
      return undefined;
  }
}

/**
 * Parse a CSS `transform` shorthand string (`"scaleX(1.25) scaleY(0.75)"`) into
 * RN's transform array (`[{ scaleX: 1.25 }, { scaleY: 0.75 }]`). Used for the
 * `transform` declarations inside `@keyframes` steps.
 */
export function parseTransformString(
  value: string,
  rem: number,
): ReadonlyArray<Record<string, string | number>> {
  const out: Array<Record<string, string | number>> = [];
  let match: RegExpExecArray | null;
  TRANSFORM_FN_RE.lastIndex = 0;
  while ((match = TRANSFORM_FN_RE.exec(value)) !== null) {
    const fn = match[1]!;
    const arg = match[2]!.trim();
    if (
      fn === "rotate" ||
      fn === "rotateX" ||
      fn === "rotateY" ||
      fn === "rotateZ" ||
      fn === "skewX" ||
      fn === "skewY"
    ) {
      out.push({ [fn]: ANGLE_RE.test(arg) ? arg : `${arg}deg` });
    } else if (fn === "translateX" || fn === "translateY") {
      // Percentage translates must stay strings: Reanimated's CSS keyframe
      // engine parses a trailing "%" as a relative length (CSSLength
      // isRelative), while collapsing to a number would silently reinterpret
      // `translateX(-18%)` as -18px. Absolute lengths still lower to px.
      out.push({ [fn]: PERCENT_RE.test(arg) ? arg : lengthToNumber(arg, rem) });
    } else if (fn === "scaleX" || fn === "scaleY" || fn === "scale") {
      out.push({ [fn]: Number.parseFloat(arg) });
    } else if (fn === "perspective") {
      out.push({ perspective: lengthToNumber(arg, rem) });
    }
  }
  return out;
}

/**
 * Parse a CSS angle token into degrees: `deg` as-is, `rad`→`*180/π`,
 * `grad`→`*0.9`, `turn`→`*360`, and a bare number as degrees. Returns
 * undefined for anything that is not an angle.
 */
export function parseAngleToDegrees(raw: string): number | undefined {
  const value = raw.trim();
  const m = /^(-?\d*\.?\d+)(deg|rad|grad|turn)?$/.exec(value);
  if (!m) return undefined;
  const num = Number.parseFloat(m[1]!);
  if (!Number.isFinite(num)) return undefined;
  switch (m[2]) {
    case "rad":
      return (num * 180) / Math.PI;
    case "grad":
      return num * 0.9;
    case "turn":
      return num * 360;
    default:
      // `deg` or bare number.
      return num;
  }
}

/** Coerce one keyframe-step declaration block (raw text) into an RN style. */
function parseKeyframeStep(body: string, rem: number): KeyframeStep {
  const step: KeyframeStep = {};
  for (const decl of body.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;
    if (prop === "transform") {
      step.transform = parseTransformString(value, rem);
      continue;
    }
    if (prop === "text-shadow") {
      // RN has no `text-shadow` prop; lower the single (first) layer to the
      // discrete textShadow* props so an animated text-shadow flows through.
      const lowered = extractTextShadow([{ prop, value }], () => undefined);
      if (lowered) {
        step.textShadowColor = lowered.textShadowColor;
        step.textShadowOffset = lowered.textShadowOffset;
        step.textShadowRadius = lowered.textShadowRadius;
      }
      continue;
    }
    if (prop.startsWith("--")) {
      // Custom props are normally dropped (toRNValue can't type them), but an
      // angle-bearing var (`--gradient-angle: 120deg`) must survive so the
      // gradient-angle track can read it. Keep it as a normalized degrees
      // number. Mask scale is the one additional numeric custom property
      // consumed by the native mask-geometry animation track.
      const degrees = parseAngleToDegrees(value);
      if (degrees !== undefined) step[prop] = degrees;
      else if (prop === "--mask-scale") {
        const scale = Number(value);
        if (Number.isFinite(scale)) step[prop] = scale;
      }
      continue;
    }
    const rn = toRNValue(prop, value, { rem });
    if (rn !== undefined) step[prop] = rn;
  }
  return step;
}

/** Read a balanced `{ … }` body starting just after the opening brace. */
function readBalanced(
  src: string,
  start: number,
): { body: string; end: number } {
  let depth = 1;
  let i = start;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    if (depth === 0) break;
    i++;
  }
  return { body: src.slice(start, i), end: i + 1 };
}

/**
 * Extract every `@keyframes` block from compiled CSS into a name -> keyframes
 * map. Combined step selectors (`0%, 100%`) are split so each offset is a
 * discrete entry, the shape Reanimated's CSS-animation API expects.
 */
export function extractKeyframes(
  css: string,
  rem = 16,
): Record<string, Keyframes> {
  const out: Record<string, Keyframes> = {};
  const re = /@keyframes\s+([A-Za-z_][\w-]*)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    const name = match[1]!;
    const { body, end } = readBalanced(css, re.lastIndex);
    const frames: Keyframes = {};
    // Walk `selector { decls }` steps inside the keyframes body.
    let i = 0;
    while (i < body.length) {
      const brace = body.indexOf("{", i);
      if (brace === -1) break;
      const selector = body.slice(i, brace).trim();
      const block = readBalanced(body, brace + 1);
      const step = parseKeyframeStep(block.body, rem);
      for (const offset of selector.split(",")) {
        const key = offset.trim();
        if (key) frames[key] = step;
      }
      i = block.end;
    }
    out[name] = frames;
    re.lastIndex = end;
  }
  return out;
}

const TIME_RE = /^(\d*\.?\d+)(s|ms)$/;
const ITERATION_RE = /^(\d+|infinite)$/;
const TIMING_FUNCTIONS = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
]);
const DIRECTIONS = new Set([
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
]);
const FILL_MODES = new Set(["none", "forwards", "backwards", "both"]);
const PLAY_STATES = new Set(["running", "paused"]);

/**
 * Fold a CSS `animation` shorthand (`"wiggle 1s ease-in-out infinite"`) into the
 * discrete `animation*` RN props, resolving the referenced `@keyframes` into the
 * inline `animationName` object. Returns `undefined` if the name is unknown.
 */
export function foldAnimation(
  shorthand: string,
  keyframes: Record<string, Keyframes>,
): RNStyle | undefined {
  const props: RNStyle = {};
  let hasName = false;
  for (const token of shorthand.trim().split(/\s+/)) {
    if (TIME_RE.test(token)) {
      if (props.animationDuration === undefined)
        props.animationDuration = token;
      else if (props.animationDelay === undefined) props.animationDelay = token;
      continue;
    }
    if (ITERATION_RE.test(token)) {
      props.animationIterationCount =
        token === "infinite" ? token : Number(token);
      continue;
    }
    if (TIMING_FUNCTIONS.has(token)) {
      props.animationTimingFunction = token;
      continue;
    }
    if (DIRECTIONS.has(token)) {
      props.animationDirection = token;
      continue;
    }
    if (FILL_MODES.has(token)) {
      props.animationFillMode = token;
      continue;
    }
    if (PLAY_STATES.has(token)) {
      props.animationPlayState = token;
      continue;
    }
    const frames = keyframes[token];
    if (frames !== undefined) {
      props.animationName = frames;
      hasName = true;
    }
  }
  return hasName ? props : undefined;
}

/**
 * A runtime-only animated linear-gradient angle track. Emitted under
 * `--nitrocss-gradient-angle` (see the effects contract) only when a class
 * ALSO carries a linear gradient descriptor. The JS runtime interpolates it per
 * frame and pushes the current angle to native — it never reaches RN props or
 * the C++ registry paint path.
 */
export interface GradientAngleTrack {
  durationMs: number;
  delayMs: number;
  /** CSS iteration count; `-1` for `infinite`. */
  iterations: number;
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  easing: string;
  /** Sorted `at` in `0..1`, always spanning 0 and 1, each with a degrees angle. */
  keyframes: Array<{ at: number; angle: number }>;
}

/** Parse a keyframe offset selector (`"0%"`, `"from"`, `"to"`, `"50%"`) to 0..1. */
function keyframeOffset(selector: string): number | undefined {
  const key = selector.trim().toLowerCase();
  if (key === "from") return 0;
  if (key === "to") return 1;
  const m = /^(-?\d*\.?\d+)%$/.exec(key);
  if (!m) return undefined;
  const n = Number.parseFloat(m[1]!);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : undefined;
}

/** Coerce a duration/delay token to milliseconds (numbers only; else 0). */
function durationToMs(token: string): number {
  const ms = timeToMs(token);
  return typeof ms === "number" ? ms : 0;
}

/**
 * Resolve an `animation` shorthand's referenced `@keyframes` into a
 * {@link GradientAngleTrack} — the runtime-only animated linear-gradient angle
 * channel. Reuses the {@link foldAnimation} timing tokenizer to read duration /
 * delay / iterations / direction / easing, then collects every keyframe step
 * that set an angle-bearing custom property (kept as a normalized degrees
 * number by {@link parseKeyframeStep}). Returns undefined when no keyframe
 * carries an angle var.
 */
export function extractGradientAngleTrack(
  animationShorthand: string,
  keyframes: Record<string, Keyframes>,
): GradientAngleTrack | undefined {
  let durationMs = 0;
  let delayMs = 0;
  let durationSeen = false;
  let iterations = 1;
  let direction: GradientAngleTrack["direction"] = "normal";
  let easing = "ease";
  let frames: Keyframes | undefined;

  for (const token of animationShorthand.trim().split(/\s+/)) {
    if (TIME_RE.test(token)) {
      if (!durationSeen) {
        durationMs = durationToMs(token);
        durationSeen = true;
      } else {
        delayMs = durationToMs(token);
      }
      continue;
    }
    if (ITERATION_RE.test(token)) {
      iterations = token === "infinite" ? -1 : Number(token);
      continue;
    }
    if (TIMING_FUNCTIONS.has(token)) {
      easing = token;
      continue;
    }
    if (DIRECTIONS.has(token)) {
      direction = token as GradientAngleTrack["direction"];
      continue;
    }
    if (FILL_MODES.has(token) || PLAY_STATES.has(token)) continue;
    if (frames === undefined && keyframes[token] !== undefined) {
      frames = keyframes[token];
    }
  }

  if (frames === undefined) return undefined;

  // Collect (offset, angle) from every step that set an angle custom prop.
  const collected: Array<{ at: number; angle: number }> = [];
  for (const [selector, step] of Object.entries(frames)) {
    const at = keyframeOffset(selector);
    if (at === undefined) continue;
    let angle: number | undefined;
    for (const [prop, value] of Object.entries(step)) {
      if (prop.startsWith("--") && typeof value === "number") angle = value;
    }
    if (angle !== undefined) collected.push({ at, angle });
  }
  if (collected.length === 0) return undefined;

  collected.sort((a, b) => a.at - b.at);
  // Clamp/hold so the track always spans 0..1 (native interpolator needs the
  // endpoints): prepend the first sample at 0 and append the last at 1.
  const first = collected[0]!;
  const last = collected[collected.length - 1]!;
  if (first.at > 0) collected.unshift({ at: 0, angle: first.angle });
  if (last.at < 1) collected.push({ at: 1, angle: last.angle });

  return {
    durationMs,
    delayMs,
    iterations,
    direction,
    easing,
    keyframes: collected,
  };
}
