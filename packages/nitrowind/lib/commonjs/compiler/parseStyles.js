"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.classTokenFromSelector = classTokenFromSelector;
exports.parseStyles = parseStyles;
exports.walkRules = walkRules;
var _dependencies = require("./dependencies.js");
var _insetValue = require("./insetValue.js");
var _container = require("./container.js");
var _index = require("./parsers/index.js");
var _platform = require("./platform.js");
var _toRNValue = require("./toRNValue.js");
var _types = require("../specs/types.js");
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * A small, dependency-free CSS walker tuned for Tailwind's compiled output.
 * Yields one record per (selector, at-rule context) with raw declarations so we
 * can faithfully coerce values to RN. Handles nested at-rules via a context
 * stack and ignores `@`-rules we don't care about.
 */
function* walkRules(css, inherited = []) {
  const src = stripComments(css);
  let i = 0;
  let buffer = "";
  const flushBlockless = () => {
    buffer = "";
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") {
      const prelude = buffer.trim();
      buffer = "";
      i++;
      if (prelude.startsWith("@")) {
        // Nested at-rule: recurse with this prelude added to the context so the
        // inner rules inherit it (e.g. `@media (prefers-color-scheme: dark)`).
        const inner = readBlock(src, i);
        const atName = prelude.split(/\s+/, 1)[0] ?? "";
        if (atName === "@layer") {
          // `@layer name { … }` is a transparent grouping wrapper: recurse into
          // its body WITHOUT adding it to the at-rule context. Tailwind v4 wraps
          // every utility in `@layer utilities` and theme vars in `@layer theme`.
          yield* walkRules(inner.body, inherited);
        } else if (atName === "@media" || atName === "@supports" || atName === "@container") {
          yield* walkRules(inner.body, [...inherited, prelude]);
        }
        // @theme / @keyframes / @font-face handled elsewhere or ignored here.
        i = inner.end;
        continue;
      }

      // A style rule: read its declaration block.
      const block = readBlock(src, i);
      i = block.end;
      const declarations = parseDeclarations(block.body);
      for (const selector of splitSelectors(prelude)) {
        yield {
          selector,
          atRules: [...inherited],
          declarations
        };
      }
      continue;
    }
    if (ch === "}") {
      flushBlockless();
      i++;
      continue;
    }
    if (ch === ";") {
      // Statement like `@import` between rules — skip.
      flushBlockless();
      i++;
      continue;
    }
    buffer += ch;
    i++;
  }
}

/** Read a balanced `{ ... }` body starting just after the opening brace. */
function readBlock(src, start) {
  let depth = 1;
  let i = start;
  let body = "";
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
    body += ch;
    i++;
  }
  return {
    body,
    end: i + 1
  };
}
const splitSelectors = prelude => {
  const selectors = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (ch === "\\") {
      current += ch;
      if (i + 1 < prelude.length) current += prelude[++i];
      continue;
    }
    if (ch === "(" || ch === "[") depth++;else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (ch === "," && depth === 0) {
      const selector = current.trim();
      if (selector) selectors.push(selector);
      current = "";
      continue;
    }
    current += ch;
  }
  const selector = current.trim();
  if (selector) selectors.push(selector);
  return selectors;
};
function parseDeclarations(body) {
  const out = [];
  // Only top-level declarations (skip nested rules inside, if any).
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === ";" && depth === 0) {
      pushDeclaration(current, out);
      current = "";
      continue;
    }
    current += ch;
  }
  pushDeclaration(current, out);
  return out;
}
function pushDeclaration(raw, out) {
  const text = raw.trim();
  if (!text || text.startsWith("@") || text.includes("{")) return;
  const idx = text.indexOf(":");
  if (idx === -1) return;
  const prop = text.slice(0, idx).trim();
  let value = text.slice(idx + 1).trim();
  let important = false;
  if (/!\s*important$/i.test(value)) {
    important = true;
    value = value.replace(/!\s*important$/i, "").trim();
  }
  if (prop && value) out.push({
    prop,
    value,
    important
  });
}
function classTokensFromSelector(selector) {
  const tokens = [];
  let dot = selector.indexOf(".");
  while (dot >= 0) {
    let token = "";
    let i = dot + 1;
    while (i < selector.length) {
      const ch = selector[i];
      if (ch === "\\") {
        // Escaped character is part of the class name.
        token += selector[i + 1] ?? "";
        i += 2;
        continue;
      }
      // Unescaped delimiter ends the class name (pseudo, combinator, etc.).
      if (".: >+~[],*#".includes(ch)) break;
      token += ch;
      i++;
    }
    if (token) tokens.push(token);
    dot = selector.indexOf(".", dot + 1);
  }
  return tokens;
}

/**
 * Extract the utility class-name token from a selector, unescaping Tailwind's
 * `\:` etc. Group selectors contain both `.group` and `.group-active\:*`; in
 * that shape the utility token is the descendant class, not the group root.
 */
function classTokenFromSelector(selector) {
  const tokens = classTokensFromSelector(selector);
  if (tokens.length === 0) return undefined;
  const groupUtility = tokens.find(token => /^group-(?:active|focus|focus-visible|focus-within|hover|disabled|enabled):/.test(token));
  return groupUtility ?? tokens[0];
}
const PSEUDO_VARIANTS = [[/group-active\\:/, "group-active"], [/group-focus-visible\\:/, "group-focus-visible"], [/group-focus-within\\:/, "group-focus-within"], [/group-focus\\:/, "group-focus"], [/group-hover\\:/, "group-hover"], [/group-disabled\\:/, "group-disabled"], [/group-enabled\\:/, "group-enabled"], [/:first-child\b/, "first"], [/:last-child\b/, "last"], [/:focus-visible\b/, "focus-visible"], [/:focus-within\b/, "focus-within"], [/:hover\b/, "hover"], [/:focus\b/, "focus"], [/:active\b/, "active"], [/:disabled\b/, "disabled"], [/:enabled\b/, "enabled"]];
const UNSUPPORTED_PSEUDO_RE = /:(?:any-link|auto-fill|before|after|checked|default|defined|empty|first-of-type|fullscreen|has\(|in-range|indeterminate|invalid|lang\(|last-of-type|link|modal|not\(|nth-child\(|nth-last-child\(|nth-last-of-type\(|nth-of-type\(|only-child|only-of-type|optional|out-of-range|placeholder-shown|popover-open|read-only|read-write|required|root|scope|state\(|target|user-invalid|user-valid|valid|visited)\b|::(?:before|after|backdrop|file-selector-button|first-letter|first-line|grammar-error|highlight\(|marker|spelling-error|view-transition)/;
const variantFromContext = (atRules, selector) => {
  for (const [regex, variant] of PSEUDO_VARIANTS) {
    if (regex.test(selector)) return variant;
  }
  if (UNSUPPORTED_PSEUDO_RE.test(selector)) return "unsupported-pseudo";
  if (atRules.some(a => a.includes("prefers-color-scheme: dark"))) return "dark";
  if (atRules.some(a => a.includes("width"))) return "responsive";
  return "base";
};
const rnPropsForSelector = (selector, cssProp) => {
  if (/::placeholder\b|:placeholder\b/.test(selector) && cssProp === "color") {
    return ["placeholderTextColor"];
  }
  if (/::selection\b|:selection\b/.test(selector) && (cssProp === "color" || cssProp === "background-color")) {
    return ["selectionColor"];
  }
  return (0, _toRNValue.toRNProperties)(cssProp);
};

/** Tailwind emits a few implicit vars even when they are not in `:root`. */
const DEFAULT_VARS = {
  "--spacing": "0.25rem",
  "--tw-border-style": "solid"
};
const defaultResolveVar = name => DEFAULT_VARS[name];

/** Collect a rule's own custom properties (`--tw-*`, …) into a lookup. */
const collectCustomProps = declarations => {
  const vars = {};
  for (const d of declarations) {
    if (d.prop.startsWith("--")) vars[d.prop] = d.value;
  }
  return vars;
};

/**
 * True for declarations handled by the dedicated value parsers (transform,
 * box-shadow, filter, text-shadow, font-variant), every custom property, and
 * backdrop filters that map to RN's native `filter` prop. These are skipped by
 * the generic value loop.
 */
const isParsedProp = prop => prop.startsWith("--") || (0, _index.isTransformProp)(prop) || (0, _index.isBoxShadowProp)(prop) || (0, _index.isFilterProp)(prop) || (0, _index.isTextShadowProp)(prop) || (0, _index.isFontVariantProp)(prop) || (0, _index.isAnimationProp)(prop) || (0, _index.isTransitionProp)(prop) || _container.CONTAINER_DECL_PROPS.has(prop) || prop === "backdrop-filter" || prop === "-webkit-backdrop-filter";

/**
 * Parse compiled CSS into the runtime artifact (classes + their dependency
 * masks). Theme variables are extracted separately (see `extractThemes`).
 *
 * `resolveVar` resolves CSS custom properties (e.g. `--spacing`) so safe-area
 * offset/floor amounts can be reduced to px at compile time.
 */
function parseStyles(css, rem, resolveVar = defaultResolveVar) {
  const classes = {};

  // `@keyframes` blocks are pulled out once up front so the `animation`
  // shorthand on any rule can be folded into an inline `animationName` object.
  const keyframes = (0, _index.extractKeyframes)(css, rem);
  for (const rule of walkRules(css)) {
    const token = classTokenFromSelector(rule.selector);
    if (!token) continue;
    if ((0, _container.isCustomContainerToken)(token)) continue;
    const style = {};
    let mask = (0, _dependencies.union)(...rule.atRules.map(_dependencies.dependencyFromAtRule), (0, _dependencies.dependencyFromSelector)(rule.selector));

    // Tailwind sets per-axis `--tw-*` helpers that are consumed within the same
    // rule (transforms, shadows). Resolve them with a view that sees the rule's
    // own custom properties first, then the global theme vars.
    const localVars = collectCustomProps(rule.declarations);
    const ruleResolve = name => localVars[name] ?? resolveVar(name);

    // Transform components are emitted as individual axis props and folded into
    // RN's `transform` array at resolve time so multi-class composition merges
    // correctly per axis. Shadows / font-variant become final RN props here.
    Object.assign(style, (0, _index.extractTransform)(rule.declarations, ruleResolve, rem));
    const boxShadow = (0, _index.extractBoxShadow)(rule.declarations, ruleResolve);
    if (boxShadow !== undefined) Object.assign(style, boxShadow);
    const filter = (0, _index.extractFilter)(rule.declarations, ruleResolve);
    if (filter !== undefined) Object.assign(style, filter);
    const textShadow = (0, _index.extractTextShadow)(rule.declarations, ruleResolve);
    if (textShadow) Object.assign(style, textShadow);
    const fontVariant = (0, _index.extractFontVariant)(rule.declarations, ruleResolve);
    if (fontVariant) style.fontVariant = fontVariant;

    // Reanimated entering/exiting/layout presets compile to `--reanimated-*`
    // custom props; keep them verbatim so the runtime can rebuild the
    // Reanimated animation object on the JS/UI thread.
    Object.assign(style, (0, _index.extractReanimatedVars)(rule.declarations));
    // A CSS `animation` shorthand (`animate-wiggle`) folds — together with its
    // `@keyframes` — into the discrete `animation*` props Reanimated's native
    // CSS-animation engine consumes.
    const animationDecl = rule.declarations.find(d => (0, _index.isAnimationProp)(d.prop));
    if (animationDecl) {
      const folded = (0, _index.foldAnimation)(animationDecl.value, keyframes);
      if (folded) Object.assign(style, folded);
    }
    for (const transitionDecl of rule.declarations.filter(d => (0, _index.isTransitionProp)(d.prop))) {
      const folded = (0, _index.foldTransition)(transitionDecl.prop, transitionDecl.value, ruleResolve);
      if (folded) Object.assign(style, folded);
    }

    // A `@container (...)` at-rule context gates this bucket on a container's
    // measured size; a `container-type`/`container-name` declaration makes the
    // node itself a queryable container.
    const containerPrelude = rule.atRules.find(a => /^@container\b/i.test(a));
    const container = containerPrelude ? (0, _container.parseContainerQuery)(containerPrelude, rem, ruleResolve) : undefined;
    const containerMarker = (0, _container.containerMarkerFromDeclarations)(rule.declarations);
    for (const decl of rule.declarations) {
      // Skip declarations the dedicated parsers above already consumed, every
      // custom property (`--tw-*`), and effects RN can't represent (filters).
      if (decl.prop === "--tw-shadow-color") {
        mask = (0, _dependencies.union)(mask, (0, _dependencies.dependencyFromValue)(decl.value));
      }
      if (isParsedProp(decl.prop)) continue;
      const rnProps = rnPropsForSelector(rule.selector, decl.prop);
      // Safe-area values become dynamic descriptors resolved against live
      // insets by the runtime + native engine (no React re-render on change).
      const inset = (0, _insetValue.parseInsetValue)(decl.value, resolveVar, rem);
      if (inset) {
        for (const rnProp of rnProps) style[rnProp] = inset;
        // The descriptor bakes any offset/floor to px at compile time, so its
        // only live dependency is the safe-area insets themselves.
        mask = (0, _dependencies.union)(mask, (0, _dependencies.flag)(_types.StyleDependency.Insets));
        continue;
      }
      const rnValue = (0, _toRNValue.toRNValue)(rnProps[0] ?? "", decl.value, {
        rem,
        resolveVar: ruleResolve
      });
      if (rnValue === undefined) continue;
      for (const rnProp of rnProps) style[rnProp] = rnValue;
      mask = (0, _dependencies.union)(mask, (0, _dependencies.dependencyFromValue)(decl.value));
    }
    if (typeof style.fontSize === "number" && typeof style.lineHeight === "number" && style.lineHeight > 0 && style.lineHeight < 4) {
      style.lineHeight = style.fontSize * style.lineHeight;
    }
    if (Object.keys(style).length === 0 && !containerMarker) continue;

    // Platform variants (`ios:`, `android:`, …) are an orthogonal axis to the
    // dark/responsive variant, so they live in their own field. Absent means the
    // bucket applies on every platform.
    const platform = (0, _platform.platformFromSelector)(rule.selector);
    const bucket = {
      style,
      dependencies: mask,
      variant: variantFromContext(rule.atRules, rule.selector),
      ...(platform ? {
        platform
      } : {}),
      ...(container ? {
        container
      } : {}),
      ...(containerMarker ? {
        containerMarker
      } : {})
    };
    (classes[token] ??= []).push(bucket);
  }
  return {
    classes
  };
}
//# sourceMappingURL=parseStyles.js.map