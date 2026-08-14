import type { AccessibilityEnvironment, AccessibilityVariant } from "./types";

const BOOLEAN_VARIANTS = new Set([
  "motion-reduce", "contrast-more", "reduce-transparency", "bold-text", "screen-reader",
]);
const FONT_SCALE_RE = /^font-scale-\[(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)\]$/;

function splitVariants(candidate: string): string[] {
  const parts: string[] = [];
  let start = 0, bracketDepth = 0, escaped = false;
  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === ":" && bracketDepth === 0) {
      parts.push(candidate.slice(start, index)); start = index + 1;
    }
  }
  parts.push(candidate.slice(start));
  return parts;
}

export function parseAccessibilityVariant(prefix: string): AccessibilityVariant | null {
  if (BOOLEAN_VARIANTS.has(prefix)) return { kind: prefix as AccessibilityVariant["kind"] } as AccessibilityVariant;
  const match = FONT_SCALE_RE.exec(prefix);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { kind: "font-scale", comparison: (match[1] ?? ">=") as ">=", value };
}

export function matchesAccessibilityVariant(variant: AccessibilityVariant, env: AccessibilityEnvironment): boolean {
  switch (variant.kind) {
    case "motion-reduce": return env.reduceMotion;
    case "contrast-more": return env.increasedContrast;
    case "reduce-transparency": return env.reduceTransparency;
    case "bold-text": return env.boldText;
    case "screen-reader": return env.screenReaderEnabled;
    case "font-scale":
      switch (variant.comparison) {
        case ">": return env.fontScale > variant.value;
        case ">=": return env.fontScale >= variant.value;
        case "<": return env.fontScale < variant.value;
        case "<=": return env.fontScale <= variant.value;
        case "=": return env.fontScale === variant.value;
      }
  }
}

export function resolveAccessibilityClassName(className: string, env: AccessibilityEnvironment): string {
  return className.split(/\s+/).filter(Boolean).flatMap((candidate) => {
    const parts = splitVariants(candidate);
    const variants = parts.slice(0, -1).map(parseAccessibilityVariant).filter((v): v is AccessibilityVariant => v !== null);
    if (variants.length === 0) return [candidate];
    return variants.every((v) => matchesAccessibilityVariant(v, env)) ? [candidate] : [];
  }).join(" ");
}
