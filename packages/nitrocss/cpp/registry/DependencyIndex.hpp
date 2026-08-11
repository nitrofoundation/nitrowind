#pragma once

#include "LinkedNode.hpp"

#include <array>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <react/renderer/core/ShadowNode.h>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace nitrocss {

/**
 * Tracks every linked node and indexes them by the dependencies they read, so
 * that when a runtime value changes we can find the affected nodes in O(k)
 * instead of scanning the whole tree.
 */
class DependencyIndex {
public:
  void add(const LinkedNode& node);
  /** Remove only the current occupant. A family guards against late recycled-cell cleanup. */
  bool remove(
      facebook::react::Tag tag,
      const facebook::react::ShadowNodeFamily::Shared& expectedFamily = nullptr);
  void setSuspended(facebook::react::Tag tag, bool suspended);
  bool contains(facebook::react::Tag tag) const;
  bool tryGet(facebook::react::Tag tag, LinkedNode& out) const;
  bool matchesFamily(
      facebook::react::Tag tag,
      const facebook::react::ShadowNodeFamily::Shared& expectedFamily) const;

  /** Update the inline style of an already-linked node. */
  void updateInlineStyle(facebook::react::Tag tag, SharedFolly style);

  /** Update the per-node pseudo state captured for native variant resolution. */
  bool updateContext(facebook::react::Tag tag, const ResolveContext& context);

  /**
   * Point a node at its nearest enclosing container (by Fabric tag). Called by
   * the layout layer once the tree is mounted. Returns true if the association
   * actually changed (so the caller knows a recompute is warranted).
   */
  bool setContainerTag(facebook::react::Tag tag, facebook::react::Tag containerTag);

  /** Point a node at its nearest enclosing group root. */
  bool setGroupTag(facebook::react::Tag tag, facebook::react::Tag groupTag);

  /** Snapshot of every active tag that reads the given dependency bit. */
  std::unordered_set<facebook::react::Tag> tagsForBit(uint32_t bitIndex) const;

  /** Snapshot of every active linked tag. */
  std::unordered_set<facebook::react::Tag> activeTags() const;

  /**
   * Copy every active node whose dependency mask intersects `changedMask`.
   * The returned nodes retain their stable ShadowNodeFamily handles, allowing
   * callers to resolve and commit them without holding the registry mutex.
   */
  std::vector<std::shared_ptr<const LinkedNode>> affectedNodes(
      uint32_t changedMask) const;

  /** Copy every active linked node under the registry mutex. */
  std::vector<std::shared_ptr<const LinkedNode>> activeNodes() const;

  /** Visit a snapshot of every node affected by `changedMask`. */
  void forEachAffected(uint32_t changedMask,
                       const std::function<void(const LinkedNode&)>& visitor) const;

  /** Visit a snapshot of every active node (e.g. for a full recompute). */
  void forEachActive(const std::function<void(const LinkedNode&)>& visitor) const;

  std::size_t size() const;

private:
  void indexByBits(facebook::react::Tag tag, uint32_t mask);
  void unindexByBits(facebook::react::Tag tag, uint32_t mask);

  mutable std::mutex mutex_;
  // Immutable records make snapshots a vector of pointer copies instead of
  // copying class strings, inline folly objects, accents and contexts.
  std::unordered_map<facebook::react::Tag, std::shared_ptr<const LinkedNode>> nodes_;
  std::array<std::unordered_set<facebook::react::Tag>, 32> byBit_;
};

} // namespace nitrocss
