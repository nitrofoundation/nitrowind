import type { VarResolver } from "../insetValue";
import type { RNStyle } from "../types";
interface Decl {
    prop: string;
    value: string;
}
/**
 * React Native New Architecture accepts `filter` as an array of filter function
 * objects. Tailwind emits filters as composed `--tw-*` variables, so compile
 * the resolved CSS functions to the native object form Fabric can consume.
 */
export declare function extractFilter(declarations: ReadonlyArray<Decl>, resolveVar: VarResolver): RNStyle | undefined;
export declare const isFilterProp: (prop: string) => boolean;
export {};
//# sourceMappingURL=filter.d.ts.map