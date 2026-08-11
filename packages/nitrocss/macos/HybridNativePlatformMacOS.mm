#import <AppKit/AppKit.h>

#include "HybridNativePlatformMacOS.hpp"

#include "core/NitroCssCore.hpp"

#include <algorithm>

namespace margelo::nitro::nitrocss {
namespace {

bool systemIsDark() {
  NSAppearanceName match = [[NSApp effectiveAppearance]
      bestMatchFromAppearancesWithNames:@[
        NSAppearanceNameAqua, NSAppearanceNameDarkAqua
      ]];
  return [match isEqualToString:NSAppearanceNameDarkAqua];
}

NSWindow* activeWindow() {
  return NSApp.keyWindow ?: NSApp.mainWindow ?: NSApp.windows.firstObject;
}

}  // namespace

HybridNativePlatformMacOS::HybridNativePlatformMacOS()
    : HybridObject(TAG) {
  const auto initial = snapshot();
  push(initial);
}

RuntimeSnapshot HybridNativePlatformMacOS::snapshot() {
  const NSWindow* window = activeWindow();
  const NSRect bounds = window.contentView != nil
      ? window.contentView.bounds
      : NSScreen.mainScreen.frame;
  const NSEdgeInsets safe = window.contentView != nil
      ? window.contentView.safeAreaInsets
      : NSEdgeInsetsZero;
  const double scale = window.screen.backingScaleFactor > 0
      ? window.screen.backingScaleFactor
      : (NSScreen.mainScreen.backingScaleFactor > 0
          ? NSScreen.mainScreen.backingScaleFactor
          : 1.0);

  std::lock_guard lock(mutex_);
  const bool dark = mode_ == ColorSchemeMode::DARK ||
      (mode_ == ColorSchemeMode::SYSTEM && systemIsDark());
  if (followsColorScheme_) theme_ = dark ? "dark" : "light";

  return RuntimeSnapshot(
      dark ? ColorScheme::DARK : ColorScheme::LIGHT,
      true,
      theme_,
      Dimensions(bounds.size.width, bounds.size.height),
      Insets(safe.top, safe.right, safe.bottom, safe.left),
      bounds.size.width >= bounds.size.height
          ? Orientation::LANDSCAPE
          : Orientation::PORTRAIT,
      scale,
      1.0,
      NSApp.userInterfaceLayoutDirection == NSUserInterfaceLayoutDirectionRightToLeft,
      16.0,
      1.0 / scale);
}

void HybridNativePlatformMacOS::push(const RuntimeSnapshot& value) {
  ::nitrocss::RuntimeState state;
  state.colorScheme = static_cast<int>(value.colorScheme);
  state.hasAdaptiveThemes = value.hasAdaptiveThemes;
  state.currentThemeName = value.currentThemeName;
  state.screenWidth = value.screen.width;
  state.screenHeight = value.screen.height;
  state.insetTop = value.insets.top;
  state.insetRight = value.insets.right;
  state.insetBottom = value.insets.bottom;
  state.insetLeft = value.insets.left;
  state.orientation = static_cast<int>(value.orientation);
  state.pixelRatio = value.pixelRatio;
  state.fontScale = value.fontScale;
  state.rtl = value.rtl;
  state.rem = value.rem;
  state.hairlineWidth = value.hairlineWidth;
  ::nitrocss::NitroCssCore::shared().setRuntimeState(state);
}

void HybridNativePlatformMacOS::emit(
    const std::vector<StyleDependency>& dependencies,
    RuntimeChangeSource source) {
  const auto value = snapshot();
  push(value);
  std::vector<std::function<void(const std::vector<StyleDependency>&,
                                 const RuntimeSnapshot&,
                                 RuntimeChangeSource)>> listeners;
  {
    std::lock_guard lock(mutex_);
    listeners = listeners_;
  }
  for (const auto& listener : listeners) listener(dependencies, value, source);
}

ThemeConfig HybridNativePlatformMacOS::getThemeConfig() {
  const auto value = snapshot();
  std::lock_guard lock(mutex_);
  std::vector<std::string> themes{"light", "dark"};
  themes.insert(themes.end(), extraThemes_.begin(), extraThemes_.end());
  return ThemeConfig(themes, value.currentThemeName, true);
}

void HybridNativePlatformMacOS::setTheme(const std::string& theme) {
  {
    std::lock_guard lock(mutex_);
    followsColorScheme_ = false;
    theme_ = theme;
  }
  ::nitrocss::NitroCssCore::shared().setTheme(theme);
  emit({StyleDependency::THEME}, RuntimeChangeSource::USER);
}

void HybridNativePlatformMacOS::setColorScheme(ColorSchemeMode scheme) {
  std::vector<StyleDependency> dependencies{StyleDependency::COLORSCHEME};
  {
    std::lock_guard lock(mutex_);
    mode_ = scheme;
    followsColorScheme_ = true;
  }
  dependencies.push_back(StyleDependency::THEME);
  emit(dependencies, RuntimeChangeSource::USER);
}

void HybridNativePlatformMacOS::registerExtraThemes(
    const std::vector<std::string>& themes) {
  std::lock_guard lock(mutex_);
  extraThemes_ = themes;
}

RuntimeSnapshot HybridNativePlatformMacOS::getCurrent() {
  const auto value = snapshot();
  push(value);
  return value;
}

ColorScheme HybridNativePlatformMacOS::getColorScheme() {
  return snapshot().colorScheme;
}

Dimensions HybridNativePlatformMacOS::getDimensions() {
  return snapshot().screen;
}

Insets HybridNativePlatformMacOS::getInsets() {
  return snapshot().insets;
}

Orientation HybridNativePlatformMacOS::getOrientation() {
  return snapshot().orientation;
}

double HybridNativePlatformMacOS::getFontScale() {
  return snapshot().fontScale;
}

double HybridNativePlatformMacOS::getPixelRatio() {
  return snapshot().pixelRatio;
}

bool HybridNativePlatformMacOS::getIsRTL() {
  return snapshot().rtl;
}

void HybridNativePlatformMacOS::addRuntimeChangeListener(
    const std::function<void(const std::vector<StyleDependency>&,
                             const RuntimeSnapshot&,
                             RuntimeChangeSource)>& listener) {
  {
    std::lock_guard lock(mutex_);
    listeners_.push_back(listener);
  }
  const auto value = getCurrent();
  listener({}, value, RuntimeChangeSource::SYSTEM);
}

}  // namespace margelo::nitro::nitrocss
