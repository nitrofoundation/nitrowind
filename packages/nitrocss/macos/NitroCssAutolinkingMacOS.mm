#import <Foundation/Foundation.h>
#import <NitroModules/HybridObjectRegistry.hpp>

#include "HybridFollyStyle.hpp"
#include "HybridNativePlatformMacOS.hpp"
#include "HybridNitroCssConfig.hpp"
#include "HybridNitroCssDiagnostics.hpp"
#include "HybridNitroCssRuntime.hpp"
#include "HybridShadowNodeHandle.hpp"
#include "HybridShadowRegistry.hpp"

#include <memory>

@interface NitroCssMacOSAutolinking : NSObject
@end

@implementation NitroCssMacOSAutolinking

+ (void)load {
  using namespace margelo::nitro;
  using namespace margelo::nitro::nitrocss;

  HybridObjectRegistry::registerHybridObjectConstructor(
      "NitroCssConfig", [] { return std::make_shared<HybridNitroCssConfig>(); });
  HybridObjectRegistry::registerHybridObjectConstructor(
      "NitroCssRuntime", [] { return std::make_shared<HybridNitroCssRuntime>(); });
  HybridObjectRegistry::registerHybridObjectConstructor(
      "ShadowRegistry", [] { return std::make_shared<HybridShadowRegistry>(); });
  HybridObjectRegistry::registerHybridObjectConstructor(
      "ShadowNodeHandle", [] { return std::make_shared<HybridShadowNodeHandle>(); });
  HybridObjectRegistry::registerHybridObjectConstructor(
      "FollyStyle", [] { return std::make_shared<HybridFollyStyle>(); });
  HybridObjectRegistry::registerHybridObjectConstructor(
      "NitroCssDiagnostics", [] {
        return std::make_shared<HybridNitroCssDiagnostics>();
      });
  HybridObjectRegistry::registerHybridObjectConstructor(
      "NativePlatform", [] {
        return std::make_shared<HybridNativePlatformMacOS>();
      });
}

@end
