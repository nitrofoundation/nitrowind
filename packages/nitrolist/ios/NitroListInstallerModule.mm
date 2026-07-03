#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

#if __has_include(<React/RCTBridge.h>)
#import <React/RCTBridge.h>
#import <React/RCTBridge+Private.h>
#endif

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "NitroListScrollManager.h"
#import "NitroListJSI.h"
#import "ListRegistry.hpp"

#include <ReactCommon/RuntimeExecutor.h>
#include <jsi/jsi.h>

/**
 * Bootstraps the NitroList native engine on iOS. As an `RCTBridgeModule` RN
 * hands us the bridge; we (1) attach the scroll manager to the surface presenter
 * (to resolve scroll + cell views by tag) and (2) lift the `RuntimeExecutor` to
 * install the COLD-path JSI channel on the JS runtime. The HOT path (per-frame
 * scroll) never touches JS — it runs in `NitroListScrollManager`'s native
 * scroll observer. Mirrors `NitroCssInstallerModule`.
 */
@interface NitroListInstallerModule : NSObject <RCTBridgeModule>
@end

extern facebook::react::RuntimeExecutor RCTRuntimeExecutorFromBridge(RCTBridge *bridge);

namespace {
using namespace facebook;

jsi::Function makeFn(jsi::Runtime &rt, const char *name, unsigned argc,
                     jsi::HostFunctionType fn) {
  return jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, name), argc, std::move(fn));
}

} // namespace

using namespace facebook;

/** Install `global.__nitrolist*` cold-path functions (idempotent per runtime). */
void nitrolist::installHostFunctions(jsi::Runtime &rt) {
  NitroListLog(@"JSI install running");
  auto global = rt.global();

  // __nitrolistConfigure(listId, count, estimatedSize, gap, prerenderRatio)
  global.setProperty(
      rt, "__nitrolistConfigure",
      makeFn(rt, "__nitrolistConfigure", 5,
             [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
                size_t n) -> jsi::Value {
               if (n >= 4) {
                 NitroListLog([NSString
                     stringWithFormat:@"JS configure list=%d count=%.0f",
                                      (int32_t)args[0].asNumber(),
                                      args[1].asNumber()]);
                 nitrolist::ListRegistry::shared().configure(
                     (int32_t)args[0].asNumber(), (size_t)args[1].asNumber(),
                     args[2].asNumber(), args[3].asNumber(),
                     n >= 5 ? args[4].asNumber() : 0.5);
               }
               return jsi::Value::undefined();
             }));

  // __nitrolistSetCell(listId, index, tag)
  global.setProperty(
      rt, "__nitrolistSetCell",
      makeFn(rt, "__nitrolistSetCell", 3,
             [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
                size_t n) -> jsi::Value {
               if (n >= 3) {
                 nitrolist::ListRegistry::shared().setCell(
                     (int32_t)args[0].asNumber(), (size_t)args[1].asNumber(),
                     (int32_t)args[2].asNumber());
               }
               return jsi::Value::undefined();
             }));

  // __nitrolistSetCellSize(listId, index, size)
  global.setProperty(
      rt, "__nitrolistSetCellSize",
      makeFn(rt, "__nitrolistSetCellSize", 3,
             [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
                size_t n) -> jsi::Value {
               if (n >= 3) {
                 nitrolist::ListRegistry::shared().setCellSize(
                     (int32_t)args[0].asNumber(), (size_t)args[1].asNumber(),
                     args[2].asNumber());
               }
               return jsi::Value::undefined();
             }));

  // __nitrolistAttach(listId, scrollViewTag, horizontal)
  global.setProperty(
      rt, "__nitrolistAttach",
      makeFn(rt, "__nitrolistAttach", 3,
             [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
                size_t n) -> jsi::Value {
               if (n >= 2) {
                 const int32_t listId = (int32_t)args[0].asNumber();
                 const int32_t tag = (int32_t)args[1].asNumber();
                 const BOOL horizontal =
                     n >= 3 && args[2].isBool() ? args[2].getBool() : NO;
                 NitroListLog([NSString
                     stringWithFormat:@"JS attach list=%d svTag=%d", listId, tag]);
                 dispatch_async(dispatch_get_main_queue(), ^{
                   [[NitroListScrollManager shared] attachList:listId
                                                 scrollViewTag:tag
                                                    horizontal:horizontal];
                 });
               }
               return jsi::Value::undefined();
             }));

  // __nitrolistRemove(listId)
  global.setProperty(
      rt, "__nitrolistRemove",
      makeFn(rt, "__nitrolistRemove", 1,
             [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args,
                size_t n) -> jsi::Value {
               if (n >= 1) {
                 const int32_t listId = (int32_t)args[0].asNumber();
                 dispatch_async(dispatch_get_main_queue(), ^{
                   [[NitroListScrollManager shared] removeList:listId];
                 });
               }
               return jsi::Value::undefined();
             }));
}

@implementation NitroListInstallerModule

RCT_EXPORT_MODULE(NitroListInstaller)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

// NOTE: in bridgeless RN this `setBridge:` never fires (the legacy interop only
// instantiates a module when JS touches a method/constant, and even then the
// bridge is a proxy). The reliable bootstrap is the surface-presenter path in
// `NitroListScrollManager bootstrapWithSurfacePresenter:`, invoked from the
// AppDelegate. This method is kept only as a non-bridgeless fallback.
- (void)setBridge:(RCTBridge *)bridge {
  NitroListLog([NSString stringWithFormat:@"setBridge fired bridge=%d", bridge != nil]);
  if (bridge == nil) return;

#if __has_include(<React/RCTSurfacePresenter.h>)
  @try {
    RCTSurfacePresenter *presenter = bridge.surfacePresenter;
    if (presenter != nil) {
      [[NitroListScrollManager shared] attachToSurfacePresenter:presenter];
    }
  } @catch (NSException *e) {
    NSLog(@"[nitrolist] surfacePresenter threw: %@", e.name);
  }
#endif

  @try {
    facebook::react::RuntimeExecutor runtimeExecutor =
        RCTRuntimeExecutorFromBridge(bridge);
    if (runtimeExecutor != nullptr) {
      runtimeExecutor([](facebook::jsi::Runtime &rt) {
        nitrolist::installHostFunctions(rt);
      });
    }
  } @catch (NSException *e) {
    NSLog(@"[nitrolist] JSI install threw: %@", e.name);
  }
}

@end
