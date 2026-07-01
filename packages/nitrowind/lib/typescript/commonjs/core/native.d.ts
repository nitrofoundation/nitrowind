import type * as Specs from "../specs";
type SpecsModule = typeof Specs;
/**
 * Lazily resolve the native Nitro engine. Returns `null` when the native module
 * is unavailable (web, Expo Go, tests) so the JS fallback can take over.
 */
export declare function getEngine(): SpecsModule | null;
/** Whether the native C++ ShadowTree engine is present and usable. */
export declare function hasNativeEngine(): boolean;
export {};
//# sourceMappingURL=native.d.ts.map