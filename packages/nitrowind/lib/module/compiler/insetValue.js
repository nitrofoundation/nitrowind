"use strict";

/** Resolves a CSS custom property name (e.g. `--spacing`) to its raw value. */

const SIDE = "(top|right|bottom|left)";
const BASE_RE = new RegExp(`^env\\(safe-area-inset-${SIDE}\\)$`);
const OFFSET_RE = new RegExp(`^calc\\(\\s*env\\(safe-area-inset-${SIDE}\\)\\s*\\+\\s*([\\s\\S]+)\\)$`);
const OR_RE = new RegExp(`^max\\(\\s*env\\(safe-area-inset-${SIDE}\\)\\s*,\\s*([\\s\\S]+)\\)$`);
const VAR_RE = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,\s*([^()]*))?\)/g;

/** Inline `var(--x[, fallback])` references using the supplied resolver. */
function resolveVars(expr, resolveVar, depth = 0) {
  if (depth > 8) return expr;
  return expr.replace(VAR_RE, (_, name, fallback) => {
    const v = resolveVar(name);
    if (v !== undefined) return resolveVars(v, resolveVar, depth + 1);
    return fallback !== undefined ? fallback.trim() : "0";
  });
}
const LENGTH_TOKEN = /^(-?\d*\.?\d+)(px|rem|em)?$/;

/** Coerce a single length token to px. */
function tokenToPx(token, rem) {
  const m = LENGTH_TOKEN.exec(token.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return m[2] === "rem" || m[2] === "em" ? n * rem : n;
}

// --- Tiny arithmetic evaluator (numbers-with-units + - * / and parens) ------

function tokenize(expr, rem) {
  const parts = expr.match(/(-?\d*\.?\d+(?:px|rem|em)?|[-+*/()])/g);
  if (!parts) return undefined;
  if (parts.join("") !== expr.replace(/\s+/g, "")) return undefined;
  const toks = [];
  for (const p of parts) {
    if (p === "+" || p === "-" || p === "*" || p === "/" || p === "(" || p === ")") {
      toks.push({
        t: "op",
        v: p
      });
    } else {
      const px = tokenToPx(p, rem);
      if (px === undefined) return undefined;
      toks.push({
        t: "num",
        v: px
      });
    }
  }
  return toks;
}

/** Recursive-descent evaluation of the tokenized arithmetic expression. */
function evalTokens(toks) {
  let i = 0;
  const peek = () => toks[i];
  const factor = () => {
    const tk = peek();
    if (!tk) return undefined;
    if (tk.t === "op" && tk.v === "(") {
      i++;
      const inner = expr();
      const close = peek();
      if (!close || close.t !== "op" || close.v !== ")") return undefined;
      i++;
      return inner;
    }
    if (tk.t === "num") {
      i++;
      return tk.v;
    }
    return undefined;
  };
  const term = () => {
    let left = factor();
    if (left === undefined) return undefined;
    for (let tk = peek(); tk && tk.t === "op" && (tk.v === "*" || tk.v === "/"); tk = peek()) {
      i++;
      const right = factor();
      if (right === undefined) return undefined;
      left = tk.v === "*" ? left * right : left / right;
    }
    return left;
  };
  const expr = () => {
    let left = term();
    if (left === undefined) return undefined;
    for (let tk = peek(); tk && tk.t === "op" && (tk.v === "+" || tk.v === "-"); tk = peek()) {
      i++;
      const right = term();
      if (right === undefined) return undefined;
      left = tk.v === "+" ? left + right : left - right;
    }
    return left;
  };
  const result = expr();
  return i === toks.length ? result : undefined;
}

/** Resolve a length operand (`10px`, `calc(var(--spacing) * 2)`, …) to px. */
export function lengthToPx(raw, resolveVar, rem) {
  // Inline vars, then drop the `calc` keyword so its parens parse generically.
  const resolved = resolveVars(raw, resolveVar).replace(/\bcalc\b/g, "").trim();
  const toks = tokenize(resolved, rem);
  if (!toks) return undefined;
  const px = evalTokens(toks);
  return px === undefined || !Number.isFinite(px) ? undefined : px;
}

/**
 * Parse a single declaration value into a dynamic inset descriptor, or
 * `undefined` if it is not a safe-area value. Handles the three shapes Tailwind
 * emits for the safe-area utility families:
 *
 *   env(safe-area-inset-top)                                  -> { add: 0,  floor: 0 }
 *   calc(env(safe-area-inset-top) + <len>)                    -> { add: len, floor: 0 }
 *   max(env(safe-area-inset-top), <len>)                      -> { add: 0,  floor: len }
 */
export function parseInsetValue(rawValue, resolveVar, rem) {
  const value = rawValue.replace(/\s+/g, " ").trim();
  const base = BASE_RE.exec(value);
  if (base) return {
    $inset: base[1],
    add: 0,
    floor: 0
  };
  const offset = OFFSET_RE.exec(value);
  if (offset) {
    const px = lengthToPx(offset[2], resolveVar, rem);
    if (px === undefined) return undefined;
    return {
      $inset: offset[1],
      add: px,
      floor: 0
    };
  }
  const orMatch = OR_RE.exec(value);
  if (orMatch) {
    const px = lengthToPx(orMatch[2], resolveVar, rem);
    if (px === undefined) return undefined;
    return {
      $inset: orMatch[1],
      add: 0,
      floor: px
    };
  }
  return undefined;
}
//# sourceMappingURL=insetValue.js.map