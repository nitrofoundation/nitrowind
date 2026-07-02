#pragma once

#include "HybridGradientRegistrySpec.hpp"

#include "GradientType.hpp"
#include "HybridGradientViewSpec.hpp"
#include "core/NitrowindCore.hpp"

#include <folly/dynamic.h>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace margelo::nitro::nitrowind {

/**
 * Concrete `GradientRegistry` — the native-theme-commit seam for gradient
 * views (engine-v2 locked decision: theme reactivity is NATIVE, no JS
 * re-render).
 *
 * JS links each mounted gradient view's hybrid object (obtained via
 * `hybridRef`) together with the owning component's `className`. The registry
 * listens for the core's dependency notifications (Theme / ColorScheme / …);
 * whenever a change intersects the className's dependency mask it re-resolves
 * the class through the C++ style engine — whose `foldGradient` emits the
 * compact numeric descriptor under `--nitrowind-gradient` — and pushes the new
 * values straight into the hybrid view's typed setters. The Swift/Kotlin view
 * batches the writes onto the main thread and repaints; React never renders.
 *
 * Entries hold `weak_ptr`s, so an unmounted view is pruned automatically even
 * if JS never called `unlink`.
 */
class HybridGradientRegistry : public HybridGradientRegistrySpec {
public:
  HybridGradientRegistry() : HybridObject(TAG) {}

  void link(const std::shared_ptr<HybridGradientViewSpec>& view,
            const std::string& className) override {
    if (view == nullptr) return;
    {
      auto& s = store();
      std::lock_guard<std::mutex> lock(s.mutex);
      s.entries[view.get()] = Entry{view, className};
      ensureListenerLocked(s);
    }
    // Commit the current descriptor immediately: a view linked after a theme
    // change (or re-linked with a new className) must not wait for the next
    // dependency notification. Idempotent with the JSX-provided first-paint
    // props (both come from the same fold).
    applyToView(view, className);
  }

  void unlink(const std::shared_ptr<HybridGradientViewSpec>& view) override {
    if (view == nullptr) return;
    auto& s = store();
    std::lock_guard<std::mutex> lock(s.mutex);
    s.entries.erase(view.get());
  }

private:
  struct Entry {
    std::weak_ptr<HybridGradientViewSpec> view;
    std::string className;
  };

  /**
   * Registry state is static: the dependency listener registered with
   * {@link ::nitrowind::NitrowindCore} lives for the process, independent of
   * any particular HybridObject instance's lifetime.
   */
  struct Store {
    std::mutex mutex;
    std::unordered_map<const void*, Entry> entries;
    bool listenerRegistered = false;
  };

  static Store& store() {
    static Store instance;
    return instance;
  }

  static void ensureListenerLocked(Store& s) {
    if (s.listenerRegistered) return;
    s.listenerRegistered = true;
    ::nitrowind::NitrowindCore::shared().addDependencyListener(
        [](uint32_t changedMask) { onDependenciesChanged(changedMask); });
  }

  static void onDependenciesChanged(uint32_t changedMask) {
    auto& core = ::nitrowind::NitrowindCore::shared();
    std::vector<std::pair<std::shared_ptr<HybridGradientViewSpec>, std::string>>
        targets;
    {
      auto& s = store();
      std::lock_guard<std::mutex> lock(s.mutex);
      for (auto it = s.entries.begin(); it != s.entries.end();) {
        auto view = it->second.view.lock();
        if (view == nullptr) {
          // The view was unmounted without an explicit unlink — prune.
          it = s.entries.erase(it);
          continue;
        }
        // Re-read the mask each time (style tables can be hot-reloaded).
        const uint32_t mask =
            core.styleEngine().dependencyMask(it->second.className);
        if ((changedMask & mask) != 0) {
          targets.emplace_back(std::move(view), it->second.className);
        }
        ++it;
      }
    }
    for (const auto& [view, className] : targets) {
      applyToView(view, className);
    }
  }

  /**
   * Resolve `className` with the C++ engine (its `foldGradient` emits the
   * numeric descriptor) and push the descriptor fields into the view's typed
   * prop setters. The parent's `borderRadius` rides along so the self-clip
   * stays in sync with themed radii.
   */
  static void applyToView(const std::shared_ptr<HybridGradientViewSpec>& view,
                          const std::string& className) {
    auto& core = ::nitrowind::NitrowindCore::shared();
    uint32_t mask = 0;
    folly::dynamic style = core.styleEngine().resolve(
        className, core.runtimeState().toContext(), mask);
    if (!style.isObject()) return;
    auto* descriptor = style.get_ptr("--nitrowind-gradient");
    if (descriptor == nullptr || !descriptor->isObject()) return;

    const auto number = [&](const char* key, double fallback) -> double {
      auto* value = descriptor->get_ptr(key);
      return (value != nullptr && value->isNumber()) ? value->asDouble()
                                                     : fallback;
    };

    if (auto* type = descriptor->get_ptr("gradientType");
        type != nullptr && type->isString()) {
      view->setGradientType(type->getString() == "radial"
                                ? GradientType::RADIAL
                                : GradientType::LINEAR);
    }
    view->setAngle(number("angle", 180.0));
    view->setPositionX(number("positionX", 0.5));
    view->setPositionY(number("positionY", 0.5));

    if (auto* colors = descriptor->get_ptr("colors");
        colors != nullptr && colors->isArray()) {
      std::vector<std::string> out;
      out.reserve(colors->size());
      for (const auto& color : *colors) {
        if (color.isString()) out.push_back(color.getString());
      }
      view->setColors(out);
    }
    if (auto* locations = descriptor->get_ptr("locations");
        locations != nullptr && locations->isArray()) {
      std::vector<double> out;
      out.reserve(locations->size());
      for (const auto& location : *locations) {
        if (location.isNumber()) out.push_back(location.asDouble());
      }
      view->setLocations(out);
    }
    if (auto* radius = style.get_ptr("borderRadius");
        radius != nullptr && radius->isNumber()) {
      view->setBorderRadius(radius->asDouble());
    }
  }
};

} // namespace margelo::nitro::nitrowind
