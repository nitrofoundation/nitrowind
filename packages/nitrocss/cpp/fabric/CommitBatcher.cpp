#include "CommitBatcher.hpp"

#include "../NitroCssInstaller.hpp"

namespace nitrocss {

CommitBatcher &CommitBatcher::shared() {
  static CommitBatcher instance;
  return instance;
}

void CommitBatcher::enqueue(std::vector<NodeMutation> mutations) {
  if (mutations.empty())
    return;
  bool shouldSchedule = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto &incoming : mutations) {
      if (incoming.family == nullptr || !incoming.props.isObject())
        continue;
      const MutationKey key{incoming.surfaceId, incoming.family.get()};
      const auto existing = pendingIndex_.find(key);
      if (existing == pendingIndex_.end()) {
        pendingIndex_.emplace(key, pending_.size());
        pending_.push_back(std::move(incoming));
        continue;
      }
      for (const auto &pair : incoming.props.items()) {
        pending_[existing->second].props[pair.first] = pair.second;
      }
    }
    if (!pending_.empty() && !scheduled_) {
      scheduled_ = true;
      shouldSchedule = true;
    }
  }
  if (shouldSchedule)
    scheduleFlush();
}

void CommitBatcher::scheduleFlush() {
  auto executor = NitroCssInstaller::shared().runtimeExecutor();
  if (executor != nullptr) {
    executor([](facebook::jsi::Runtime &) { CommitBatcher::shared().flush(); });
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
    pendingIndex_.clear();
    scheduled_ = false;
  }
  return ShadowTreeMutator::commit(batch);
}

bool CommitBatcher::commitNow(std::vector<NodeMutation> mutations) {
  // Preserve ordering with already queued steady-state writes.
  flush();
  return ShadowTreeMutator::commit(mutations);
}

void CommitBatcher::resetForNewInstance() {
  // A RuntimeExecutor callback queued on the retiring JS runtime may never run.
  // Clear both the stale families and its scheduled bit so the first update
  // from the replacement runtime can schedule a fresh flush.
  std::lock_guard<std::mutex> lock(mutex_);
  pending_.clear();
  pendingIndex_.clear();
  scheduled_ = false;
}

} // namespace nitrocss
