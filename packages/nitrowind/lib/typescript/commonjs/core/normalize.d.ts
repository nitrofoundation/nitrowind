import type { RNStyle } from "../compiler/types";
/**
 * Fold the individual transform-axis props the compiler emits (`translateX`,
 * `rotate`, `scaleX`, …) into RN's single `transform` array, in canonical
 * order. Mutates `style` in place.
 *
 * Running this once after every matching class has been merged is what makes
 * multi-class transform composition behave like CSS: the same axis resolves
 * last-wins (plain object merge) while different axes union into one array.
 * The native C++ engine performs the identical fold so both paths agree.
 */
export declare function foldTransform(style: RNStyle): void;
export declare function normalizeShadow(style: RNStyle): void;
//# sourceMappingURL=normalize.d.ts.map