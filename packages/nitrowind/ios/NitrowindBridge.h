#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Thin Objective-C++ seam between the platform code (Swift `NativePlatform` and
 * the React Native host) and the C++ engine (`NitrowindCore` /
 * `NitrowindInstaller`). Swift talks to this class; the `.mm` translation unit
 * is the only iOS file that includes the C++ headers.
 */
@interface NitrowindBridge : NSObject

/** Push a fresh runtime snapshot into the C++ core (triggers recompute). */
+ (void)pushRuntimeStateWithColorScheme:(NSInteger)colorScheme
                              themeName:(NSString *)themeName
                                  width:(double)width
                                 height:(double)height
                               insetTop:(double)insetTop
                             insetRight:(double)insetRight
                            insetBottom:(double)insetBottom
                              insetLeft:(double)insetLeft
                            orientation:(NSInteger)orientation
                             pixelRatio:(double)pixelRatio
                              fontScale:(double)fontScale
                                    rtl:(BOOL)rtl
                                    rem:(double)rem
                          hairlineWidth:(double)hairlineWidth;

/** Force the C++ Fabric layout observer to refresh measured containers. */
+ (void)remeasureContainers;

/** Set the active theme on the engine (user-driven). */
+ (void)setTheme:(NSString *)themeName;

/** Current theme as known by the engine. */
+ (NSString *)currentTheme;

@end

NS_ASSUME_NONNULL_END
