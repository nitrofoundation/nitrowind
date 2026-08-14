/**
 * `nitrowind/compiler` — the Tailwind side of the toolchain.
 *
 * Re-exports the whole `/nitrocss/compiler` surface (types,
 * `compileFromCss`, container/inset/platform helpers, …) and adds the
 * Tailwind-specific pieces that live here: the oxide candidate scanner, the
 * Tailwind v4 CSS build (`compileCss`), the synthesized utility stylesheets
 * (`PLATFORM_CSS` / `INSETS_CSS` / `REANIMATED_CSS`), and the one-shot
 * `compile()` orchestrator.
 */
import {
  applyCustomContainerTokens,
  compileFromCss,
  type CompileOptions,
  type CompiledArtifact,
} from "@nitrofoundation/nitrocss/compiler";
import { compileCss, scanCandidates } from "./compileCss";
import { accessibilityBaseCandidate } from "./accessibility";

export * from "@nitrofoundation/nitrocss/compiler";
export { compileCss, scanCandidates } from "./compileCss";
export { INSETS_CSS, generateInsetsCss } from "./insets";
export { PLATFORM_CSS } from "./platform";
export { CSS_ANIMATIONS, REANIMATED_CSS } from "./reanimated";

/**
 * Compile a Tailwind stylesheet + the app's class usage into the nitrocss
 * runtime artifact (class → RN style buckets + dependency masks + themes).
 */
export async function compile(
  options: CompileOptions,
): Promise<CompiledArtifact> {
  const rem = options.rem ?? 16;
  const candidates = scanCandidates(options);
  const css = await compileCss(options, candidates);
  const artifact = compileFromCss(css, rem);
  // Materialize the custom container syntax (`[parent-w>230px]:hidden`) by
  // cloning each base utility's compiled style under a container-gated bucket.
  applyCustomContainerTokens(artifact, candidates, rem);
  for (const candidate of candidates) {
    const base = accessibilityBaseCandidate(candidate);
    if (!base || artifact.classes[candidate] || !artifact.classes[base]) continue;
    artifact.classes[candidate] = artifact.classes[base].map((bucket) => ({
      ...bucket,
      style: { ...bucket.style },
    }));
  }
  return artifact;
}
