"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.REANIMATED_VAR_PREFIX = void 0;
exports.extractKeyframes = extractKeyframes;
exports.extractReanimatedVars = void 0;
exports.foldAnimation = foldAnimation;
exports.foldTransition = foldTransition;
exports.normalizeTimingFunction = exports.isTransitionProp = exports.isReanimatedVar = exports.isAnimationProp = void 0;
exports.parseTransformString = parseTransformString;
var _toRNValue = require("../toRNValue.js");
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

const REANIMATED_VAR_PREFIX = exports.REANIMATED_VAR_PREFIX = "--reanimated-";

/** True for a Reanimated entering/exiting/layout custom property. */
const isReanimatedVar = prop => prop.startsWith(REANIMATED_VAR_PREFIX);

/** True for the CSS `animation` shorthand (the only animation prop we fold). */
exports.isReanimatedVar = isReanimatedVar;
const isAnimationProp = prop => prop === "animation";

/** True for CSS transition declarations consumed by Reanimated's CSS engine. */
exports.isAnimationProp = isAnimationProp;
const isTransitionProp = prop => prop === "transition-property" || prop === "transition-duration" || prop === "transition-delay" || prop === "transition-timing-function";

/** Collect a rule's `--reanimated-*` declarations into a plain object. */
exports.isTransitionProp = isTransitionProp;
const extractReanimatedVars = declarations => {
  const vars = {};
  for (const d of declarations) {
    if (isReanimatedVar(d.prop)) vars[d.prop] = d.value.trim();
  }
  return vars;
};
exports.extractReanimatedVars = extractReanimatedVars;
const TRANSFORM_FN_RE = /([a-zA-Z]+)\(([^)]*)\)/g;
const ANGLE_RE = /^-?\d*\.?\d+(deg|rad|grad|turn)$/;
const VAR_TOKEN_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*|var\([^)]*\)))?\s*\)/g;
const lengthToNumber = (raw, rem) => {
  const value = raw.trim();
  const m = /^(-?\d*\.?\d+)(px|rem|em|pt)?$/.exec(value);
  if (!m) return Number.parseFloat(value) || 0;
  const num = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? num * rem : num;
};
function resolveVars(value, resolveVar) {
  let current = value;
  for (let i = 0; i < 5 && current.includes("var("); i++) {
    const next = current.replace(VAR_TOKEN_RE, (_match, name, fallback) => resolveVar(name) ?? fallback?.trim() ?? "");
    if (next === current) break;
    current = next;
  }
  return current.trim();
}
const splitCommaList = value => {
  const out = [];
  let current = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth++;else if (ch === ")" && depth > 0) depth--;
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
const timeToMs = value => {
  const raw = value.trim();
  if (raw.endsWith("ms")) return Number.parseFloat(raw);
  if (raw.endsWith("s")) return Number.parseFloat(raw) * 1000;
  return Number.isNaN(Number(raw)) ? raw : Number(raw);
};
const normalizeTimingFunction = value => {
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
exports.normalizeTimingFunction = normalizeTimingFunction;
const transitionProperty = value => {
  if (value.trim() === "all") return "all";
  const properties = splitCommaList(value).filter(prop => !prop.startsWith("--")).map(prop => (0, _toRNValue.toRNProperty)(prop));
  return properties.length === 1 ? properties[0] : properties;
};

/** Coerce a CSS transition declaration into Reanimated's RN style props. */
function foldTransition(prop, value, resolveVar) {
  const resolved = resolveVars(value, resolveVar);
  if (!resolved) return undefined;
  switch (prop) {
    case "transition-property":
      return {
        transitionProperty: transitionProperty(resolved)
      };
    case "transition-duration":
      {
        const values = splitCommaList(resolved).map(timeToMs);
        return {
          transitionDuration: values.length === 1 ? values[0] : values
        };
      }
    case "transition-delay":
      {
        const values = splitCommaList(resolved).map(timeToMs);
        return {
          transitionDelay: values.length === 1 ? values[0] : values
        };
      }
    case "transition-timing-function":
      {
        const values = splitCommaList(resolved).map(normalizeTimingFunction);
        return {
          transitionTimingFunction: values.length === 1 ? values[0] : values
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
function parseTransformString(value, rem) {
  const out = [];
  let match;
  TRANSFORM_FN_RE.lastIndex = 0;
  while ((match = TRANSFORM_FN_RE.exec(value)) !== null) {
    const fn = match[1];
    const arg = match[2].trim();
    if (fn === "rotate" || fn === "rotateX" || fn === "rotateY" || fn === "rotateZ" || fn === "skewX" || fn === "skewY") {
      out.push({
        [fn]: ANGLE_RE.test(arg) ? arg : `${arg}deg`
      });
    } else if (fn === "translateX" || fn === "translateY") {
      out.push({
        [fn]: lengthToNumber(arg, rem)
      });
    } else if (fn === "scaleX" || fn === "scaleY" || fn === "scale") {
      out.push({
        [fn]: Number.parseFloat(arg)
      });
    } else if (fn === "perspective") {
      out.push({
        perspective: lengthToNumber(arg, rem)
      });
    }
  }
  return out;
}

/** Coerce one keyframe-step declaration block (raw text) into an RN style. */
function parseKeyframeStep(body, rem) {
  const step = {};
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
    const rn = (0, _toRNValue.toRNValue)(prop, value, {
      rem
    });
    if (rn !== undefined) step[prop] = rn;
  }
  return step;
}

/** Read a balanced `{ … }` body starting just after the opening brace. */
function readBalanced(src, start) {
  let depth = 1;
  let i = start;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;else if (src[i] === "}") depth--;
    if (depth === 0) break;
    i++;
  }
  return {
    body: src.slice(start, i),
    end: i + 1
  };
}

/**
 * Extract every `@keyframes` block from compiled CSS into a name -> keyframes
 * map. Combined step selectors (`0%, 100%`) are split so each offset is a
 * discrete entry, the shape Reanimated's CSS-animation API expects.
 */
function extractKeyframes(css, rem = 16) {
  const out = {};
  const re = /@keyframes\s+([A-Za-z_][\w-]*)\s*\{/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const name = match[1];
    const {
      body,
      end
    } = readBalanced(css, re.lastIndex);
    const frames = {};
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
const TIMING_FUNCTIONS = new Set(["linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"]);
const DIRECTIONS = new Set(["normal", "reverse", "alternate", "alternate-reverse"]);
const FILL_MODES = new Set(["none", "forwards", "backwards", "both"]);
const PLAY_STATES = new Set(["running", "paused"]);

/**
 * Fold a CSS `animation` shorthand (`"wiggle 1s ease-in-out infinite"`) into the
 * discrete `animation*` RN props, resolving the referenced `@keyframes` into the
 * inline `animationName` object. Returns `undefined` if the name is unknown.
 */
function foldAnimation(shorthand, keyframes) {
  const props = {};
  let hasName = false;
  for (const token of shorthand.trim().split(/\s+/)) {
    if (TIME_RE.test(token)) {
      if (props.animationDuration === undefined) props.animationDuration = token;else if (props.animationDelay === undefined) props.animationDelay = token;
      continue;
    }
    if (ITERATION_RE.test(token)) {
      props.animationIterationCount = token === "infinite" ? token : Number(token);
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
//# sourceMappingURL=animations.js.map