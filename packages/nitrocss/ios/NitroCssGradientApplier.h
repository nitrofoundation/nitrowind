#import "NitroCssPlatform.h"

@class RCTSurfacePresenter;

NS_ASSUME_NONNULL_BEGIN

/**
 * Main-thread applier that paints the engine's gradients as a named
 * `CAGradientLayer` ("nitrocss.gradient") installed on the TARGET VIEW'S OWN
 * LAYER — the same architecture React Native uses for
 * `experimental_backgroundImage` in `RCTViewComponentView` (sublayer at the
 * background-color z-position, below content, corner-shaped to the view).
 * There is no child Fabric component.
 *
 * Data path: the C++ engine folds `--nitrocss-gradient` at resolve time and
 * routes `tag → descriptor` into `GradientTargets` (cpp/gradient). This class
 * registers the invalidation listener there and, on every signal (descriptor
 * change, theme/scheme recompute, or a Fabric mount transaction — the
 * culling/recycling fix), coalesces a single main-thread flush that:
 *
 *  1. prunes layers from views whose tag no longer maps to them (recycled /
 *     descriptor removed),
 *  2. looks up each registered tag's mounted view via the surface presenter's
 *     component-view registry and installs/refreshes the layer, skipping views
 *     whose painted generation + frame are unchanged.
 *
 * All CALayer writes happen inside a `CATransaction` with actions disabled so
 * prop refreshes never lerp.
 */
@interface NitroCssGradientApplier : NSObject

+ (instancetype)shared;

/**
 * Wire the applier to the app's surface presenter (held weakly). Called by
 * `NitroCssInstallerModule` when the React host hands us the bridge; also
 * registers the C++ `GradientTargets` invalidation listener (once).
 */
- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter;

/** Coalesced request for a main-thread flush (safe from any thread). */
- (void)setNeedsFlush;

@end

NS_ASSUME_NONNULL_END
