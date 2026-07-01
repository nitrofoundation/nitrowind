import type { CompiledArtifact, CompiledClass } from "../compiler/types";
/**
 * Install the compiled style artifact (produced by the build step / Metro
 * plugin). Ships the tables to the native engine when present, and keeps a JS
 * copy for the fallback path.
 *
 * This object-based API is kept for tests and compatibility. Metro should use
 * `registerSerializedStyles` so native builds do not create a large JS object
 * and stringify it again during startup.
 */
export declare function registerStyles(next: CompiledArtifact): void;
/**
 * Install a pre-serialized native artifact. This is the optimized Metro path:
 * it passes the JSON payload straight to C++ and only parses in JS if the
 * fallback resolver actually needs the artifact.
 */
export declare function registerSerializedStyles(json: string, themeNames: string[], rem?: number): void;
export declare function getArtifact(): CompiledArtifact | null;
export declare function getArtifactVersion(): number;
export declare function getClassBuckets(token: string): CompiledClass[] | undefined;
export declare function getThemeVars(themeName: string): Record<string, string> | undefined;
export declare function getDefaultThemeName(): string;
export declare function getRem(): number;
//# sourceMappingURL=registry.d.ts.map