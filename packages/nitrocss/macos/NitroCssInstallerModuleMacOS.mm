#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBridge.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#include "NitroCssInstaller.hpp"
#import "NitroCssClipPathApplier.h"
#import "NitroCssGradientApplier.h"

#include <ReactCommon/RuntimeExecutor.h>
#include <react/utils/ContextContainer.h>

@interface NitroCssMacOSInstallerModule : NSObject <RCTBridgeModule>
@end

extern facebook::react::RuntimeExecutor RCTRuntimeExecutorFromBridge(RCTBridge *bridge);

#if __has_include(<React/RCTSurfacePresenter.h>)
@interface RCTSurfacePresenter (NitroCssMacOS)
- (std::shared_ptr<const facebook::react::ContextContainer>)contextContainer;
@end
#endif

@implementation NitroCssMacOSInstallerModule

RCT_EXPORT_MODULE(NitroCssInstaller)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (void)setBridge:(RCTBridge *)bridge {
  if (bridge == nil) return;

  @try {
    facebook::react::RuntimeExecutor runtimeExecutor =
        RCTRuntimeExecutorFromBridge(bridge);
    if (runtimeExecutor != nullptr) {
      nitrocss::NitroCssInstaller::shared().installWithRuntimeExecutor(
          runtimeExecutor);
    }

#if __has_include(<React/RCTSurfacePresenter.h>)
    RCTSurfacePresenter *presenter = bridge.surfacePresenter;
    if (presenter != nil) {
      [[NitroCssGradientApplier shared] attachToSurfacePresenter:presenter];
      [[NitroCssClipPathApplier shared] attachToSurfacePresenter:presenter];
    }
    if ([presenter respondsToSelector:@selector(contextContainer)]) {
      auto contextContainer = [presenter contextContainer];
      if (contextContainer != nullptr) {
        nitrocss::NitroCssInstaller::shared().setContextContainer(
            contextContainer);
      }
    }
#endif
  } @catch (NSException *exception) {
    NSLog(@"[nitrocss.macos] native installer failed: %@", exception.name);
  }
}

@end
