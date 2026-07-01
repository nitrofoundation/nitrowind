import { StyleDependency } from "../specs/types";
import type { DependencyMask } from "./types";
export declare const flag: (dep: StyleDependency) => DependencyMask;
export declare const addFlag: (mask: DependencyMask, dep: StyleDependency) => DependencyMask;
export declare const hasFlag: (mask: DependencyMask, dep: StyleDependency) => boolean;
export declare const union: (...masks: DependencyMask[]) => DependencyMask;
/** Expand a mask into the list of `StyleDependency` values it contains. */
export declare const toList: (mask: DependencyMask) => StyleDependency[];
/**
 * Infer the dependency a CSS `@media`/`@container` condition introduces.
 */
export declare const dependencyFromAtRule: (condition: string) => DependencyMask;
/**
 * Infer dependencies introduced by a selector (e.g. `[dir="rtl"]`, `:root`
 * theme attributes) or by a raw value referencing a CSS variable / env().
 */
export declare const dependencyFromSelector: (selector: string) => DependencyMask;
/** Dependencies introduced by a raw declaration value. */
export declare const dependencyFromValue: (value: string) => DependencyMask;
//# sourceMappingURL=dependencies.d.ts.map