/**
 * Value parsers that fold the utility compiler's CSS output into React Native style shapes:
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
export {
  CLIP_PATH_PROP,
  extractClipPath,
  isClipPathProp,
  type ClipPathDescriptor,
  type ClipValue,
} from "./clipPath";
export {
  BACKGROUND_IMAGE_PROP,
  extractBackgroundImage,
  isBackgroundImageProp,
  type BackgroundImageDescriptor,
} from "./backgroundImage";
export {
  BACKDROP_FILTER_PROP,
  backdropBlurRadius,
  extractFilter,
  isFilterProp,
} from "./filter";
export {
  extractBorderGradient,
  isBorderGradientProp,
} from "./borderGradient";
export {
  angleFromPosition,
  conicGeometryFromPosition,
  extractGradient,
  foldGradient,
  isGradientProp,
  parseStopLocation,
  radialCenterFromPosition,
  GRADIENT_DESCRIPTOR_PROP,
  GRADIENT_STYLE_PROPS,
  GRADIENT_TYPE_PROP,
  type GradientDescriptor,
  type GradientFoldTarget,
} from "./gradient";
export { resolveColorMix } from "./colorMix";
export {
  extractNativeEffects,
  isNativeEffectsProp,
  NATIVE_EFFECTS_PROP,
  parseEffectFilters,
  parseEffectShadow,
  parseEffectShadows,
  type EffectBlendMode,
  type EffectFilter,
  type EffectOutline,
  type EffectShadow,
  type NativeEffectsDescriptor,
} from "./effectsNative";
export {
  evaluateCssMath,
  parseCssMath,
  type CssMathDependency,
  type CssMathDescriptor,
  type CssMathNode,
  type CssMathRuntime,
  type CssMathUnit,
} from "./cssMath";
export {
  cssMathEntries,
  lowerCssMathStyle,
  lowerCssMathValue,
  type CssMathLoweringContext,
  type CssMathRuntimeSnapshot,
} from "./cssMathRuntime";
export {
  isSemanticColorDescriptor,
  parseSemanticColor,
  platformSemanticColor,
  resolveSemanticColor,
  semanticColorToken,
  serializeSemanticColor,
  SEMANTIC_COLOR_TOKENS,
  type DynamicSemanticColor,
  type PlatformSemanticColor,
  type SemanticColorDescriptor,
  type SemanticColorRuntime,
  type SemanticColorToken,
  type SemanticColorValue,
} from "./semanticColors";
export {
  isWideGamutColorDescriptor,
  lowerNativeColor,
  lowerNativeColorStyle,
  wideGamutToSrgb,
  type ColorLoweringContext,
  type DynamicColorOptions,
  type NativeColorAdapter,
} from "./semanticColorsRuntime";
export {
  parseTailwindV4Candidate,
  parseTailwindV4Transform,
  parseTailwindV4Variant,
  parseWideGamutColor,
  serializeWideGamutColor,
  type TailwindV4Candidate,
  type TailwindV4TransformPrimitive,
  type TailwindV4Variant,
  type WideGamutColorDescriptor,
} from "./tailwindV4";
export {
  extractTextShadow,
  isTextShadowProp,
  type TextShadowStyle,
} from "./textShadow";
export { extractFontVariant, isFontVariantProp } from "./fontVariant";
export {
  extractGradientAngleTrack,
  extractKeyframes,
  extractReanimatedVars,
  foldAnimation,
  foldTransition,
  isAnimationProp,
  isReanimatedVar,
  isTransitionProp,
  parseAngleToDegrees,
  parseTransformString,
  REANIMATED_VAR_PREFIX,
  type GradientAngleTrack,
} from "./animations";
