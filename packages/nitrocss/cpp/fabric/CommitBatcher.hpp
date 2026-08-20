#pragma once

#include "ShadowTreeMutator.hpp"

#include <cstddef>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace nitrocss {

/**
 * Coalesces engine mutations produced during one runtime turn. Repeated writes
 * to the same node are merged property-by-property (last writer wins), then
 * handed to ShadowTreeMutator as one commit per surface.
 *
 * First paint can bypass the queue through commitNow(); all steady-state
 * runtime updates use enqueue().
 */
class CommitBatcher {
public:
  static CommitBatcher &shared();

  void enqueue(std::vector<NodeMutation> mutations);
  bool flush();
  bool commitNow(std::vector<NodeMutation> mutations);

  /** Drop work captured from a retiring React runtime. */
  void resetForNewInstance();

private:
  struct MutationKey {
    facebook::react::SurfaceId surfaceId = 0;
    const facebook::react::ShadowNodeFamily *family = nullptr;

    bool operator==(const MutationKey &other) const {
      return surfaceId == other.surfaceId && family == other.family;
    }
  };

  struct MutationKeyHash {
    std::size_t operator()(const MutationKey &key) const {
      const auto surface = std::hash<facebook::react::SurfaceId>{}(key.surfaceId);
      const auto family = std::hash<const void *>{}(key.family);
      return surface ^ (family + 0x9e3779b9 + (surface << 6) + (surface >> 2));
    }
  };

  CommitBatcher() = default;
  void scheduleFlush();

  std::mutex mutex_;
  std::vector<NodeMutation> pending_;
  std::unordered_map<MutationKey, std::size_t, MutationKeyHash> pendingIndex_;
  bool scheduled_ = false;
};

} // namespace nitrocss
