#import <Foundation/Foundation.h>

@class RCTSurfacePresenter;

NS_ASSUME_NONNULL_BEGIN

/** Applies compiler-folded CSS masks to a Fabric view's own backing layer. */
@interface NitroCssMaskApplier : NSObject
+ (instancetype)shared;
- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter;
- (void)setNeedsFlush;
@end

NS_ASSUME_NONNULL_END
