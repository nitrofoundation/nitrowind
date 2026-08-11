import type {
  AccessibilityBooleanVariant,
  AccessibilityEnvironmentSnapshot,
  AccessibilityVariant,
  FontScaleComparison,
  ParsedAccessibilityCandidate,
} from "./types";

const BOOLEAN_VARIANTS = new Set([
  "motion-reduce",
  "contrast-more",
  "reduce-transparency",
  "bold-text",
  "screen-reader",
]);
const FONT_SCALE_RE = /^font-scale-\[(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)\]$/;

function splitVariants(candidate: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let bracketDepth = 0;
  let escaped = false;
  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === ":" && bracketDepth === 0) {
      parts.push(candidate.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(candidate.slice(start));
  return parts;
}

export function parseAccessibilityVariant(
  prefix: string,
): AccessibilityVariant | null {
  if (BOOLEAN_VARIANTS.has(prefix)) {
    return { kind: prefix as AccessibilityBooleanVariant };
  }
  const fontScale = FONT_SCALE_RE.exec(prefix);
  if (!fontScale) return null;
  const value = Number(fontScale[2]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    kind: "font-scale",
    comparison: (fontScale[1] ?? ">=") as FontScaleComparison,
    value,
  };
}

/** Parse accessibility prefixes anywhere in a Tailwind candidate chain. */
export function parseAccessibilityCandidate(
  candidate: string,
): ParsedAccessibilityCandidate | null {
  const parts = splitVariants(candidate);
  if (parts.length < 2) return null;
  const utility = parts.at(-1) ?? "";
  const retained: string[] = [];
  const variants: AccessibilityVariant[] = [];
  for (const prefix of parts.slice(0, -1)) {
    const parsed = parseAccessibilityVariant(prefix);
    if (parsed) variants.push(parsed);
    else retained.push(prefix);
  }
  if (variants.length === 0) return null;
  return {
    candidate,
    variants,
    utility: [...retained, utility].filter(Boolean).join(":"),
  };
}

export function matchesAccessibilityVariant(
  variant: AccessibilityVariant,
  environment: AccessibilityEnvironmentSnapshot,
): boolean {
  switch (variant.kind) {
    case "motion-reduce":
      return environment.reduceMotion;
    case "contrast-more":
      return environment.increasedContrast;
    case "reduce-transparency":
      return environment.reduceTransparency;
    case "bold-text":
      return environment.boldText;
    case "screen-reader":
      return environment.screenReaderEnabled;
    case "font-scale": {
      switch (variant.comparison) {
        case ">":
          return environment.fontScale > variant.value;
        case ">=":
          return environment.fontScale >= variant.value;
        case "<":
          return environment.fontScale < variant.value;
        case "<=":
          return environment.fontScale <= variant.value;
        case "=":
          return environment.fontScale === variant.value;
      }
    }
  }
}

/** Return the stripped utility only while every accessibility condition holds. */
export function evaluateAccessibilityCandidate(
  candidate: string,
  environment: AccessibilityEnvironmentSnapshot,
): ParsedAccessibilityCandidate | null {
  const parsed = parseAccessibilityCandidate(candidate);
  if (!parsed) return null;
  return parsed.variants.every((variant) =>
    matchesAccessibilityVariant(variant, environment),
  )
    ? parsed
    : null;
}

/**
 * Filter inactive candidates while retaining active candidate identity. The
 * compiled artifact is keyed by the original prefixed class token.
 */
export function resolveAccessibilityClassName(
  className: string,
  environment: AccessibilityEnvironmentSnapshot,
): string {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((candidate) => {
      const parsed = parseAccessibilityCandidate(candidate);
      if (!parsed) return [candidate];
      return parsed.variants.every((variant) =>
        matchesAccessibilityVariant(variant, environment),
      )
        ? [parsed.candidate]
        : [];
    })
    .join(" ");
}
