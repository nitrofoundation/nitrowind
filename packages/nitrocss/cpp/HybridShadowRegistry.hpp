#pragma once

#include "HybridShadowRegistrySpec.hpp"

#include "HybridFollyStyle.hpp"
#include "HybridNitroCssDiagnostics.hpp"
#include "HybridShadowNodeHandle.hpp"
#include "conversions.hpp"
#include "core/NitroCssCore.hpp"
#include "core/SharedFolly.hpp"
#include "fabric/LayoutObserver.hpp"

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

namespace margelo::nitro::nitrocss {

/**
 * Concrete `ShadowRegistry` — the JS-facing seam of the engine. Translates the
 * Nitro link/unlink/commit calls into operations on {@link NitroCssCore}.
 */
class HybridShadowRegistry : public HybridShadowRegistrySpec {
public:
  HybridShadowRegistry() : HybridObject(TAG) {}

  void link(const std::shared_ptr<HybridShadowNodeHandleSpec>& shadowNode,
            const std::string& className,
            const std::string& componentName,
            const std::vector<StyleDependency>& dependencies,
            const std::vector<Accent>& accents,
            const std::shared_ptr<HybridFollyStyleSpec>& inlineStyle,
            const std::optional<ComponentState>& state,
            const std::optional<std::unordered_map<
                std::string, std::variant<bool, std::string>>>& /*dataAttributes*/,
            const ComponentContext& context) override {
    auto handle = std::static_pointer_cast<HybridShadowNodeHandle>(shadowNode);
    if (handle == nullptr || handle->node() == nullptr) return;

    ::nitrocss::SharedFolly inline_;
    if (inlineStyle != nullptr) {
      inline_ = std::static_pointer_cast<HybridFollyStyle>(inlineStyle)->style();
    }

    ::nitrocss::ResolveContext ctx;
    ctx.themeName = context.currentThemeName;
    ctx.colorScheme = static_cast<int>(context.colorScheme);
    ctx.rtl = context.rtl;
    ctx.rem = ::nitrocss::NitroCssCore::shared().styleEngine().rem();
    if (state.has_value()) {
      ctx.isFocused = state->isFocused;
      ctx.isActive = state->isActive;
      ctx.isDisabled = state->isDisabled;
      ctx.isHovered = state->isHovered;
      ctx.isFirstChild = state->isFirstChild;
      ctx.isLastChild = state->isLastChild;
    }

    std::vector<::nitrocss::LinkedAccent> linkedAccents;
    linkedAccents.reserve(accents.size());
    for (const auto& accent : accents) {
      auto accentHandle = std::static_pointer_cast<HybridShadowNodeHandle>(accent.handle);
      if (accentHandle == nullptr || accentHandle->node() == nullptr) continue;
      std::string sourceProperty;
      if (accent.meta && accent.meta->isObject()) {
        if (auto* value = accent.meta->get_ptr("sourceProperty");
            value != nullptr && value->isString()) {
          sourceProperty = value->getString();
        }
      }
      linkedAccents.push_back({accentHandle->family(),
                               accentHandle->surfaceId(),
                               accent.className,
                               accent.accentKey,
                               sourceProperty,
                               ::nitrocss::maskFromDeps(accent.dependencies)});
    }

    auto& core = ::nitrocss::NitroCssCore::shared();
    core.link(handle->nativeTag(),
              handle->family(),
              handle->surfaceId(),
              className,
              componentName,
              ::nitrocss::maskFromDeps(dependencies),
              ctx,
              inline_,
              std::move(linkedAccents));

    if (diagnostics_ != nullptr) {
      diagnostics_->emitRegistered(static_cast<double>(handle->nativeTag()),
                                   className, 1.0);
    }
  }

  void unlink(const std::shared_ptr<HybridShadowNodeHandleSpec>& shadowNode) override {
    auto handle = std::static_pointer_cast<HybridShadowNodeHandle>(shadowNode);
    if (handle == nullptr) return;
    ::nitrocss::NitroCssCore::shared().unlink(handle->nativeTag(), handle->family());
    if (diagnostics_ != nullptr) {
      diagnostics_->emitUnregistered(static_cast<double>(handle->nativeTag()), 0.0);
    }
  }

  void suspend(const std::shared_ptr<HybridShadowNodeHandleSpec>& shadowNode) override {
    auto handle = std::static_pointer_cast<HybridShadowNodeHandle>(shadowNode);
    if (handle == nullptr) return;
    ::nitrocss::NitroCssCore::shared().suspend(handle->nativeTag());
  }

  bool updateShadowTree(
      const std::unordered_map<std::string, std::shared_ptr<HybridFollyStyleSpec>>& mutations,
      const std::unordered_map<std::string, std::shared_ptr<HybridFollyStyleSpec>>&
          /*accentMutations*/) override {
    std::unordered_map<facebook::react::Tag, ::nitrocss::SharedFolly> batch;
    batch.reserve(mutations.size());
    for (const auto& entry : mutations) {
      facebook::react::Tag tag = 0;
      try {
        tag = static_cast<facebook::react::Tag>(std::stol(entry.first));
      } catch (...) {
        continue;
      }
      if (entry.second == nullptr) continue;
      batch.emplace(tag, std::static_pointer_cast<HybridFollyStyle>(entry.second)->style());
    }
    return ::nitrocss::NitroCssCore::shared().updateShadowTree(batch);
  }

  void remeasureContainers() override {
    ::nitrocss::LayoutObserver::shared().remeasure();
  }

  bool setContainerSizeForNode(
      const std::shared_ptr<HybridShadowNodeHandleSpec>& shadowNode,
      double width,
      double height) override {
    auto handle = std::static_pointer_cast<HybridShadowNodeHandle>(shadowNode);
    if (handle == nullptr) return false;
    auto& core = ::nitrocss::NitroCssCore::shared();
    const auto containers = core.containerTags();
    auto it = containers.find(handle->nativeTag());
    if (it == containers.end()) return false;
    core.setContainerSize(handle->nativeTag(), it->second, width, height);
    return true;
  }

  bool setGroupStateForNode(
      const std::shared_ptr<HybridShadowNodeHandleSpec>& shadowNode,
      const ComponentState& state) override {
    auto handle = std::static_pointer_cast<HybridShadowNodeHandle>(shadowNode);
    if (handle == nullptr) return false;
    auto& core = ::nitrocss::NitroCssCore::shared();
    const auto groups = core.groupTags();
    if (groups.find(handle->nativeTag()) == groups.end()) return false;
    core.setGroupState(handle->nativeTag(), {state.isActive,
                                             state.isFocused,
                                             state.isHovered,
                                             state.isDisabled});
    return true;
  }

  bool setComponentStateForNode(
      const std::shared_ptr<HybridShadowNodeHandleSpec>& shadowNode,
      const ComponentState& state) override {
    auto handle = std::static_pointer_cast<HybridShadowNodeHandle>(shadowNode);
    if (handle == nullptr) return false;
    ::nitrocss::ResolveContext ctx;
    ctx.isFocused = state.isFocused;
    ctx.isActive = state.isActive;
    ctx.isDisabled = state.isDisabled;
    ctx.isHovered = state.isHovered;
    ctx.isFirstChild = state.isFirstChild;
    ctx.isLastChild = state.isLastChild;
    ::nitrocss::NitroCssCore::shared().setComponentState(handle->nativeTag(), ctx);
    return true;
  }

  void enableDiagnostics(
      const std::shared_ptr<HybridNitroCssDiagnosticsSpec>& instance) override {
    diagnostics_ = std::static_pointer_cast<HybridNitroCssDiagnostics>(instance);
  }

private:
  std::shared_ptr<HybridNitroCssDiagnostics> diagnostics_;
};

} // namespace margelo::nitro::nitrocss
