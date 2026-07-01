import type { CompileOptions, CompiledArtifact } from "./types";
export * from "./types";
export { compileCss, scanCandidates } from "./compileCss";
export { parseStyles, classTokenFromSelector } from "./parseStyles";
export { extractThemes } from "./themes";
export { toRNProperty, toRNValue } from "./toRNValue";
export { parseInsetValue, lengthToPx } from "./insetValue";
export { INSETS_CSS, generateInsetsCss } from "./insets";
export { PLATFORMS, PLATFORM_CSS, PLATFORM_MARKER, platformFromSelector, } from "./platform";
export type { PlatformName } from "./platform";
export { parseContainerQuery, parseCustomContainerToken, applyCustomContainerTokens, containerMarkerFromDeclarations, isCustomContainerToken, } from "./container";
export type { ContainerAxis, ContainerCondition, ContainerMarker, ContainerOp, CustomContainerToken, } from "./container";
/**
 * Compile a Tailwind stylesheet + the app's class usage into the nitrowind
 * runtime artifact (class → RN style buckets + dependency masks + themes).
 */
export declare function compile(options: CompileOptions): Promise<CompiledArtifact>;
/** Same as `compile`, but from already-built CSS (useful for tests). */
export declare function compileFromCss(css: string, rem?: number): CompiledArtifact;
/**
 * Serialize the artifact for shipping to the native engine
 * (`NitrowindConfig.setCompiledStyles`).
 */
export declare function serializeArtifact(artifact: CompiledArtifact): string;
//# sourceMappingURL=index.d.ts.map