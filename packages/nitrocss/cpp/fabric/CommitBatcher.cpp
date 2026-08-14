#include "CommitBatcher.hpp"

#include "../NitroCssInstaller.hpp"

#include <algorithm>

namespace nitrocss {

CommitBatcher& CommitBatcher::shared() {
  static CommitBatcher instance;
  return instance;
}

void CommitBatcher::enqueue(std::vector<NodeMutation> mutations) {
  if (mutations.empty()) return;
  bool shouldSchedule = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& incoming : mutations) {
      if (incoming.family == nullptr || !incoming.props.isObject()) continue;
      auto existing = std::find_if(
          pending_.begin(), pending_.end(), [&](const NodeMutation& item) {
            return item.surfaceId == incoming.surfaceId &&
                item.family.get() == incoming.family.get();
          });
      if (existing == pending_.end()) {
        pending_.push_back(std::move(incoming));
        continue;
      }
      for (const auto& pair : incoming.props.items()) {
        existing->props[pair.first] = pair.second;
      }
    }
    if (!pending_.empty() && !scheduled_) {
      scheduled_ = true;
      shouldSchedule = true;
    }
  }
  if (shouldSchedule) scheduleFlush();
}

void CommitBatcher::scheduleFlush() {
  auto executor = NitroCssInstaller::shared().runtimeExecutor();
  if (executor != nullptr) {
    executor([](facebook::jsi::Runtime&) { CommitBatcher::shared().flush(); });
    return;
  }
  // Early startup can link before an executor has been captured. Preserve
  // correctness in that narrow window; subsequent updates are queued.
  flush();
}

bool CommitBatcher::flush() {
  std::vector<NodeMutation> batch;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    batch.swap(pending_);
    scheduled_ = false;
  }
  return ShadowTreeMutator::commit(batch);
}

bool CommitBatcher::commitNow(std::vector<NodeMutation> mutations) {
  // Preserve ordering with already queued steady-state writes.
  flush();
  return ShadowTreeMutator::commit(mutations);
}

} // namespace nitrocss
