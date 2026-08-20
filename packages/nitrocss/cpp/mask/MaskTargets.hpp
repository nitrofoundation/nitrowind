#pragma once

#include "../effects/TargetRegistry.hpp"

#include <folly/dynamic.h>

#include <cstdint>
#include <functional>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/** Standing Fabric tag → native mask descriptor registry. */
class MaskTargets {
public:
  using Tag = int32_t;
  struct Entry {
    folly::dynamic descriptor = nullptr;
    uint64_t generation = 0;
  };

  static MaskTargets& shared() {
    static MaskTargets instance;
    return instance;
  }

  void setDescriptor(Tag tag, const folly::dynamic& descriptor) {
    registry_.set(tag, Entry{descriptor, 0},
                  [](const Entry& current, const Entry& next) {
                    return current.descriptor == next.descriptor;
                  });
  }

  void clearDescriptor(Tag tag) {
    registry_.clear(tag);
  }

  bool empty() const {
    return registry_.empty();
  }

  std::unordered_map<Tag, Entry> snapshot() const {
    return registry_.snapshot();
  }

  void setInvalidationListener(std::function<void()> listener) {
    registry_.setInvalidationListener(std::move(listener));
  }

  void onMountTransaction() {
    registry_.onMountTransaction();
  }

  void resetForNewInstance() {
    registry_.resetForNewInstance();
  }

private:
  TargetRegistry<Entry, Tag> registry_;
};

} // namespace nitrocss
