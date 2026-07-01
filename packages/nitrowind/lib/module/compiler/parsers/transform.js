"use strict";

import { lengthToPx } from "../insetValue.js";

/**
 * RN `transform`-array axis keys, in the canonical order the engine emits them.
 * The compiler pulls each axis out of Tailwind's per-axis `--tw-*` helpers and
 * the `rotate`/`scale`/`translate`/`transform` longhands, storing them as
 * individual style props. They are folded back into a single `transform` array
 * at resolve time (see `core/normalize`), which makes multi-class composition
 * merge correctly: the same axis overrides last-wins, different axes union.
 */
export const TRANSFORM_AXES = ["perspective", "translateX", "translateY", "rotate", "rotateX", "rotateY", "rotateZ", "skewX", "skewY", "scaleX", "scaleY"];
/**
 * True for any declaration consumed by the transform parser. None of these is a
 * valid stand-alone RN style prop, so the main parser skips them.
 */
export const isTransformProp = prop => prop === "transform" || prop === "translate" || prop === "scale" || prop === "rotate" || prop.startsWith("--tw-translate-") || prop.startsWith("--tw-scale-") || prop.startsWith("--tw-skew-") || prop.startsWith("--tw-rotate-");
const ANGLE_RE = /^-?\d*\.?\d+(deg|rad|grad|turn)$/;

/** Extract an angle from a bare value (`45deg`) or a function token (`skewX(3deg)`). */
const angle = raw => {
  const v = raw.trim();
  const fn = /^[a-zA-Z]+\(([^)]*)\)$/.exec(v);
  const inner = (fn ? fn[1] : v).trim();
  return ANGLE_RE.test(inner) ? inner : undefined;
};

/** Coerce a scale value (`110%` → 1.1, `1.25` → 1.25) to a unitless number. */
const scale = raw => {
  const v = raw.trim();
  if (v.endsWith("%")) {
    const n = Number(v.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : undefined;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Pull the individual transform components out of one rule's declarations.
 * Returns an axis → value map, e.g. `{ rotate: "45deg", translateX: 16,
 * scaleX: 1.1 }`. Only axes the rule explicitly sets are emitted, so composing
 * `scale-x-50` with `scale-y-150` keeps both axes instead of clobbering one.
 */
export function extractTransform(declarations, resolveVar, rem) {
  const out = {};
  const get = prop => declarations.find(d => d.prop === prop)?.value;

  // 2D rotate is a plain longhand; translate/scale come as `--tw-*` lengths and
  // percents; skew + 3D rotate come as `--tw-*` function tokens.
  const rotate2d = get("rotate");
  if (rotate2d && rotate2d !== "none") {
    const a = angle(rotate2d);
    if (a !== undefined) out.rotate = a;
  }
  const lengthAxis = (prop, axis) => {
    const raw = get(prop);
    if (raw === undefined) return;
    const px = lengthToPx(raw, resolveVar, rem);
    if (px !== undefined) out[axis] = px;
  };
  lengthAxis("--tw-translate-x", "translateX");
  lengthAxis("--tw-translate-y", "translateY");
  const scaleAxis = (prop, axis) => {
    const raw = get(prop);
    if (raw === undefined) return;
    const n = scale(raw);
    if (n !== undefined) out[axis] = n;
  };
  scaleAxis("--tw-scale-x", "scaleX");
  scaleAxis("--tw-scale-y", "scaleY");
  const angleAxis = (prop, axis) => {
    const raw = get(prop);
    if (raw === undefined) return;
    const a = angle(raw);
    if (a !== undefined) out[axis] = a;
  };
  angleAxis("--tw-skew-x", "skewX");
  angleAxis("--tw-skew-y", "skewY");
  angleAxis("--tw-rotate-x", "rotateX");
  angleAxis("--tw-rotate-y", "rotateY");
  angleAxis("--tw-rotate-z", "rotateZ");
  return out;
}
//# sourceMappingURL=transform.js.map