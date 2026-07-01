import { StyleDependency } from "../specs/types";
/** Bitmask of `StyleDependency` flags. */
export type DependencyMask = number;
/** The full set of runtime dependencies as a single mask. */
export declare const ALL_DEPENDENCIES: DependencyMask;
export declare const flag: (dependency: StyleDependency) => DependencyMask;
export declare const hasFlag: (mask: DependencyMask, dependency: StyleDependency) => boolean;
export declare const union: (...masks: DependencyMask[]) => DependencyMask;
/** Expand a bitmask into the list of `StyleDependency` values it contains. */
export declare function toList(mask: DependencyMask): StyleDependency[];
//# sourceMappingURL=mask.d.ts.map