#pragma once

#include <folly/dynamic.h>

#include <cstdint>
#include <functional>
#include <mutex>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/** Thread-safe tag → `--nitrocss-native-effects` descriptor registry. */
class EffectTargets {
public:
  using Tag = int32_t;

  struct Entry {
    folly::dynamic descriptor = nullptr;
    uint64_t generation = 0;
  };

  static EffectTargets& shared() {
    static EffectTargets instance;
    return instance;
  }

  void setDescriptor(Tag tag, const folly::dynamic& descriptor) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto it = entries_.find(tag);
      if (it == entries_.end()) {
        entries_.emplace(tag, Entry{descriptor, ++generationCounter_});
        changed = true;
      } else if (it->second.descriptor != descriptor) {
        it->second = Entry{descriptor, ++generationCounter_};
        changed = true;
      }
    }
    if (changed) notify();
  }

  void clearDescriptor(Tag tag) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      changed = entries_.erase(tag) > 0;
    }
    if (changed) notify();
  }

  bool empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_.empty();
  }

  std::unordered_map<Tag, Entry> snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_;
  }

  void setInvalidationListener(std::function<void()> listener) {
    bool shouldNotify = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener_ = std::move(listener);
      shouldNotify = !entries_.empty();
    }
    if (shouldNotify) notify();
  }

  void onMountTransaction() {
    if (!empty()) notify();
  }

  void resetForNewInstance() {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      changed = !entries_.empty();
      entries_.clear();
    }
    if (changed) notify();
  }

private:
  EffectTargets() = default;

  void notify() {
    std::function<void()> listener;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener = listener_;
    }
    if (listener) listener();
  }

  mutable std::mutex mutex_;
  std::unordered_map<Tag, Entry> entries_;
  std::function<void()> listener_;
  uint64_t generationCounter_ = 0;
};

} // namespace nitrocss
