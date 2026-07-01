"use strict";

import { compileCss, scanCandidates } from "./compileCss.js";
import { applyCustomContainerTokens } from "./container.js";
import { parseStyles } from "./parseStyles.js";
import { extractThemes } from "./themes.js";
export * from "./types.js";
export { compileCss, scanCandidates } from "./compileCss.js";
export { parseStyles, classTokenFromSelector } from "./parseStyles.js";
export { extractThemes } from "./themes.js";
export { toRNProperty, toRNValue } from "./toRNValue.js";
export { parseInsetValue, lengthToPx } from "./insetValue.js";
export { INSETS_CSS, generateInsetsCss } from "./insets.js";
export { PLATFORMS, PLATFORM_CSS, PLATFORM_MARKER, platformFromSelector } from "./platform.js";
export { parseContainerQuery, parseCustomContainerToken, applyCustomContainerTokens, containerMarkerFromDeclarations, isCustomContainerToken } from "./container.js";
/**
 * Compile a Tailwind stylesheet + the app's class usage into the nitrowind
 * runtime artifact (class → RN style buckets + dependency masks + themes).
 */
export async function compile(options) {
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
export function compileFromCss(css, rem = 16) {
  const {
    themes,
    themeNames
  } = extractThemes(css);
  // Resolve `--spacing` (and other vars) from the base theme so safe-area
  // offset/floor amounts reduce to px at compile time.
  const baseVars = themes[themeNames[0] ?? "light"] ?? {};
  const resolveVar = name => baseVars[name] ?? (name === "--spacing" ? "0.25rem" : undefined) ?? (name === "--tw-border-style" ? "solid" : undefined);
  const {
    classes
  } = parseStyles(css, rem, resolveVar);
  return {
    classes,
    themes,
    themeNames: themeNames.length > 0 ? themeNames : ["light"],
    rem
  };
}

/**
 * Serialize the artifact for shipping to the native engine
 * (`NitrowindConfig.setCompiledStyles`).
 */
export function serializeArtifact(artifact) {
  return JSON.stringify(artifact);
}
//# sourceMappingURL=index.js.map