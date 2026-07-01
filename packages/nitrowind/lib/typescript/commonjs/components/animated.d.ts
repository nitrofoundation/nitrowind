import type { ComponentType } from "react";
/** Reanimated's `Animated.View`, or `null` if reanimated isn't installed. */
export declare const getAnimatedView: () => ComponentType<unknown> | null;
/** Reanimated's `Animated.Text`, or `null` if reanimated isn't installed. */
export declare const getAnimatedText: () => ComponentType<unknown> | null;
/**
 * Reanimated equivalent of an arbitrary host component (via
 * `createAnimatedComponent`), memoised per input. Returns `null` if reanimated
 * isn't installed.
 */
export declare function getAnimatedComponent(component: ComponentType<unknown>): ComponentType<unknown> | null;
//# sourceMappingURL=animated.d.ts.map