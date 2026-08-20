#pragma once

#include "../effects/TargetRegistry.hpp"

#include <cstdint>
#include <functional>
#include <optional>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/** Per-view animated mask geometry, updated through the JS runtime JSI bridge. */
class MaskTransformOverrides {
 public:
  struct Transform {
    double angle{0.0};
    double scale{1.0};
    uint64_t generation{0};
  };

  using InvalidationListener = std::function<void()>;

  static MaskTransformOverrides& shared() {
    static MaskTransformOverrides instance;
    return instance;
  }

  void setTransform(int32_t tag, double angle, double scale) {
    registry_.set(tag, Transform{angle, scale, 0},
                  [](const Transform& current, const Transform& next) {
                    return current.angle == next.angle &&
                        current.scale == next.scale;
                  });
  }

  void clearTransform(int32_t tag) {
    registry_.clear(tag);
  }

  std::optional<Transform> transformForTag(int32_t tag) const {
    return registry_.get(tag);
  }

  void setInvalidationListener(InvalidationListener listener) {
    registry_.setInvalidationListener(std::move(listener));
  }

  void onMountTransaction() { registry_.onMountTransaction(); }

  void resetForNewInstance() {
    registry_.resetForNewInstance();
  }

 private:
  MaskTransformOverrides() = default;

  TargetRegistry<Transform, int32_t> registry_;
};

} // namespace nitrocss
