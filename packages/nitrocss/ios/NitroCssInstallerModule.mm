#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#import <React/RCTBridge+Private.h>
#endif

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "NitroCssGradientApplier.h"
#import "NitroCssClipPathApplier.h"
#import "NitroCssBackgroundImageApplier.h"
#import "NitroCssMaskApplier.h"
#import "NitroCssInstaller.hpp"

#include <ReactCommon/RuntimeExecutor.h>
#include <react/utils/ContextContainer.h>

/**
 * Bootstraps the C++ engine on iOS. Conforms to `RCTBridgeModule` so React
 * Native hands us the bridge; from it we lift the `RuntimeExecutor` (to grab the
 * Fabric `UIManager` on the JS thread) and the `ContextContainer` (needed to
 * build `PropsParserContext` when committing). Mirrors how Reanimated installs.
 *
 * NOTE: the few private accessors below are the single device-specific wiring
 * point; they track the RN 0.85+ host surface.
 */
@interface NitroCssInstallerModule : NSObject <RCTBridgeModule>
@end

// Declared by React Native's CoreModules; pull a non-owning RuntimeExecutor.
extern facebook::react::RuntimeExecutor RCTRuntimeExecutorFromBridge(RCTBridge *bridge);

#if __has_include(<React/RCTSurfacePresenter.h>)
// `contextContainer` exists on RCTSurfacePresenter but isn't in the public
// header; declare it so we can call it (guarded by -respondsToSelector:).
@interface RCTSurfacePresenter (NitroCss)
- (std::shared_ptr<const facebook::react::ContextContainer>)contextContainer;
@end
#endif

@implementation NitroCssInstallerModule

RCT_EXPORT_MODULE(NitroCssInstaller)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (void)setBridge:(RCTBridge *)bridge {
  if (bridge == nil) return;

#if __has_include(<React/RCTSurfacePresenter.h>)
  // Gradient applier FIRST: it must attach even if the legacy runtime
  // executor below is unavailable (bridgeless interop hands us an
  // RCTBridgeProxy whose bridge internals can throw).
  RCTSurfacePresenter *presenterEarly = nil;
  @try {
    presenterEarly = bridge.surfacePresenter;
  } @catch (NSException *e) {
    NSLog(@"[nitrocss.gradient] surfacePresenter threw: %@", e.name);
  }
  if (presenterEarly != nil) {
    [[NitroCssGradientApplier shared] attachToSurfacePresenter:presenterEarly];
    [[NitroCssClipPathApplier shared] attachToSurfacePresenter:presenterEarly];
    [[NitroCssBackgroundImageApplier shared] attachToSurfacePresenter:presenterEarly];
    [[NitroCssMaskApplier shared] attachToSurfacePresenter:presenterEarly];
  }
#endif
  @try {

  // 1) RuntimeExecutor → the C++ side captures the UIManager on the JS thread.
  facebook::react::RuntimeExecutor runtimeExecutor = RCTRuntimeExecutorFromBridge(bridge);
  if (runtimeExecutor != nullptr) {
    nitrocss::NitroCssInstaller::shared().installWithRuntimeExecutor(runtimeExecutor);
  }

  // 2) ContextContainer → required to clone props during a commit.
#if __has_include(<React/RCTSurfacePresenter.h>)
  RCTSurfacePresenter *presenter = bridge.surfacePresenter;
  if ([presenter respondsToSelector:@selector(contextContainer)]) {
    auto contextContainer = [presenter contextContainer];
    if (contextContainer != nullptr) {
      nitrocss::NitroCssInstaller::shared().setContextContainer(contextContainer);
    }
  }

#endif
  } @catch (NSException *e) {
    NSLog(@"[nitrocss.gradient] legacy install path threw: %@", e.name);
  }
}

@end
