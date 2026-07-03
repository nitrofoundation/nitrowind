#import <UIKit/UIKit.h>

@class RCTSurfacePresenter;

NS_ASSUME_NONNULL_BEGIN

/**
 * Main-thread applier that paints the engine's `--nitrocss-background-image`
 * `url(...)` as a named `CALayer` ("nitrocss.backgroundImage") on the TARGET
 * VIEW'S OWN LAYER, at the same z-position as gradients (-1024) so it sits below
 * content and above the solid background color. Mirrors
 * {@link NitroCssGradientApplier}: shared singleton, `BackgroundImageTargets`
 * invalidation listener, coalesced single main-thread flush, prune-then-apply,
 * re-apply after every Fabric mount transaction. There is no child Fabric
 * component.
 *
 * The image is fetched asynchronously via `NSURLSession` and the decoded
 * `UIImage` is cached in an `NSCache` keyed by URL. On completion the applier
 * re-finds the view by tag and re-checks the tag→view mapping before painting,
 * so a completion racing a recycled/reused view can never paint the wrong one.
 *
 * All CALayer writes happen inside a `CATransaction` with actions disabled.
 */
@interface NitroCssBackgroundImageApplier : NSObject

+ (instancetype)shared;

/** Wire the applier to the surface presenter (held weakly); registers the C++
 * `BackgroundImageTargets` invalidation listener (once). */
- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter;

/** Coalesced request for a main-thread flush (safe from any thread). */
- (void)setNeedsFlush;

@end

NS_ASSUME_NONNULL_END
