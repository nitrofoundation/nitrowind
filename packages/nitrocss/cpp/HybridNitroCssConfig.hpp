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
    auto& core = ::nitrocss::NitroCssCore::shared();
    core.styleEngine().setCompiledStyles(json);
    // Dev hot-reload of the stylesheet: the tables just changed, so re-resolve
    // every already-linked node against them. At first boot no nodes are linked
    // yet, so this is a no-op; on a Fast Refresh it repaints live without a full
    // reload. Cheap when idle (walks the linked-node set only).
    core.recomputeAll();
  }
};

} // namespace margelo::nitro::nitrocss
