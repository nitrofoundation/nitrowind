import { type VarResolver } from "./insetValue";
import type { CompiledArtifact } from "./types";
interface RuleRecord {
    /** Raw selector text (already comma-split into one selector). */
    selector: string;
    /** Stack of enclosing at-rule preludes (e.g. `@media (...)`). */
    atRules: string[];
    /** Raw `prop: value` declarations. */
    declarations: Array<{
        prop: string;
        value: string;
        important: boolean;
    }>;
}
/**
 * A small, dependency-free CSS walker tuned for Tailwind's compiled output.
 * Yields one record per (selector, at-rule context) with raw declarations so we
 * can faithfully coerce values to RN. Handles nested at-rules via a context
 * stack and ignores `@`-rules we don't care about.
 */
declare function walkRules(css: string, inherited?: string[]): Generator<RuleRecord>;
/**
 * Extract the utility class-name token from a selector, unescaping Tailwind's
 * `\:` etc. Group selectors contain both `.group` and `.group-active\:*`; in
 * that shape the utility token is the descendant class, not the group root.
 */
export declare function classTokenFromSelector(selector: string): string | undefined;
/**
 * Parse compiled CSS into the runtime artifact (classes + their dependency
 * masks). Theme variables are extracted separately (see `extractThemes`).
 *
 * `resolveVar` resolves CSS custom properties (e.g. `--spacing`) so safe-area
 * offset/floor amounts can be reduced to px at compile time.
 */
export declare function parseStyles(css: string, rem: number, resolveVar?: VarResolver): Pick<CompiledArtifact, "classes">;
export { walkRules };
//# sourceMappingURL=parseStyles.d.ts.map