#pragma once

#include "ShadowTreeMutator.hpp"

#include <mutex>
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
  CommitBatcher() = default;
  void scheduleFlush();

  std::mutex mutex_;
  std::vector<NodeMutation> pending_;
  bool scheduled_ = false;
};

} // namespace nitrocss
