import { compileCss, scanCandidates } from "./compileCss";
import { applyCustomContainerTokens } from "./container";
import { parseStyles } from "./parseStyles";
import { extractThemes } from "./themes";
import type { CompileOptions, CompiledArtifact } from "./types";

export * from "./types";
export { compileCss, scanCandidates } from "./compileCss";
export { parseStyles, classTokenFromSelector } from "./parseStyles";
export { extractThemes } from "./themes";
export { toRNProperty, toRNValue } from "./toRNValue";
export { parseInsetValue, lengthToPx } from "./insetValue";
export { INSETS_CSS, generateInsetsCss } from "./insets";
export {
  PLATFORMS,
  PLATFORM_CSS,
  PLATFORM_MARKER,
  platformFromSelector,
} from "./platform";
export type { PlatformName } from "./platform";
export {
  parseContainerQuery,
  parseCustomContainerToken,
  applyCustomContainerTokens,
  containerMarkerFromDeclarations,
  isCustomContainerToken,
} from "./container";
export type {
  ContainerAxis,
  ContainerCondition,
  ContainerMarker,
  ContainerOp,
  CustomContainerToken,
} from "./container";

/**
 * Compile a Tailwind stylesheet + the app's class usage into the nitrowind
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
  return artifact;
}

/** Same as `compile`, but from already-built CSS (useful for tests). */
export function compileFromCss(css: string, rem = 16): CompiledArtifact {
  const { themes, themeNames } = extractThemes(css);
  // Resolve `--spacing` (and other vars) from the base theme so safe-area
  // offset/floor amounts reduce to px at compile time.
  const baseVars = themes[themeNames[0] ?? "light"] ?? {};
  const resolveVar = (name: string): string | undefined =>
    baseVars[name] ?? (name === "--spacing" ? "0.25rem" : undefined);
  const { classes } = parseStyles(css, rem, resolveVar);
  return {
    classes,
    themes,
    themeNames: themeNames.length > 0 ? themeNames : ["light"],
    rem,
  };
}

/**
 * Serialize the artifact for shipping to the native engine
 * (`NitrowindConfig.setCompiledStyles`).
 */
export function serializeArtifact(artifact: CompiledArtifact): string {
  return JSON.stringify(artifact);
}
