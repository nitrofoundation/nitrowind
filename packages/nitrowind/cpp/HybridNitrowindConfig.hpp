#pragma once

#include "HybridNitrowindConfigSpec.hpp"
#include "core/NitrowindCore.hpp"

#include <string>

namespace margelo::nitro::nitrowind {

/** Concrete `NitrowindConfig` — bootstrap + active theme. */
class HybridNitrowindConfig : public HybridNitrowindConfigSpec {
public:
  HybridNitrowindConfig() : HybridObject(TAG) {}

  bool getHasAdaptiveThemes() override {
    return ::nitrowind::NitrowindCore::shared().hasAdaptiveThemes();
  }

  std::string getCurrentTheme() override {
    return ::nitrowind::NitrowindCore::shared().currentTheme();
  }

  void setTheme(const std::string& themeName) override {
    ::nitrowind::NitrowindCore::shared().setTheme(themeName);
  }

  void setCompiledStyles(const std::string& json) override {
    ::nitrowind::NitrowindCore::shared().styleEngine().setCompiledStyles(json);
  }
};

} // namespace margelo::nitro::nitrowind
