import type { InsetValue } from "./types";
/** Resolves a CSS custom property name (e.g. `--spacing`) to its raw value. */
export type VarResolver = (name: string) => string | undefined;
/** Resolve a length operand (`10px`, `calc(var(--spacing) * 2)`, …) to px. */
export declare function lengthToPx(raw: string, resolveVar: VarResolver, rem: number): number | undefined;
/**
 * Parse a single declaration value into a dynamic inset descriptor, or
 * `undefined` if it is not a safe-area value. Handles the three shapes Tailwind
 * emits for the safe-area utility families:
 *
 *   env(safe-area-inset-top)                                  -> { add: 0,  floor: 0 }
 *   calc(env(safe-area-inset-top) + <len>)                    -> { add: len, floor: 0 }
 *   max(env(safe-area-inset-top), <len>)                      -> { add: 0,  floor: len }
 */
export declare function parseInsetValue(rawValue: string, resolveVar: VarResolver, rem: number): InsetValue | undefined;
//# sourceMappingURL=insetValue.d.ts.map