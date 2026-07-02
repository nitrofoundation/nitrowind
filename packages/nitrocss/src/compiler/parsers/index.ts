/**
 * Value parsers that fold Tailwind's CSS output into React Native style shapes:
 * transforms (per-axis → `transform` array), shadows, and font variants. The
 * transform axes are emitted as individual props and folded at resolve time
 * (see `core/normalize`); the rest produce their final RN props at compile time.
 */
export {
  extractTransform,
  isTransformProp,
  TRANSFORM_AXES,
  type TransformAxis,
} from "./transform";
export { extractBoxShadow, isBoxShadowProp } from "./boxShadow";
export { BACKDROP_FILTER_PROP, extractFilter, isFilterProp } from "./filter";
export {
  angleFromPosition,
  extractGradient,
  foldGradient,
  isGradientProp,
  parseStopLocation,
  radialCenterFromPosition,
  GRADIENT_DESCRIPTOR_PROP,
  GRADIENT_STYLE_PROPS,
  type GradientDescriptor,
  type GradientFoldTarget,
} from "./gradient";
export {
  extractTextShadow,
  isTextShadowProp,
  type TextShadowStyle,
} from "./textShadow";
export { extractFontVariant, isFontVariantProp } from "./fontVariant";
export {
  extractKeyframes,
  extractReanimatedVars,
  foldAnimation,
  foldTransition,
  isAnimationProp,
  isReanimatedVar,
  isTransitionProp,
  parseTransformString,
  REANIMATED_VAR_PREFIX,
} from "./animations";
