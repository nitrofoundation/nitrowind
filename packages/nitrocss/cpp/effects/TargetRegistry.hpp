#pragma once

#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/**
 * Thread-safe storage shared by native view-effect registries.
 *
 * Entry must expose a writable `uint64_t generation` field. Concrete effect
 * classes retain their typed public API and descriptor shape while this helper
 * owns the repeated snapshot, listener, generation, and reload lifecycle.
 */
template <typename Entry, typename Tag = int32_t>
class TargetRegistry {
public:
  using Snapshot = std::unordered_map<Tag, Entry>;
  using Listener = std::function<void()>;

  template <typename Equal>
  void set(Tag tag, Entry next, Equal equal) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto it = entries_.find(tag);
      if (it == entries_.end()) {
        next.generation = ++generation_;
        entries_.emplace(tag, std::move(next));
        changed = true;
      } else if (!equal(it->second, next)) {
        next.generation = ++generation_;
        it->second = std::move(next);
        changed = true;
      }
    }
    if (changed)
      notify();
  }

  void clear(Tag tag) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      changed = entries_.erase(tag) > 0;
    }
    if (changed)
      notify();
  }

  bool empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_.empty();
  }

  bool contains(Tag tag) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_.find(tag) != entries_.end();
  }

  std::optional<Entry> get(Tag tag) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto it = entries_.find(tag);
    if (it == entries_.end())
      return std::nullopt;
    return it->second;
  }

  Snapshot snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_;
  }

  void setInvalidationListener(Listener listener) {
    bool populated = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener_ = std::move(listener);
      populated = !entries_.empty();
    }
    if (populated)
      notify();
  }

  void onMountTransaction() {
    if (!empty())
      notify();
  }

  void resetForNewInstance() {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      changed = !entries_.empty();
      entries_.clear();
    }
    if (changed)
      notify();
  }

private:
  void notify() {
    Listener listener;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener = listener_;
    }
    if (listener)
      listener();
  }

  mutable std::mutex mutex_;
  Snapshot entries_;
  Listener listener_;
  uint64_t generation_ = 0;
};

} // namespace nitrocss
