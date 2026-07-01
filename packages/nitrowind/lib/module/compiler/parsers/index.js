"use strict";

/**
 * Value parsers that fold Tailwind's CSS output into React Native style shapes:
 * transforms (per-axis → `transform` array), shadows, and font variants. The
 * transform axes are emitted as individual props and folded at resolve time
 * (see `core/normalize`); the rest produce their final RN props at compile time.
 */
export { extractTransform, isTransformProp, TRANSFORM_AXES } from "./transform.js";
export { extractBoxShadow, isBoxShadowProp } from "./boxShadow.js";
export { extractFilter, isFilterProp } from "./filter.js";
export { extractTextShadow, isTextShadowProp } from "./textShadow.js";
export { extractFontVariant, isFontVariantProp } from "./fontVariant.js";
export { extractKeyframes, extractReanimatedVars, foldAnimation, foldTransition, isAnimationProp, isReanimatedVar, isTransitionProp, parseTransformString, REANIMATED_VAR_PREFIX } from "./animations.js";
//# sourceMappingURL=index.js.map