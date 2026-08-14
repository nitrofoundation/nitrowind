import { basename, dirname, resolve } from "node:path";
import {
  flattenCss,
  parseCustomContainerToken,
  scanCustomContainerCandidates,
  type CompileOptions,
} from "@nitrofoundation/nitrocss/compiler";
import { compile as tailwindCompile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { PLATFORM_CSS } from "./platform";
import { REANIMATED_CSS } from "./reanimated";
import { ACCESSIBILITY_CSS, accessibilityBaseCandidate } from "./accessibility";

/** Scan the project's source files for candidate class names. */
export function scanCandidates(options: CompileOptions): string[] {
  const cwd = options.cwd ?? process.cwd();
  const scanner = new Scanner({
    sources: options.content.map((pattern) => ({
      base: cwd,
      pattern,
      negated: false,
    })),
  });
  return [
    ...new Set([...scanner.scan(), ...scanCustomContainerCandidates(options)]),
  ];
}

/**
 * Run Tailwind v4 over the project to produce the final CSS for the classes
 * actually used in the app.
 */
export async function compileCss(
  options: CompileOptions,
  candidates?: string[],
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const inputPath = resolve(cwd, options.input);
  const base = dirname(inputPath);

  // The entry stylesheet is pulled in through Tailwind's own `@import`
  // resolver (relative to `base`). NitroCSS supplies the native safe-area
  // `@utility` family; platform variants (`ios:`, `android:`, …) and the
  // Reanimated / CSS-animation utilities are appended so `p-safe`, `ios:bg-…`,
  // `entering-fade-in`, `animate-wiggle`, etc. are all available without any
  // extra plugin or import.
  const compiler = await tailwindCompile(
    `@import "./${basename(inputPath)}";\n@import "@nitrofoundation/nitrocss";\n${PLATFORM_CSS}\n${ACCESSIBILITY_CSS}\n${REANIMATED_CSS}`,
    {
      base,
      onDependency: () => {},
    },
  );

  const scanned = candidates ?? scanCandidates(options);
  // Custom container tokens (`[parent-w>230px]:hidden`) aren't valid Tailwind
  // classes, but their base utility (`hidden`) must be emitted so we can clone
  // its style later. Inject those base utilities as extra candidates.
  const rem = options.rem ?? 16;
  const baseUtilities = scanned
    .map((t) => parseCustomContainerToken(t, rem)?.baseUtility)
    .filter((u): u is string => Boolean(u));
  const accessibilityUtilities = scanned
    .map(accessibilityBaseCandidate)
    .filter((u): u is string => Boolean(u));
  const allCandidates = [...scanned, ...baseUtilities, ...accessibilityUtilities];

  // Tailwind v4 emits nested CSS (`&`-nesting + nested `@media`) wrapped in
  // `@layer` blocks; `flattenCss` (nitrocss) un-nests every rule so the
  // lightweight rule walker can consume it.
  return flattenCss(compiler.build(allCandidates));
}
