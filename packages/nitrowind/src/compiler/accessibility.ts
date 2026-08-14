/**
 * Variants gated by NitroCSS's live AccessibilityInfo store. The selector is
 * intentionally identity-only: runtime filtering owns the condition.
 * Tailwind already provides motion-reduce and contrast-more.
 */
export const ACCESSIBILITY_CSS = [
  "reduce-transparency",
  "bold-text",
  "screen-reader",
].map((name) => `@custom-variant ${name} (&);`).join("\n");

const ACCESSIBILITY_PREFIX = /^(?:motion-reduce|contrast-more|reduce-transparency|bold-text|screen-reader|font-scale-\[(?:>=|<=|>|<|=)?\s*\d+(?:\.\d+)?\])$/;

export function accessibilityBaseCandidate(candidate: string): string | undefined {
  const parts: string[] = [];
  let start = 0, depth = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (char === "[") depth += 1;
    else if (char === "]") depth = Math.max(0, depth - 1);
    else if (char === ":" && depth === 0) {
      parts.push(candidate.slice(start, index)); start = index + 1;
    }
  }
  parts.push(candidate.slice(start));
  if (parts.length < 2) return undefined;
  const retained = parts.filter((part, index) =>
    index === parts.length - 1 || !ACCESSIBILITY_PREFIX.test(part),
  );
  return retained.length === parts.length ? undefined : retained.join(":");
}
