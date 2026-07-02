#pragma once

#include <folly/dynamic.h>
#include <react/renderer/core/ShadowNode.h>
#include <vector>

namespace nitrowind {

/** A single node's pending prop mutation, addressed by its stable family. */
struct NodeMutation {
  facebook::react::ShadowNodeFamily::Shared family;
  facebook::react::SurfaceId surfaceId = 0;
  folly::dynamic props;
};

/**
 * Commits style mutations straight into the Fabric ShadowTree, bypassing React
 * reconciliation. For each surface we open a single `ShadowTree::commit` and
 * clone only the paths from the root down to each mutated node
 * (`ShadowNode::cloneTree`), merging the new props via the component
 * descriptor. This is the mechanism that lets theme/breakpoint changes update
 * the UI without a JS re-render.
 *
 * Targets React Native 0.86 Fabric internals.
 */
class ShadowTreeMutator {
public:
  /** Apply a batch of mutations. Returns true if at least one commit landed. */
  static bool commit(const std::vector<NodeMutation>& mutations);
};

} // namespace nitrowind
