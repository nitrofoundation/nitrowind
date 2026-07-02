import { transform } from "lightningcss";

/**
 * Flatten nested CSS into the plain rule list the lightweight rule walker
 * consumes. Modern toolchains emit nested CSS (`&`-nesting + nested `@media`,
 * often wrapped in `@layer` blocks); transforming with lightningcss while
 * targeting an engine without `&`-nesting support (Chrome 111) un-nests every
 * rule and hoists nested at-rules to the top level, while preserving
 * `env()`/`max()`/`calc()` and `oklch()` untouched.
 */
export function flattenCss(css: string): string {
  const { code } = transform({
    filename: "nitrocss.css",
    code: Buffer.from(css),
    targets: { chrome: 111 << 16 },
    minify: false,
  });
  return code.toString();
}
