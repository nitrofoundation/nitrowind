#pragma once

#include "HybridNitroCssRuntimeSpec.hpp"
#include "conversions.hpp"
#include "core/NitroCssCore.hpp"

#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace margelo::nitro::nitrocss {

/** Concrete `NitroCssRuntime` — reactive snapshot + dependency events. */
class HybridNitroCssRuntime : public HybridNitroCssRuntimeSpec {
public:
  HybridNitroCssRuntime() : HybridObject(TAG) {}

  RuntimeSnapshot getCurrent() override {
    const auto s = ::nitrocss::NitroCssCore::shared().runtimeState();
    RuntimeSnapshot snapshot;
    snapshot.colorScheme = static_cast<ColorScheme>(s.colorScheme);
    snapshot.hasAdaptiveThemes = s.hasAdaptiveThemes;
    snapshot.currentThemeName = s.currentThemeName;
    snapshot.screen = Dimensions();
    snapshot.screen.width = s.screenWidth;
    snapshot.screen.height = s.screenHeight;
    snapshot.insets = Insets();
    snapshot.insets.top = s.insetTop;
    snapshot.insets.right = s.insetRight;
    snapshot.insets.bottom = s.insetBottom;
    snapshot.insets.left = s.insetLeft;
    snapshot.orientation = static_cast<Orientation>(s.orientation);
    snapshot.pixelRatio = s.pixelRatio;
    snapshot.fontScale = s.fontScale;
    snapshot.rtl = s.rtl;
    snapshot.rem = s.rem;
    snapshot.hairlineWidth = s.hairlineWidth;
    return snapshot;
  }

  void registerThemes(const std::vector<std::string>& themeNames) override {
    ::nitrocss::NitroCssCore::shared().styleEngine().registerThemes(themeNames);
  }

  void onCSSVariablesChanged(const std::string& /*forTheme*/) override {
    ::nitrocss::NitroCssCore::shared().recompute(
        ::nitrocss::depFlag(::nitrocss::Dependency::Theme));
  }

  std::function<void()> onResolveClassNames(
      const std::function<void(const ResolveClassNamesPayload&)>& listener) override {
    ::nitrocss::NitroCssCore::shared().setResolveListener(
        [listener](const std::string& className, const std::string& componentName) {
          ResolveClassNamesPayload payload;
          payload.className = className;
          payload.componentName = componentName;
          listener(payload);
        });
    return []() {
      ::nitrocss::NitroCssCore::shared().setResolveListener(nullptr);
    };
  }

  std::function<void()> onDependencyChange(
      const std::function<void(const std::vector<StyleDependency>&)>& listener,
      const std::optional<std::vector<StyleDependency>>& dependencies) override {
    const uint32_t filter =
        dependencies.has_value() ? ::nitrocss::maskFromDeps(*dependencies) : 0xFFFFFFFFu;

    const int id = ::nitrocss::NitroCssCore::shared().addDependencyListener(
        [listener, filter](uint32_t changed) {
          const uint32_t hit = changed & filter;
          if (hit != 0) listener(::nitrocss::depsFromMask(hit));
        });

    return [id]() {
      ::nitrocss::NitroCssCore::shared().removeDependencyListener(id);
    };
  }
};

} // namespace margelo::nitro::nitrocss
