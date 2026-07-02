#pragma once

#include "../core/SharedFolly.hpp"
#include "../core/StyleEngine.hpp"

#include <cstdint>
#include <react/renderer/core/ShadowNode.h>
#include <string>
#include <vector>

namespace nitrocss {

struct LinkedAccent {
  facebook::react::ShadowNodeFamily::Shared family;
  facebook::react::SurfaceId surfaceId = 0;
  std::string className;
  std::string propName;
  std::string sourceProperty;
  uint32_t dependencyMask = 0;
};

/**
 * Everything the engine needs to recompute and re-commit a single linked
 * component. We key by Fabric `Tag` and keep the stable `ShadowNodeFamily`
 * (ShadowNode instances are replaced on every commit; families are not).
 */
struct LinkedNode {
  facebook::react::Tag tag = 0;
  facebook::react::ShadowNodeFamily::Shared family;
  facebook::react::SurfaceId surfaceId = 0;

  std::string className;
  std::string componentName;
  uint32_t dependencyMask = 0;

  /** Per-instance context captured at link time. */
  ResolveContext context;

  /** The user's inline style, merged on top of the resolved className style. */
  SharedFolly inlineStyle;

  /** Native prop colors owned by this component (`placeholderTextColor`, etc.). */
  std::vector<LinkedAccent> accents;

  /**
   * Fabric tag of the nearest ancestor that is a container (set by the layout
   * layer). Zero when the node has no enclosing container. Container-query
   * buckets read this container's measured size at resolve time.
   */
  facebook::react::Tag containerTag = 0;

  /** True when this node itself is a queryable container. */
  bool isContainer = false;
  /** Container name for named queries (`@container/sidebar`); empty if anon. */
  std::string containerName;

  /** Fabric tag of the nearest ancestor that is a group root. */
  facebook::react::Tag groupTag = 0;
  /** True when this node itself is a group root (`group` / `group/name`). */
  bool isGroupRoot = false;
  /** Group name for named groups; empty for the default group. */
  std::string groupName;

  bool suspended = false;
};

} // namespace nitrocss
