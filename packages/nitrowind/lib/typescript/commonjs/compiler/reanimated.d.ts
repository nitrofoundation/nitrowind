/**
 * Reanimated / CSS-animation utility generation.
 *
 * Tailwind has no concept of React Native Reanimated's entering/exiting/layout
 * animations, so we synthesise an `@utility` family that bakes the animation
 * *intent* into `--reanimated-*` custom properties. The runtime reads those
 * properties back and instantiates the matching Reanimated animation builder
 * (see `src/core/reanimated.ts`) — the JS/UI-thread path Reanimated requires.
 *
 * We also ship a set of pure CSS `@keyframes` animations (`animate-wiggle`, …)
 * that Reanimated runs natively through its CSS-animation support, so they need
 * no JS driver at all.
 *
 * This mirrors the structure of Tailwind's own generated utilities so the
 * classes compose with variants (`dark:`, `md:`, `ios:`) for free.
 */
/** Entering/exiting presets (each yields an `entering-*` and `exiting-*`). */
export declare const ENTERING_EXITING_PRESETS: readonly ["BounceIn", "BounceInDown", "BounceInLeft", "BounceInRight", "BounceInUp", "BounceOut", "BounceOutDown", "BounceOutLeft", "BounceOutRight", "BounceOutUp", "FadeIn", "FadeInDown", "FadeInLeft", "FadeInRight", "FadeInUp", "FadeOut", "FadeOutDown", "FadeOutLeft", "FadeOutRight", "FadeOutUp", "FlipInEasyX", "FlipInEasyY", "FlipInXDown", "FlipInXUp", "FlipInYLeft", "FlipInYRight", "FlipOutEasyX", "FlipOutEasyY", "FlipOutXDown", "FlipOutXUp", "FlipOutYLeft", "FlipOutYRight", "LightSpeedInLeft", "LightSpeedInRight", "LightSpeedOutLeft", "LightSpeedOutRight", "PinwheelIn", "PinwheelOut", "RollInLeft", "RollInRight", "RollOutLeft", "RollOutRight", "RotateInDownLeft", "RotateInDownRight", "RotateInUpLeft", "RotateInUpRight", "RotateOutDownLeft", "RotateOutDownRight", "RotateOutUpLeft", "RotateOutUpRight", "SlideInDown", "SlideInLeft", "SlideInRight", "SlideInUp", "SlideOutDown", "SlideOutLeft", "SlideOutRight", "SlideOutUp", "StretchInX", "StretchInY", "StretchOutX", "StretchOutY", "ZoomIn", "ZoomInDown", "ZoomInEasyDown", "ZoomInEasyUp", "ZoomInLeft", "ZoomInRight", "ZoomInRotate", "ZoomInUp", "ZoomOut", "ZoomOutDown", "ZoomOutEasyDown", "ZoomOutEasyUp", "ZoomOutLeft", "ZoomOutRight", "ZoomOutRotate", "ZoomOutUp"];
/** Layout-transition presets (each yields a `layout-*`). */
export declare const LAYOUT_PRESETS: readonly ["CurvedTransition", "EntryExitTransition", "SequencedTransition", "LinearTransition", "JumpingTransition", "FadingTransition"];
/** Built-in CSS keyframe animations, run natively by Reanimated's CSS engine. */
export declare const CSS_ANIMATIONS: ReadonlyArray<{
    name: string;
    keyframes: Record<string, Record<string, string | number>>;
    animation: string;
}>;
/**
 * The full Reanimated utility stylesheet, appended to the user's input CSS
 * before Tailwind compiles (alongside `PLATFORM_CSS` and `INSETS_CSS`).
 */
export declare const REANIMATED_CSS: string;
//# sourceMappingURL=reanimated.d.ts.map