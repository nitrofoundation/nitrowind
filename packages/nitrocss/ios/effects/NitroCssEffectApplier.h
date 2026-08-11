#import <UIKit/UIKit.h>

@class RCTSurfacePresenter;

NS_ASSUME_NONNULL_BEGIN

/**
 * Applies a compiler-produced `--nitrocss-native-effects` dictionary to a
 * mounted UIView. The caller owns target lookup and lifecycle; this class owns
 * only effect layers, all named `nitrocss.effect.*`, so updates are idempotent
 * and never disturb gradient/background/clip-path layers.
 */
@interface NitroCssEffectApplier : NSObject

+ (instancetype)shared;

- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter;

- (void)setNeedsFlush;

+ (void)applyDescriptor:(NSDictionary<NSString *, id> *)descriptor
                  toView:(UIView *)view;

+ (void)clearFromView:(UIView *)view;

/** Native support advertised to the diagnostics overlay. */
+ (NSDictionary<NSString *, NSNumber *> *)capabilities;

@end

NS_ASSUME_NONNULL_END
