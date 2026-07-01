import type { CompiledArtifact } from "./types";
/**
 * Collect CSS custom properties grouped by theme name. Supports:
 * - `@theme { --x: … }` and `:root { --x: … }` → base theme (default `light`)
 * - `@media (prefers-color-scheme: dark) :root` → `dark`
 * - `[data-theme="name"]`, `.dark`, `.light`, `.theme-name`
 */
export declare function extractThemes(css: string, baseThemeName?: string): Pick<CompiledArtifact, "themes" | "themeNames">;
//# sourceMappingURL=themes.d.ts.map