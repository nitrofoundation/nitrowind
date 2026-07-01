import type { VarResolver } from "../insetValue";
import type { RNStyle } from "../types";
interface Decl {
    prop: string;
    value: string;
}
/**
 * Build RN's `boxShadow` string from Tailwind's `--tw-shadow` helper (the
 * `box-shadow` longhand only composes ring/inset placeholders). Bare numbers
 * get an explicit `px` so RN's shadow string parser accepts them.
 */
export declare function extractBoxShadow(declarations: ReadonlyArray<Decl>, resolveVar: VarResolver): RNStyle | undefined;
/** True for declarations consumed by the box-shadow parser. */
export declare const isBoxShadowProp: (prop: string) => boolean;
export {};
//# sourceMappingURL=boxShadow.d.ts.map