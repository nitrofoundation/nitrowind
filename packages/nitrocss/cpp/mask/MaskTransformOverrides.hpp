#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
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
  };

  using InvalidationListener = std::function<void()>;

  static MaskTransformOverrides& shared() {
    static MaskTransformOverrides instance;
    return instance;
  }

  void setTransform(int32_t tag, double angle, double scale) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      transforms_[tag] = {angle, scale};
    }
    invalidate();
  }

  void clearTransform(int32_t tag) {
    bool erased = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      erased = transforms_.erase(tag) > 0;
    }
    if (erased) invalidate();
  }

  std::optional<Transform> transformForTag(int32_t tag) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto it = transforms_.find(tag);
    if (it == transforms_.end()) return std::nullopt;
    return it->second;
  }

  void setInvalidationListener(InvalidationListener listener) {
    std::lock_guard<std::mutex> lock(listenerMutex_);
    listener_ = std::move(listener);
  }

  void onMountTransaction() { invalidate(); }

  void resetForNewInstance() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      transforms_.clear();
    }
    invalidate();
  }

 private:
  MaskTransformOverrides() = default;

  void invalidate() {
    InvalidationListener listener;
    {
      std::lock_guard<std::mutex> lock(listenerMutex_);
      listener = listener_;
    }
    if (listener) listener();
  }

  mutable std::mutex mutex_;
  std::unordered_map<int32_t, Transform> transforms_;
  std::mutex listenerMutex_;
  InvalidationListener listener_;
};

} // namespace nitrocss
