#import <UIKit/UIKit.h>

@class RCTSurfacePresenter;

NS_ASSUME_NONNULL_BEGIN

/**
 * Main-thread applier that clips a view to the engine's `--nitrocss-clip-path`
 * descriptor by installing a `CAShapeLayer` as the TARGET VIEW'S OWN
 * `layer.mask`. Mirrors {@link NitroCssGradientApplier}: a shared singleton
 * that registers `ClipPathTargets`' invalidation listener, coalesces a single
 * main-thread flush per signal, prunes masks from views whose tag no longer
 * maps to them, and re-applies from the registry after every Fabric mount
 * transaction (so recycled/culled views regain their clip). There is no child
 * Fabric component.
 *
 * The mask path is geometry against `view.layer.bounds`, so unlike the gradient
 * applier it is NOT purely generation-skipped: the descriptor generation may be
 * unchanged while the view resizes. The last-applied bounds are recorded per
 * view and the path is recomputed whenever they differ.
 *
 * All CALayer writes happen inside a `CATransaction` with actions disabled so
 * refreshes never animate the mask.
 */
@interface NitroCssClipPathApplier : NSObject

+ (instancetype)shared;

/** Wire the applier to the surface presenter (held weakly); registers the C++
 * `ClipPathTargets` invalidation listener (once). */
- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter;

/** Coalesced request for a main-thread flush (safe from any thread). */
- (void)setNeedsFlush;

@end

NS_ASSUME_NONNULL_END
