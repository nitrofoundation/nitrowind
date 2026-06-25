#pragma once

#include "HybridVirtualListRegistrySpec.hpp"
#include "core/VirtualListEngine.hpp"

#include <memory>
#include <string>
#include <unordered_map>

namespace margelo::nitro::nitrolist {

class HybridVirtualListRegistry : public HybridVirtualListRegistrySpec {
public:
  HybridVirtualListRegistry() : HybridObject(TAG) {}

  void registerList(const std::string& listId, const RegisterListOptions& options) override {
    lists_[listId] = ::nitrolist::VirtualListEngine(
        static_cast<int>(options.itemCount),
        options.horizontal,
        static_cast<int>(options.initialScrollIndex));
  }

  void unregisterList(const std::string& listId) override {
    lists_.erase(listId);
  }

  void updateItemCount(const std::string& listId, double itemCount) override {
    auto it = lists_.find(listId);
    if (it != lists_.end()) it->second.setItemCount(static_cast<int>(itemCount));
  }

  NativeRangeResult updateScrollMetrics(const std::string& listId, const ScrollMetrics& metrics) override {
    auto it = lists_.find(listId);
    if (it == lists_.end()) return emptyResult();
    return toSpec(it->second.updateScroll({
        metrics.offset,
        metrics.visibleLength,
        metrics.contentLength,
        metrics.velocity.value_or(0.0),
        metrics.timestamp,
        metrics.zoomScale.value_or(1.0)}));
  }

  NativeRangeResult updateCellMetrics(
      const std::string& listId,
      double index,
      const std::string& key,
      double offset,
      double length) override {
    auto it = lists_.find(listId);
    if (it == lists_.end()) return emptyResult();
    it->second.updateCell(static_cast<int>(index), key, offset, length);
    return toSpec(it->second.recompute());
  }

private:
  static NativeRangeResult emptyResult() {
    NativeRangeResult result;
    result.first = 0;
    result.last = -1;
    result.leadingSpacer = 0;
    result.trailingSpacer = 0;
    return result;
  }

  static NativeRangeResult toSpec(const ::nitrolist::NativeRangeResult& range) {
    NativeRangeResult result;
    result.first = range.first;
    result.last = range.last;
    result.leadingSpacer = range.leadingSpacer;
    result.trailingSpacer = range.trailingSpacer;
    return result;
  }

  std::unordered_map<std::string, ::nitrolist::VirtualListEngine> lists_;
};

} // namespace margelo::nitro::nitrolist