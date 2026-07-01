/**
 * CSS animation + Reanimated value parsing.
 *
 * Two distinct mechanisms share this file:
 *
 * 1. **CSS `@keyframes` animations** (`animate-wiggle`, …). The `animation`
 *    shorthand + the matching `@keyframes` block are folded — at compile time —
 *    into the discrete `animation*` style props Reanimated's CSS-animation
 *    engine consumes (`animationName`, `animationDuration`, …). These run
 *    natively with no JS driver.
 *
 * 2. **Reanimated entering/exiting/layout presets** (`entering-fade-in`, …),
 *    which compile to `--reanimated-*` custom properties. Those are *kept* in
 *    the bucket so the runtime can rebuild the Reanimated animation object on
 *    the JS/UI thread (see `src/core/reanimated.ts`).
 */
import type { Keyframes, RNStyle } from "../types";
export declare const REANIMATED_VAR_PREFIX = "--reanimated-";
/** True for a Reanimated entering/exiting/layout custom property. */
export declare const isReanimatedVar: (prop: string) => boolean;
/** True for the CSS `animation` shorthand (the only animation prop we fold). */
export declare const isAnimationProp: (prop: string) => boolean;
/** True for CSS transition declarations consumed by Reanimated's CSS engine. */
export declare const isTransitionProp: (prop: string) => boolean;
/** Collect a rule's `--reanimated-*` declarations into a plain object. */
export declare const extractReanimatedVars: (declarations: ReadonlyArray<{
    prop: string;
    value: string;
}>) => Record<string, string>;
export declare const normalizeTimingFunction: (value: string) => string;
/** Coerce a CSS transition declaration into Reanimated's RN style props. */
export declare function foldTransition(prop: string, value: string, resolveVar: (name: string) => string | undefined): RNStyle | undefined;
/**
 * Parse a CSS `transform` shorthand string (`"scaleX(1.25) scaleY(0.75)"`) into
 * RN's transform array (`[{ scaleX: 1.25 }, { scaleY: 0.75 }]`). Used for the
 * `transform` declarations inside `@keyframes` steps.
 */
export declare function parseTransformString(value: string, rem: number): ReadonlyArray<Record<string, string | number>>;
/**
 * Extract every `@keyframes` block from compiled CSS into a name -> keyframes
 * map. Combined step selectors (`0%, 100%`) are split so each offset is a
 * discrete entry, the shape Reanimated's CSS-animation API expects.
 */
export declare function extractKeyframes(css: string, rem?: number): Record<string, Keyframes>;
/**
 * Fold a CSS `animation` shorthand (`"wiggle 1s ease-in-out infinite"`) into the
 * discrete `animation*` RN props, resolving the referenced `@keyframes` into the
 * inline `animationName` object. Returns `undefined` if the name is unknown.
 */
export declare function foldAnimation(shorthand: string, keyframes: Record<string, Keyframes>): RNStyle | undefined;
//# sourceMappingURL=animations.d.ts.map