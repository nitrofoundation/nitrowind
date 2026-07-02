#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Enables React Native's `enableNativeCSSParsing` feature flag so that native
 * CSS values (linear/radial gradients via `experimental_backgroundImage`,
 * box-shadow, filters, colors) are parsed on the native side from their raw
 * string form. This is required for nitrowind gradients to render on iOS: RN
 * 0.86's JS-processed background-image path does not paint on the prebuilt core,
 * but the native string parser (`parseUnprocessedBackgroundImageString`) does.
 *
 * Must be called before the React Native runtime is initialized (i.e. before
 * `startReactNative`). Uses the OSS "Experimental" override set as its base so
 * the app keeps every other Experimental-release-level flag.
 */
void NitrowindEnableNativeCSSParsing(void);

#ifdef __cplusplus
}
#endif

NS_ASSUME_NONNULL_END
