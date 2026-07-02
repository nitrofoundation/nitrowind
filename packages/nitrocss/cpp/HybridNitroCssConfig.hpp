#pragma once

#include "HybridNitroCssConfigSpec.hpp"
#include "core/NitroCssCore.hpp"

#include <string>

namespace margelo::nitro::nitrocss {

/** Concrete `NitroCssConfig` — bootstrap + active theme. */
class HybridNitroCssConfig : public HybridNitroCssConfigSpec {
public:
  HybridNitroCssConfig() : HybridObject(TAG) {}

  bool getHasAdaptiveThemes() override {
    return ::nitrocss::NitroCssCore::shared().hasAdaptiveThemes();
  }

  std::string getCurrentTheme() override {
    return ::nitrocss::NitroCssCore::shared().currentTheme();
  }

  void setTheme(const std::string& themeName) override {
    ::nitrocss::NitroCssCore::shared().setTheme(themeName);
  }

  void setCompiledStyles(const std::string& json) override {
    ::nitrocss::NitroCssCore::shared().styleEngine().setCompiledStyles(json);
  }
};

} // namespace margelo::nitro::nitrocss
