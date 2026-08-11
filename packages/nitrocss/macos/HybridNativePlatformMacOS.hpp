#pragma once

#include "HybridNativePlatformSpec.hpp"

#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace margelo::nitro::nitrocss {

/** AppKit runtime-state implementation used by React Native macOS. */
class HybridNativePlatformMacOS final : public HybridNativePlatformSpec {
 public:
  HybridNativePlatformMacOS();
  ~HybridNativePlatformMacOS() override;

  ThemeConfig getThemeConfig() override;
  void setTheme(const std::string& theme) override;
  void setColorScheme(ColorSchemeMode scheme) override;
  void registerExtraThemes(const std::vector<std::string>& themes) override;
  RuntimeSnapshot getCurrent() override;
  ColorScheme getColorScheme() override;
  Dimensions getDimensions() override;
  Insets getInsets() override;
  Orientation getOrientation() override;
  double getFontScale() override;
  double getPixelRatio() override;
  bool getIsRTL() override;
  void addRuntimeChangeListener(
      const std::function<void(const std::vector<StyleDependency>&,
                               const RuntimeSnapshot&,
                               RuntimeChangeSource)>& listener) override;

 private:
  RuntimeSnapshot snapshot();
  void push(const RuntimeSnapshot& value);
  void emit(const std::vector<StyleDependency>& dependencies,
            RuntimeChangeSource source);
  void emitSystemEnvironmentChange();
  void installEnvironmentObserver();

  std::mutex mutex_;
  std::vector<std::string> extraThemes_;
  std::vector<std::function<void(const std::vector<StyleDependency>&,
                                 const RuntimeSnapshot&,
                                 RuntimeChangeSource)>> listeners_;
  std::string theme_ = "light";
  ColorSchemeMode mode_ = ColorSchemeMode::SYSTEM;
  bool followsColorScheme_ = true;
  std::optional<RuntimeSnapshot> lastSnapshot_;
  void* environmentObserver_ = nullptr;
};

}  // namespace margelo::nitro::nitrocss
