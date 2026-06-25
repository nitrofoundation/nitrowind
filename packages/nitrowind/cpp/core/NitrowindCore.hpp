#pragma once

#include "RuntimeState.hpp"
#include "StyleEngine.hpp"
#include "../registry/DependencyIndex.hpp"

#include <cstdint>
#include <functional>
#include <mutex>
#include <react/renderer/core/ShadowNode.h>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace nitrowind {

/**
 * The central engine. Owns the style tables, the runtime snapshot and the node
 * registry, and orchestrates the recompute-and-commit cycle. Every Nitro
 * HybridObject is a thin façade over this singleton.
 */
class NitrowindCore {
public:
  using DependencyListener = std::function<void(uint32_t changedMask)>;
  using ResolveListener = std::function<void(const std::string& className,
                                             const std::string& componentName)>;

  /** One container's measured content-box size, reported by the layout layer. */
  struct ContainerMeasurement {
    facebook::react::Tag tag = 0;
    std::string name; // empty for an anonymous (`@container`) container
    double width = 0.0;
    double height = 0.0;
  };

  static NitrowindCore& shared();

  StyleEngine& styleEngine() { return styleEngine_; }

  // --- Runtime -------------------------------------------------------------
  RuntimeState runtimeState() const;
  void setRuntimeState(const RuntimeState& next);
  void setTheme(const std::string& themeName);
  std::string currentTheme() const;
  bool hasAdaptiveThemes() const;

  // --- Registry ------------------------------------------------------------
  void link(facebook::react::Tag tag,
            facebook::react::ShadowNodeFamily::Shared family,
            facebook::react::SurfaceId surfaceId,
            std::string className,
            std::string componentName,
            uint32_t dependencyMask,
            ResolveContext context,
            SharedFolly inlineStyle,
            std::vector<LinkedAccent> accents = {},
            facebook::react::Tag containerTag = 0);
  void unlink(facebook::react::Tag tag);
  void suspend(facebook::react::Tag tag);

  /** Explicit JS-driven commit: `tag -> style`. Returns true if committed. */
  bool updateShadowTree(const std::unordered_map<facebook::react::Tag, SharedFolly>& mutations);

  // --- Container queries ----------------------------------------------------
  /**
   * Feed a measured container size from the layout layer. `containerTag` is the
   * container node's Fabric tag; `name` is its container name (empty for anon).
   * Re-resolves every node that queries this container without a JS round-trip.
   */
  void setContainerSize(facebook::react::Tag containerTag,
                        const std::string& name,
                        double width,
                        double height);

  /**
   * Bulk variant driven by the Fabric layout observer once a tree is mounted:
   * updates every container's measured size AND each query node's nearest-
   * container association, then recomputes once if anything changed.
   */
  void syncContainers(
      const std::vector<ContainerMeasurement>& measurements,
      const std::unordered_map<facebook::react::Tag, facebook::react::Tag>&
        nodeToContainer,
      bool forceRecompute = false);

  /** Snapshot of every registered container: tag -> container name. */
  std::unordered_map<facebook::react::Tag, std::string> containerTags() const;

  /** Snapshot of every node that reads a container's size (`ContainerSize`). */
  std::unordered_set<facebook::react::Tag> containerQueryTags() const;

  // --- Recompute -----------------------------------------------------------
  void recompute(uint32_t changedMask);

  // --- Listeners -----------------------------------------------------------
  int addDependencyListener(DependencyListener listener);
  void removeDependencyListener(int id);
  void setResolveListener(ResolveListener listener);

private:
  NitrowindCore() = default;
  void notifyDependencyListeners(uint32_t changedMask);
  folly::dynamic resolveForNode(const LinkedNode& node, const ResolveContext& ctx);
  folly::dynamic resolveAccent(const LinkedAccent& accent, const ResolveContext& ctx);
  /** Inject the node's container sizes into a copy of `ctx` before resolving. */
  void applyContainerSizes(ResolveContext& ctx, const LinkedNode& node) const;

  StyleEngine styleEngine_;
  DependencyIndex index_;

  mutable std::mutex stateMutex_;
  RuntimeState state_;

  // Measured container sizes, keyed by the container's Fabric tag and (for
  // named queries) by container name. Written by the layout layer.
  mutable std::mutex containerMutex_;
  std::unordered_map<facebook::react::Tag, std::pair<double, double>> containerSizes_;
  std::unordered_map<std::string, std::pair<double, double>> namedContainerSizes_;
  // Every linked node that is itself a container: tag -> container name.
  std::unordered_map<facebook::react::Tag, std::string> containerTags_;

  std::mutex listenerMutex_;
  std::unordered_map<int, DependencyListener> dependencyListeners_;
  ResolveListener resolveListener_;
  int nextListenerId_ = 1;
};

} // namespace nitrowind
