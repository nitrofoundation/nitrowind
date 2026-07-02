import { parseStyles } from "./parseStyles";
import { extractThemes } from "./themes";
import type { CompiledArtifact } from "./types";

export * from "./types";
export { flattenCss } from "./flatten";
export {
  scanCustomContainerCandidates,
  collectFiles,
  filesForPattern,
} from "./scanSources";
export { parseStyles, classTokenFromSelector } from "./parseStyles";
export { extractThemes } from "./themes";
export { toRNProperty, toRNValue } from "./toRNValue";
export { parseInsetValue, lengthToPx } from "./insetValue";
export { PLATFORMS, PLATFORM_MARKER, platformFromSelector } from "./platform";
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
export { ENTERING_EXITING_PRESETS, LAYOUT_PRESETS } from "./reanimated";

/**
 * Compile flattened CSS into the nitrocss runtime artifact
 * (class → RN style buckets + dependency masks + themes).
 */
export function compileFromCss(css: string, rem = 16): CompiledArtifact {
  const { themes, themeNames } = extractThemes(css);
  // Resolve `--spacing` (and other vars) from the base theme so safe-area
  // offset/floor amounts reduce to px at compile time.
  const baseVars = themes[themeNames[0] ?? "light"] ?? {};
  const resolveVar = (name: string): string | undefined =>
    baseVars[name] ??
    (name === "--spacing" ? "0.25rem" : undefined) ??
    (name === "--tw-border-style" ? "solid" : undefined);
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
 * (`NitroCssConfig.setCompiledStyles`).
 */
export function serializeArtifact(artifact: CompiledArtifact): string {
  return JSON.stringify(artifact);
}
