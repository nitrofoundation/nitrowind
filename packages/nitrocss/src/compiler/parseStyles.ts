import {
  dependencyFromAtRule,
  dependencyFromSelector,
  dependencyFromValue,
  flag,
  union,
} from "./dependencies";
import { lengthToPx, parseInsetValue, type VarResolver } from "./insetValue";
import {
  CONTAINER_DECL_PROPS,
  containerMarkerFromDeclarations,
  isCustomContainerToken,
  parseContainerQuery,
} from "./container";
import {
  extractBackgroundImage,
  extractBorderGradient,
  extractBoxShadow,
  extractClipPath,
  extractFilter,
  extractFontVariant,
  extractGradient,
  extractGradientAngleTrack,
  extractKeyframes,
  extractNativeEffects,
  extractReanimatedVars,
  extractTextShadow,
  extractTransform,
  evaluateCssMath,
  foldAnimation,
  foldTransition,
  isAnimationProp,
  isBackgroundImageProp,
  isBorderGradientProp,
  isBoxShadowProp,
  isClipPathProp,
  isFilterProp,
  isFontVariantProp,
  isGradientProp,
  isNativeEffectsProp,
  isTextShadowProp,
  isTransitionProp,
  isTransformProp,
  parseCssMath,
  parseSemanticColor,
  parseTailwindV4Candidate,
  parseTailwindV4Transform,
  parseWideGamutColor,
  GRADIENT_TYPE_PROP,
} from "./parsers";
import { platformFromSelector } from "./platform";
import { resolveVarsInValue, toRNProperties, toRNValue } from "./toRNValue";
import type {
  CompiledArtifact,
  CompiledClass,
  DependencyMask,
  RNStyle,
} from "./types";
import { StyleDependency } from "./types";

interface RuleRecord {
  /** Raw selector text (already comma-split into one selector). */
  selector: string;
  /** Stack of enclosing at-rule preludes (e.g. `@media (...)`). */
  atRules: string[];
  /** Raw `prop: value` declarations. */
  declarations: Array<{ prop: string; value: string; important: boolean }>;
}

const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * A small, dependency-free CSS walker tuned for the utility compiler's compiled output.
 * Yields one record per (selector, at-rule context) with raw declarations so we
 * can faithfully coerce values to RN. Handles nested at-rules via a context
 * stack and ignores `@`-rules we don't care about.
 */
function* walkRules(
  css: string,
  inherited: string[] = [],
): Generator<RuleRecord> {
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
          // its body WITHOUT adding it to the at-rule context. The compiler wraps
          // every utility in `@layer utilities` and theme vars in `@layer theme`.
          yield* walkRules(inner.body, inherited);
        } else if (
          atName === "@media" ||
          atName === "@supports" ||
          atName === "@container"
        ) {
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
        yield { selector, atRules: [...inherited], declarations };
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
function readBlock(src: string, start: number): { body: string; end: number } {
  let depth = 1;
  let i = start;
  let body = "";
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
    body += ch;
    i++;
  }
  return { body, end: i + 1 };
}

const splitSelectors = (prelude: string): string[] => {
  const selectors: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i]!;
    if (ch === "\\") {
      current += ch;
      if (i + 1 < prelude.length) current += prelude[++i]!;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
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

function parseDeclarations(
  body: string,
): Array<{ prop: string; value: string; important: boolean }> {
  const out: Array<{ prop: string; value: string; important: boolean }> = [];
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

function pushDeclaration(
  raw: string,
  out: Array<{ prop: string; value: string; important: boolean }>,
): void {
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
  if (prop && value) out.push({ prop, value, important });
}

function classTokensFromSelector(selector: string): string[] {
  const tokens: string[] = [];
  let dot = selector.indexOf(".");
  while (dot >= 0) {
    let token = "";
    let i = dot + 1;
    while (i < selector.length) {
      const ch = selector[i]!;
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
 * Extract the utility class-name token from a selector, unescaping the utility compiler's
 * `\:` etc. Group selectors contain both `.group` and `.group-active\:*`; in
 * that shape the utility token is the descendant class, not the group root.
 */
export function classTokenFromSelector(selector: string): string | undefined {
  const tokens = classTokensFromSelector(selector);
  if (tokens.length === 0) return undefined;
  const groupUtility = tokens.find((token) =>
    /^group-(?:active|focus|focus-visible|focus-within|hover|disabled|enabled):/.test(
      token,
    ),
  );
  return groupUtility ?? tokens[0];
}

const PSEUDO_VARIANTS: Array<[RegExp, string]> = [
  [/group-active\\:/, "group-active"],
  [/group-focus-visible\\:/, "group-focus-visible"],
  [/group-focus-within\\:/, "group-focus-within"],
  [/group-focus\\:/, "group-focus"],
  [/group-hover\\:/, "group-hover"],
  [/group-disabled\\:/, "group-disabled"],
  [/group-enabled\\:/, "group-enabled"],
  [/:first-child\b/, "first"],
  [/:last-child\b/, "last"],
  [/:focus-visible\b/, "focus-visible"],
  [/:focus-within\b/, "focus-within"],
  [/:hover\b/, "hover"],
  [/:focus\b/, "focus"],
  [/:active\b/, "active"],
  [/:disabled\b/, "disabled"],
  [/:enabled\b/, "enabled"],
];

const UNSUPPORTED_PSEUDO_RE =
  /:(?:any-link|auto-fill|before|after|checked|default|defined|empty|first-of-type|fullscreen|has\(|in-range|indeterminate|invalid|lang\(|last-of-type|link|modal|not\(|nth-child\(|nth-last-child\(|nth-last-of-type\(|nth-of-type\(|only-child|only-of-type|optional|out-of-range|placeholder-shown|popover-open|read-only|read-write|required|root|scope|state\(|target|user-invalid|user-valid|valid|visited)\b|::(?:before|after|backdrop|file-selector-button|first-letter|first-line|grammar-error|highlight\(|marker|spelling-error|view-transition)/;

const variantFromContext = (atRules: string[], selector: string): string => {
  for (const [regex, variant] of PSEUDO_VARIANTS) {
    if (regex.test(selector)) return variant;
  }
  if (UNSUPPORTED_PSEUDO_RE.test(selector)) return "unsupported-pseudo";
  if (atRules.some((a) => a.includes("prefers-color-scheme: dark")))
    return "dark";
  if (atRules.some((a) => a.includes("width"))) return "responsive";
  return "base";
};

const rnPropsForSelector = (selector: string, cssProp: string): string[] => {
  if (/::placeholder\b|:placeholder\b/.test(selector) && cssProp === "color") {
    return ["placeholderTextColor"];
  }
  if (
    /::selection\b|:selection\b/.test(selector) &&
    (cssProp === "color" || cssProp === "background-color")
  ) {
    return ["selectionColor"];
  }
  return toRNProperties(cssProp);
};

/** The compiler emits a few implicit vars even when they are not in `:root`. */
const DEFAULT_VARS: Record<string, string> = {
  "--spacing": "0.25rem",
  "--tw-border-style": "solid",
};
const defaultResolveVar: VarResolver = (name) => DEFAULT_VARS[name];

/** Collect a rule's own custom properties (`--tw-*`, …) into a lookup. */
const collectCustomProps = (
  declarations: ReadonlyArray<{ prop: string; value: string }>,
): Record<string, string> => {
  const vars: Record<string, string> = {};
  for (const d of declarations) {
    if (d.prop.startsWith("--")) vars[d.prop] = d.value;
  }
  return vars;
};

/**
 * True for declarations handled by the dedicated value parsers (transform,
 * box-shadow, filter, text-shadow, font-variant), every custom property, and
 * backdrop filters that compile to the `--nitrocss-backdrop-filter` marker
 * (see parsers/filter.ts). These are skipped by the generic value loop.
 */
const isParsedProp = (prop: string): boolean =>
  prop.startsWith("--") ||
  isTransformProp(prop) ||
  isBoxShadowProp(prop) ||
  isFilterProp(prop) ||
  isGradientProp(prop) ||
  isBackgroundImageProp(prop) ||
  isClipPathProp(prop) ||
  isTextShadowProp(prop) ||
  isFontVariantProp(prop) ||
  isAnimationProp(prop) ||
  isTransitionProp(prop) ||
  isNativeEffectsProp(prop) ||
  CONTAINER_DECL_PROPS.has(prop) ||
  prop === "backdrop-filter" ||
  prop === "-webkit-backdrop-filter";

/**
 * Parse compiled CSS into the runtime artifact (classes + their dependency
 * masks). Theme variables are extracted separately (see `extractThemes`).
 *
 * `resolveVar` resolves CSS custom properties (e.g. `--spacing`) so safe-area
 * offset/floor amounts can be reduced to px at compile time.
 */
export function parseStyles(
  css: string,
  rem: number,
  resolveVar: VarResolver = defaultResolveVar,
): Pick<CompiledArtifact, "classes"> {
  const classes: Record<string, CompiledClass[]> = {};

  // `@keyframes` blocks are pulled out once up front so the `animation`
  // shorthand on any rule can be folded into an inline `animationName` object.
  const keyframes = extractKeyframes(css, rem);

  for (const rule of walkRules(css)) {
    const token = classTokenFromSelector(rule.selector);
    if (!token) continue;
    if (isCustomContainerToken(token)) continue;

    const style: RNStyle = {};
    let mask: DependencyMask = union(
      ...rule.atRules.map(dependencyFromAtRule),
      dependencyFromSelector(rule.selector),
    );

    // The compiler sets per-axis `--tw-*` helpers that are consumed within the same
    // rule (transforms, shadows). Resolve them with a view that sees the rule's
    // own custom properties first, then the global theme vars.
    const localVars = collectCustomProps(rule.declarations);
    const ruleResolve: VarResolver = (name) =>
      localVars[name] ?? resolveVar(name);

    // Transform components are emitted as individual axis props and folded into
    // RN's `transform` array at resolve time so multi-class composition merges
    // correctly per axis. Shadows / font-variant become final RN props here.
    Object.assign(style, extractTransform(rule.declarations, ruleResolve, rem));
    const v4Utility = parseTailwindV4Candidate(token)?.utility ?? token;
    const v4Transform = parseTailwindV4Transform(v4Utility);
    if (v4Transform) {
      switch (v4Transform.kind) {
        case "perspective": {
          const value =
            typeof v4Transform.value === "number"
              ? v4Transform.value
              : lengthToPx(v4Transform.value, ruleResolve, rem);
          if (value !== undefined) style.perspective = value;
          break;
        }
        case "rotate-x":
          style.rotateX = v4Transform.value;
          break;
        case "rotate-y":
          style.rotateY = v4Transform.value;
          break;
        case "rotate-z":
          style.rotateZ = v4Transform.value;
          break;
        case "transform-origin":
          style.transformOrigin = [
            v4Transform.x,
            v4Transform.y,
            ...(v4Transform.z === undefined ? [] : [v4Transform.z]),
          ];
          break;
        case "backface-visibility":
          style.backfaceVisibility = v4Transform.value;
          break;
        default:
          break;
      }
    }
    const boxShadow = extractBoxShadow(rule.declarations, ruleResolve);
    if (boxShadow !== undefined) Object.assign(style, boxShadow);
    const nativeEffects = extractNativeEffects(rule.declarations, ruleResolve);
    if (nativeEffects !== undefined) {
      const descriptor = (nativeEffects as Record<string, unknown>)[
        "--nitrocss-native-effects"
      ] as
        | {
            shadows?: Array<{ inset?: boolean; spreadDistance?: number }>;
            backdropFilters?: Array<{ type?: string }>;
            outline?: unknown;
            mixBlendMode?: unknown;
            isolation?: unknown;
            borderCurve?: unknown;
          }
        | undefined;
      const needsNativePack = Boolean(
        descriptor &&
          ((descriptor.shadows?.length ?? 0) > 1 ||
            descriptor.shadows?.some(
              (shadow) => shadow.inset || shadow.spreadDistance !== 0,
            ) ||
            descriptor.backdropFilters?.some(
              (effect) => effect.type !== "blur",
            ) ||
            descriptor.outline ||
            descriptor.mixBlendMode ||
            descriptor.isolation ||
            descriptor.borderCurve),
      );
      if (needsNativePack) Object.assign(style, nativeEffects);
    }
    const filter = extractFilter(rule.declarations, ruleResolve);
    if (filter !== undefined) Object.assign(style, filter);
    // The web gradient-border recipe (`background: <fill> padding-box,
    // <gradient> border-box` + transparent border) bakes straight into the
    // final gradient descriptor — it is authored as one literal declaration,
    // so no cross-class marker merge is needed.
    const borderGradient = extractBorderGradient(rule.declarations);
    if (borderGradient !== undefined) Object.assign(style, borderGradient);
    // Gradient utilities (`bg-linear-*`, `from-*`, `via-*`, `to-*`, `bg-radial`)
    // compile to `--nw-gradient-*` marker props that fold into the compact
    // numeric gradient descriptor once every matching class has merged.
    const gradient = extractGradient(rule.declarations, ruleResolve);
    if (gradient !== undefined) Object.assign(style, gradient);
    // Runs AFTER gradient extraction so a `background-image` that is a gradient
    // is left to the gradient parser (extractBackgroundImage returns undefined
    // for gradients and only captures `url(...)`).
    const backgroundImage = extractBackgroundImage(
      rule.declarations,
      ruleResolve,
    );
    if (backgroundImage !== undefined) Object.assign(style, backgroundImage);
    const clipPath = extractClipPath(rule.declarations, ruleResolve);
    if (clipPath !== undefined) Object.assign(style, clipPath);
    const textShadow = extractTextShadow(rule.declarations, ruleResolve);
    if (textShadow) Object.assign(style, textShadow);
    const fontVariant = extractFontVariant(rule.declarations, ruleResolve);
    if (fontVariant) style.fontVariant = fontVariant;

    // Reanimated entering/exiting/layout presets compile to `--reanimated-*`
    // custom props; keep them verbatim so the runtime can rebuild the
    // Reanimated animation object on the JS/UI thread.
    Object.assign(style, extractReanimatedVars(rule.declarations));
    // A CSS `animation` shorthand (`animate-wiggle`) folds — together with its
    // `@keyframes` — into the discrete `animation*` props Reanimated's native
    // CSS-animation engine consumes.
    const animationDecl = rule.declarations.find((d) =>
      isAnimationProp(d.prop),
    );
    if (animationDecl) {
      // The compiler's `--animate-*` theme tokens emit `animation: var(--animate-x)`;
      // resolve the reference to its shorthand (`x 8s linear infinite`) so the
      // keyframe name is visible to the folder. Inline shorthands (the built-in
      // `animate-*` utilities) pass through unchanged.
      const shorthand = resolveVarsInValue(animationDecl.value, ruleResolve);
      const folded = foldAnimation(shorthand, keyframes);
      if (folded) Object.assign(style, folded);
      // A linear gradient whose angle is driven by an angle-bearing keyframe var
      // gets a runtime-only angle track. Guard on the gradient TYPE marker
      // (the descriptor itself is folded later, in core/normalize.ts) so the
      // track only attaches to linear gradients — per the effects contract.
      if (style[GRADIENT_TYPE_PROP] === "linear") {
        const angleTrack = extractGradientAngleTrack(shorthand, keyframes);
        if (angleTrack) {
          Object.assign(style, {
            "--nitrocss-gradient-angle": angleTrack as unknown as RNStyle[string],
          });
        }
      }
    }
    for (const transitionDecl of rule.declarations.filter((d) =>
      isTransitionProp(d.prop),
    )) {
      const folded = foldTransition(
        transitionDecl.prop,
        transitionDecl.value,
        ruleResolve,
      );
      if (folded) Object.assign(style, folded);
    }

    // A `@container (...)` at-rule context gates this bucket on a container's
    // measured size; a `container-type`/`container-name` declaration makes the
    // node itself a queryable container.
    const containerPrelude = rule.atRules.find((a) => /^@container\b/i.test(a));
    const container = containerPrelude
      ? parseContainerQuery(containerPrelude, rem, ruleResolve)
      : undefined;
    const containerMarker = containerMarkerFromDeclarations(rule.declarations);

    for (const decl of rule.declarations) {
      // Skip declarations the dedicated parsers above already consumed, every
      // custom property (`--tw-*`), and effects RN can't represent (filters).
      if (decl.prop === "--tw-shadow-color") {
        mask = union(mask, dependencyFromValue(decl.value));
      }
      // Gradient color stops reference theme tokens (`from-primary` →
      // `var(--color-primary)`). Those declarations are consumed by the gradient
      // parser, so surface their var dependency here — otherwise a themed
      // gradient never recomputes on a theme / color-scheme switch.
      if (isGradientProp(decl.prop)) {
        mask = union(mask, dependencyFromValue(decl.value));
      }
      if (isParsedProp(decl.prop)) continue;
      // `background`/`border` shorthands consumed by the gradient-border fold.
      if (borderGradient !== undefined && isBorderGradientProp(decl.prop)) {
        // The inner padding-box layer may retain a live theme variable. Keep
        // that dependency even though the shorthand itself is not emitted as
        // an RN prop, so native scheme/theme changes recompute the descriptor.
        mask = union(mask, dependencyFromValue(decl.value));
        continue;
      }
      const rnProps = rnPropsForSelector(rule.selector, decl.prop);
      // Safe-area values become dynamic descriptors resolved against live
      // insets by the runtime + native engine (no React re-render on change).
      const inset = parseInsetValue(decl.value, resolveVar, rem);
      if (inset) {
        for (const rnProp of rnProps) style[rnProp] = inset;
        // The descriptor bakes any offset/floor to px at compile time, so its
        // only live dependency is the safe-area insets themselves.
        mask = union(mask, flag(StyleDependency.Insets));
        continue;
      }
      const resolvedValue = resolveVarsInValue(decl.value, ruleResolve);
      const semanticColor = parseSemanticColor(resolvedValue);
      const wideGamutColor = parseWideGamutColor(resolvedValue);
      const cssMath = /(?:^|[\s(])(calc|min|max|clamp|var)\(|\d(?:vw|vh|vmin|vmax|cqw|cqh|cqi|cqb)\b/i.test(
        resolvedValue,
      )
        ? parseCssMath(resolvedValue)
        : undefined;
      const hasLiveMathDependency = cssMath?.dependencies.some(
        (dependency) =>
          dependency === "viewport" ||
          dependency === "container" ||
          dependency === "percent-base" ||
          dependency === "font-size" ||
          dependency.startsWith("variable:"),
      );
      if (cssMath && !hasLiveMathDependency) {
        const evaluated = evaluateCssMath(cssMath, { rem, em: rem });
        if (evaluated !== undefined) {
          for (const rnProp of rnProps) style[rnProp] = evaluated;
          continue;
        }
      }
      const descriptor =
        semanticColor ??
        wideGamutColor ??
        (cssMath && hasLiveMathDependency ? cssMath : undefined);
      if (descriptor) {
        for (const rnProp of rnProps) style[rnProp] = descriptor;
        if (cssMath) {
          for (const dependency of cssMath.dependencies) {
            if (dependency === "viewport") {
              mask = union(mask, flag(StyleDependency.Dimensions));
            } else if (dependency === "container" || dependency === "percent-base") {
              mask = union(mask, flag(StyleDependency.ContainerSize));
            } else if (dependency === "root-font-size") {
              mask = union(mask, flag(StyleDependency.Rem));
            } else if (dependency === "font-size") {
              mask = union(mask, flag(StyleDependency.FontScale));
            } else if (dependency.startsWith("variable:")) {
              mask = union(mask, flag(StyleDependency.Theme));
            }
          }
        }
        continue;
      }
      const rnValue = toRNValue(rnProps[0] ?? "", decl.value, {
        rem,
        resolveVar: ruleResolve,
      });
      if (rnValue === undefined) continue;
      for (const rnProp of rnProps) style[rnProp] = rnValue;
      mask = union(mask, dependencyFromValue(decl.value));
    }

    if (
      typeof style.fontSize === "number" &&
      typeof style.lineHeight === "number" &&
      style.lineHeight > 0 &&
      style.lineHeight < 4
    ) {
      style.lineHeight = style.fontSize * style.lineHeight;
    }

    if (Object.keys(style).length === 0 && !containerMarker) continue;

    // Platform variants (`ios:`, `android:`, …) are an orthogonal axis to the
    // dark/responsive variant, so they live in their own field. Absent means the
    // bucket applies on every platform.
    const platform = platformFromSelector(rule.selector);
    const bucket: CompiledClass = {
      style,
      dependencies: mask,
      variant: variantFromContext(rule.atRules, rule.selector),
      ...(platform ? { platform } : {}),
      ...(container ? { container } : {}),
      ...(containerMarker ? { containerMarker } : {}),
    };
    (classes[token] ??= []).push(bucket);
  }

  return { classes };
}

export { walkRules };
