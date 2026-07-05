#pragma once

#include "RuntimeState.hpp"
#include "StyleEngine.hpp"
#include "../grid/GridTypes.hpp"
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

namespace nitrocss {

/**
 * The central engine. Owns the style tables, the runtime snapshot and the node
 * registry, and orchestrates the recompute-and-commit cycle. Every Nitro
 * HybridObject is a thin façade over this singleton.
 */
class NitroCssCore {
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

  struct GroupState {
    bool active = false;
    bool focused = false;
    bool hovered = false;
    bool disabled = false;
  };

  struct StructuralPseudoState {
    bool first = false;
    bool last = false;
  };

  /**
   * One grid container's post-layout snapshot, reported by the layout observer:
   * its measured width plus the ordered families of its grid-item children (and
   * its own family, for committing the computed container height).
   */
  struct GridMeasurement {
    facebook::react::Tag tag = 0;
    facebook::react::ShadowNodeFamily::Shared family; // the container itself
    facebook::react::SurfaceId surfaceId = 0;
    double width = 0.0;
    std::vector<facebook::react::ShadowNodeFamily::Shared> childFamilies;
  };

  static NitroCssCore& shared();

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

  /** Bind group-dependent nodes to their nearest group root from ShadowTree ancestry. */
  void syncGroups(
      const std::unordered_map<facebook::react::Tag, facebook::react::Tag>&
        nodeToGroup,
      bool forceRecompute = false);

  /** Sync direct-child first/last structural pseudo state from ShadowTree ancestry. */
  void syncStructuralPseudos(
      const std::unordered_map<facebook::react::Tag, StructuralPseudoState>& stateByTag,
      bool forceRecompute = false);

  /**
   * Native CSS grid. Driven by the layout observer once a tree is mounted: for
   * every registered grid container it runs {@link grid::GridLayoutEngine} over
   * the stored config + measured width and commits each item's absolute frame
   * (and the container's computed height) straight into the ShadowTree — no JS
   * round-trip, no re-render. Gated on measured-width change per container so the
   * follow-up commit converges in a single frame and never loops.
   */
  void syncGrids(const std::vector<GridMeasurement>& measurements,
                 bool forceRecompute = false);

  /** Update one group root's interactive state and recompute group descendants. */
  void setGroupState(facebook::react::Tag groupTag, GroupState state);

  /** Update one linked node's own interactive/structural pseudo state. */
  void setComponentState(facebook::react::Tag tag, const ResolveContext& context);

  /** Snapshot of every registered container: tag -> container name. */
  std::unordered_map<facebook::react::Tag, std::string> containerTags() const;

  /** Snapshot of every group root: tag -> group name. */
  std::unordered_map<facebook::react::Tag, std::string> groupTags() const;

  /** Snapshot of every node that reads a container's size (`ContainerSize`). */
  std::unordered_set<facebook::react::Tag> containerQueryTags() const;

  /** Snapshot of every node that reads nearest group state. */
  std::unordered_set<facebook::react::Tag> groupDependentTags() const;

  /** Snapshot of every active linked node. */
  std::unordered_set<facebook::react::Tag> linkedTags() const;

  /** Snapshot of every node with first:/last: structural pseudo variants. */
  std::unordered_set<facebook::react::Tag> structuralPseudoTags() const;

  /** Snapshot of every registered grid container's tag. */
  std::unordered_set<facebook::react::Tag> gridTags() const;

  // --- Recompute -----------------------------------------------------------
  void recompute(uint32_t changedMask);

  /**
   * Re-resolve and re-commit EVERY linked node, ignoring dependency masks.
   * Used when the compiled style tables themselves change (dev hot-reload of
   * the stylesheet): unlike {@link recompute}, this also re-resolves nodes with
   * a zero dependency mask (static utilities like `btn-gradient-border`), which
   * `recompute` skips because no runtime dependency flagged them.
   */
  void recomputeAll();

  // --- Listeners -----------------------------------------------------------
  int addDependencyListener(DependencyListener listener);
  void removeDependencyListener(int id);
  void setResolveListener(ResolveListener listener);

private:
  NitroCssCore() = default;
  void notifyDependencyListeners(uint32_t changedMask);
  folly::dynamic resolveForNode(const LinkedNode& node, const ResolveContext& ctx);
  folly::dynamic resolveAccent(const LinkedAccent& accent, const ResolveContext& ctx);
  void commitResolvedNode(const LinkedNode& node, const ResolveContext& ctx);
  /** Inject the node's container sizes into a copy of `ctx` before resolving. */
  void applyContainerSizes(ResolveContext& ctx, const LinkedNode& node) const;
  /** Inject the node's nearest group root state before resolving group variants. */
  void applyGroupState(ResolveContext& ctx, const LinkedNode& node) const;

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

  mutable std::mutex groupMutex_;
  std::unordered_map<facebook::react::Tag, std::string> groupTags_;
  std::unordered_map<facebook::react::Tag, GroupState> groupStates_;

  mutable std::mutex structuralMutex_;
  std::unordered_set<facebook::react::Tag> structuralPseudoTags_;

  // Grid containers: parsed config + last measured width (the commit gate),
  // keyed by the container's Fabric tag. Written from `link` (config) and
  // `syncGrids` (width), read by the layout observer.
  mutable std::mutex gridMutex_;
  std::unordered_map<facebook::react::Tag, grid::GridConfig> gridConfigs_;
  std::unordered_map<facebook::react::Tag, double> gridLastWidth_;

  std::mutex listenerMutex_;
  std::unordered_map<int, DependencyListener> dependencyListeners_;
  ResolveListener resolveListener_;
  int nextListenerId_ = 1;
};

} // namespace nitrocss
