#import "NitrowindBridge.h"

#import "LayoutObserver.hpp"
#import "NitrowindCore.hpp"

#include <string>

using namespace nitrowind;

@implementation NitrowindBridge

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
                          hairlineWidth:(double)hairlineWidth {
  RuntimeState state;
  state.colorScheme = static_cast<int>(colorScheme);
  state.hasAdaptiveThemes = true;
  state.currentThemeName = themeName != nil ? std::string(themeName.UTF8String) : "light";
  state.screenWidth = width;
  state.screenHeight = height;
  state.insetTop = insetTop;
  state.insetRight = insetRight;
  state.insetBottom = insetBottom;
  state.insetLeft = insetLeft;
  state.orientation = static_cast<int>(orientation);
  state.pixelRatio = pixelRatio;
  state.fontScale = fontScale;
  state.rtl = rtl == YES;
  state.rem = rem;
  state.hairlineWidth = hairlineWidth;

  NitrowindCore::shared().setRuntimeState(state);
}

+ (void)remeasureContainers {
  LayoutObserver::shared().remeasure();
}

+ (void)setTheme:(NSString *)themeName {
  if (themeName == nil) return;
  NitrowindCore::shared().setTheme(std::string(themeName.UTF8String));
}

+ (NSString *)currentTheme {
  return [NSString stringWithUTF8String:NitrowindCore::shared().currentTheme().c_str()];
}

@end
