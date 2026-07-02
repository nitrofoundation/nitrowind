#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Installs the app's React Native feature-flag overrides. Uses the OSS
 * "Experimental" override set as its base (so the app keeps every
 * Experimental-release-level flag) and enables the iOS-relevant new-feature
 * flags on top (view culling, view recycling, view transitions, …).
 *
 * Note: `enableNativeCSSParsing` is intentionally left at its default (off).
 * It was originally forced on for gradients, which now render through
 * nitrowind's own native GradientView, and box shadows flow in RN's processed
 * `BoxShadowValue[]` form — both parse on stable RN without the flag.
 *
 * Must be called before the React Native runtime is initialized (i.e. before
 * `startReactNative`).
 */
void NitrowindInstallFeatureFlags(void);

#ifdef __cplusplus
}
#endif

NS_ASSUME_NONNULL_END
