import { type VarResolver } from "./insetValue";
export declare const toRNProperty: (cssProperty: string) => string;
export declare const toRNProperties: (cssProperty: string) => string[];
export interface ValueContext {
    /** Root rem value in px. */
    rem: number;
    /** Resolve CSS custom properties used inside length expressions. */
    resolveVar?: VarResolver;
}
/**
 * Coerce a single CSS value string into the RN representation for `rnProperty`.
 * Returns `undefined` if the value can't be represented in RN.
 */
export declare const toRNValue: (rnProperty: string, rawValue: string, ctx: ValueContext) => string | number | undefined;
/**
 * Lower a CSS color to a hex string the *native* color parser understands.
 *
 * React Native's native (Fabric C++) color parser handles hex and named colors
 * but not the modern CSS color functions Tailwind v4 emits (`oklch`, `oklab`,
 * `lab`, `lch`, `color()`) — nor `rgb()/hsl()` function syntax in every path.
 * Theme variable values are substituted verbatim on the native side (they never
 * go through {@link toRNValue}), so any such value is dropped at commit time
 * unless it is pre-converted. Non-color values (lengths, keywords, font stacks)
 * and already-native forms (hex, named colors) are returned untouched.
 */
export declare const normalizeColorValue: (value: string) => string;
//# sourceMappingURL=toRNValue.d.ts.map