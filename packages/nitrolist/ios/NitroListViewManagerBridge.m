#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(NitroListViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(handle, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(contentInsetBottom, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(contentInsetTop, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(onViewabilityChange, RCTDirectEventBlock)

@end
