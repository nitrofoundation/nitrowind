import type { CompileOptions } from "./types";
/** Scan the project's source files for candidate class names. */
export declare function scanCandidates(options: CompileOptions): string[];
/**
 * Run Tailwind v4 over the project to produce the final CSS for the classes
 * actually used in the app.
 */
export declare function compileCss(options: CompileOptions, candidates?: string[]): Promise<string>;
//# sourceMappingURL=compileCss.d.ts.map