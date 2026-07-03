#pragma once

#include <cstddef>
#include <cstdint>
#include <mutex>
#include <unordered_map>
#include <vector>

#include "ListEngine.hpp"

namespace nitrolist {

/**
 * Process-wide registry of per-list `ListEngine`s, keyed by a JS-assigned list
 * id. The cold path (configure / setCell / setCellSize) is written from the JS
 * thread via the JSI channel; the hot path (`setViewport`) is called from the
 * native scroll observer on the UI thread. A single mutex guards both — the hot
 * path does only O(log n) math + a small delta, so contention is negligible.
 */
class ListRegistry {
public:
  static ListRegistry& shared() {
    static ListRegistry instance;
    return instance;
  }

  void configure(int32_t listId, std::size_t count, double estimatedSize,
                 double gap, double prerenderRatio) {
    std::lock_guard<std::mutex> lock(mutex_);
    engines_[listId].configure(count, estimatedSize, gap, prerenderRatio);
  }

  void setCell(int32_t listId, std::size_t index, Tag tag) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = engines_.find(listId);
    if (it != engines_.end()) it->second.setCellTag(index, tag);
  }

  void setCellSize(int32_t listId, std::size_t index, double size) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = engines_.find(listId);
    if (it != engines_.end()) it->second.setCellSize(index, size);
  }

  /** Hot path (UI thread): new offset → tag delta to hide/show. */
  ListEngine::Delta setViewport(int32_t listId, double scrollOffset,
                                double viewportExtent) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = engines_.find(listId);
    if (it == engines_.end()) return {};
    return it->second.setViewport(scrollOffset, viewportExtent);
  }

  std::vector<Tag> visibleTags(int32_t listId) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = engines_.find(listId);
    if (it == engines_.end()) return {};
    return it->second.visibleTags();
  }

  void remove(int32_t listId) {
    std::lock_guard<std::mutex> lock(mutex_);
    engines_.erase(listId);
  }

private:
  ListRegistry() = default;
  std::mutex mutex_;
  std::unordered_map<int32_t, ListEngine> engines_;
};

} // namespace nitrolist
