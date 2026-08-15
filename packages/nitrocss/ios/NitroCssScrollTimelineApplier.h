#import <UIKit/UIKit.h>

@class RCTSurfacePresenter;

NS_ASSUME_NONNULL_BEGIN

/** iOS native driver for CSS named scroll-progress timelines. */
@interface NitroCssScrollTimelineApplier : NSObject
+ (instancetype)shared;
- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter;
- (void)setNeedsRefresh;
@end

NS_ASSUME_NONNULL_END
