/**
 * Runtime Reanimated animation builders.
 *
 * The compiler bakes `entering-*` / `exiting-*` / `layout-*` utilities into
 * `--reanimated-*` custom properties (see `src/compiler/reanimated.ts`). Here we
 * read those properties back and reconstruct the corresponding
 * `react-native-reanimated` animation object on the JS side — the only place
 * Reanimated entering/exiting/layout animations can be created. The C++ engine
 * deliberately does **not** drive these (they live on the JS/UI thread).
 *
 * `react-native-reanimated` is an optional peer dependency: every entry point
 * degrades to `undefined` when it isn't installed, so apps that don't use
 * animations pay nothing and never import it.
 */
/** Reanimated animation builder/instance — kept opaque (optional peer dep). */
export type ReanimatedAnimation = unknown;
/** Parse a CSS time token (`"300ms"`, `"0.8s"`) into milliseconds. */
export declare function parseTimeToMs(value: string | undefined): number | undefined;
export type AnimationPrefix = "entering" | "exiting" | "layout";
export interface AnimationConfig {
    name: string;
    duration?: string;
    delay?: string;
    springify?: string;
    damping?: string;
    stiffness?: string;
    mass?: string;
    easing?: string;
}
/** Read the `--reanimated-<prefix>*` custom props into a config, if present. */
export declare function extractAnimationConfig(vars: Record<string, string>, prefix: AnimationPrefix): AnimationConfig | undefined;
/** Build the Reanimated *entering* animation from `--reanimated-entering*`. */
export declare const buildEnteringAnimation: (vars: Record<string, string>) => ReanimatedAnimation;
/** Build the Reanimated *exiting* animation from `--reanimated-exiting*`. */
export declare const buildExitingAnimation: (vars: Record<string, string>) => ReanimatedAnimation;
/** Build the Reanimated *layout* transition from `--reanimated-layout*`. */
export declare function buildLayoutAnimation(vars: Record<string, string>): ReanimatedAnimation;
/** Whether any `--reanimated-*` entering/exiting/layout var is present. */
export declare const hasReanimatedVars: (vars: Record<string, string>) => boolean;
//# sourceMappingURL=reanimated.d.ts.map