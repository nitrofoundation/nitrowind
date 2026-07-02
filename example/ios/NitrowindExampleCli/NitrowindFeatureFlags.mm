#import "NitrowindFeatureFlags.h"

#import <react/featureflags/ReactNativeFeatureFlags.h>
#import <react/featureflags/ReactNativeFeatureFlagsOverridesOSSExperimental.h>

#import <memory>

namespace {

/**
 * Extends the OSS "Experimental" release-level overrides, so every
 * experimental-stage flag is already on via inheritance:
 *   cxxNativeAnimatedEnabled, enableAccessibilityOrder,
 *   enableSchedulerDelegateInvalidation, enableSwiftUIBasedFilters,
 *   preventShadowTreeCommitExhaustion, useSharedAnimatedBackend
 * (plus the Canary/Stable release flags: bridgeless, Fabric, TurboModules,
 *  IntersectionObserver, …).
 *
 * On top of that we explicitly enable the iOS-relevant new-feature flags that
 * ship at `ossReleaseStage: 'none'` (so they are NOT covered by any release
 * level). We deliberately leave Android-only, debug-only, and internal
 * perf/fix-gate flags at their defaults to avoid destabilizing the app.
 */
class NitrowindFeatureFlags
    : public facebook::react::ReactNativeFeatureFlagsOverridesOSSExperimental {
 public:
  // Required for nitrowind gradients: parse `experimental_backgroundImage`
  // (and other CSS values) from their raw string form on the native side.
  bool enableNativeCSSParsing() override {
    return true;
  }

  // VirtualView / view-culling experiments.
  bool enableViewCulling() override {
    return true;
  }
  bool enableVirtualViewContainerStateExperimental() override {
    return true;
  }
  bool hideOffscreenVirtualViewsOnIOS() override {
    return true;
  }

  // View recycling (reuse off-screen views instead of destroying/recreating).
  bool enableViewRecycling() override {
    return true;
  }
  bool enableViewRecyclingForScrollView() override {
    return true;
  }

  // Additional iOS-relevant feature APIs.
  bool viewTransitionEnabled() override {
    return true;
  }
  bool enableImperativeFocus() override {
    return true;
  }
  bool enableKeyEvents() override {
    return true;
  }
  bool enableMutationObserverByDefault() override {
    return true;
  }
};

} // namespace

void NitrowindEnableNativeCSSParsing(void) {
  facebook::react::ReactNativeFeatureFlags::dangerouslyForceOverride(
      std::make_unique<NitrowindFeatureFlags>());
}
