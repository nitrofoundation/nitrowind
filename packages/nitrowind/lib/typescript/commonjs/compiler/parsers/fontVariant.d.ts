import type { VarResolver } from "../insetValue";
interface Decl {
    prop: string;
    value: string;
}
/**
 * Map CSS `font-variant` / `font-variant-numeric` (and the other
 * `font-variant-*` longhands) onto RN's `fontVariant` array. Tailwind composes
 * these from per-feature `--tw-*` helpers, so the value is resolved first and
 * the empty placeholders are dropped.
 */
export declare function extractFontVariant(declarations: ReadonlyArray<Decl>, resolveVar: VarResolver): string[] | undefined;
/** True for declarations consumed by the font-variant parser. */
export declare const isFontVariantProp: (prop: string) => boolean;
export {};
//# sourceMappingURL=fontVariant.d.ts.map