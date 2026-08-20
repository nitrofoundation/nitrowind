#pragma once

#include "../effects/TargetRegistry.hpp"

#include <folly/dynamic.h>

#include <cstdint>
#include <functional>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/**
 * The engine's gradient paint registry: `tag → folded gradient descriptor`.
 *
 * Architecture (engine-v2 locked decision): a gradient is NOT a child Fabric
 * component — it paints as a `CAGradientLayer` (iOS) installed on the target
 * view's OWN layer, exactly like React Native's `experimental_backgroundImage`
 * path in `RCTViewComponentView`. The C++ resolve pipeline routes the folded
 * `--nitrocss-gradient` descriptor here (it never rides on committed RN
 * props), and the platform applier consumes the snapshot on the main thread.
 *
 * Why a standing registry instead of a one-shot push: with Fabric view culling
 * or recycling, off-screen component views are destroyed and re-created without
 * React (or the engine's link/unlink) noticing. The Fabric mount hook
 * ({@link LayoutObserver}) calls {@link onMountTransaction} after every mount
 * transaction, and the platform applier re-applies from this registry, so a
 * re-created view always gets its gradient layer back.
 *
 * Thread-safety: written from the JS thread (resolve/recompute) and read from
 * the platform's main thread (the applier snapshots under the lock). The
 * invalidation listener only signals "something changed" — the platform side
 * owns coalescing onto its main thread (Lynx-style single hop).
 */
class GradientTargets {
public:
  /** Mirrors `facebook::react::Tag` without dragging in the ShadowNode headers. */
  using Tag = int32_t;

  struct Entry {
    /** The folded `--nitrocss-gradient` object (see parsers/gradient.ts). */
    folly::dynamic descriptor = nullptr;
    /** The owner's resolved uniform borderRadius (pt/dp), 0 when none/unknown. */
    double borderRadius = 0.0;
    /**
     * Monotonic change stamp. The applier records the generation it painted on
     * each view and skips repaints when it (and the view's frame) is unchanged,
     * keeping the per-mount-transaction re-apply pass cheap.
     */
    uint64_t generation = 0;
  };

  static GradientTargets& shared() {
    static GradientTargets instance;
    return instance;
  }

  /**
   * Register/refresh the descriptor for a linked node. Called by the engine's
   * resolve path whenever a resolved style carries `--nitrocss-gradient`.
   * Notifies the platform applier only when the payload actually changed.
   */
  void setDescriptor(Tag tag, const folly::dynamic& descriptor, double borderRadius) {
    registry_.set(tag, Entry{descriptor, borderRadius, 0},
                  [](const Entry& current, const Entry& next) {
                    return current.descriptor == next.descriptor &&
                        current.borderRadius == next.borderRadius;
                  });
  }

  /**
   * Drop the descriptor for a tag (the style no longer folds a gradient, or the
   * node unlinked). The applier's next flush prunes the view's layer.
   */
  void clearDescriptor(Tag tag) {
    registry_.clear(tag);
  }

  bool empty() const {
    return registry_.empty();
  }

  bool contains(Tag tag) const {
    return registry_.contains(tag);
  }

  /** Copy of every registered target, safe to consume off-thread. */
  std::unordered_map<Tag, Entry> snapshot() const {
    return registry_.snapshot();
  }

  /**
   * Install the platform's "something to (re)paint" signal. Invoked (from any
   * thread) on descriptor changes and after mount transactions; the platform
   * coalesces into a single main-thread flush. Fires immediately when targets
   * already exist so a late-attaching applier catches up.
   */
  void setInvalidationListener(std::function<void()> listener) {
    registry_.setInvalidationListener(std::move(listener));
  }

  /**
   * Fabric mount hook: a transaction may have created, resized, recycled or
   * destroyed component views — schedule a re-apply pass. O(1) when the app
   * uses no gradients.
   */
  void onMountTransaction() {
    registry_.onMountTransaction();
  }

  /**
   * Drop every registered target. Called when a new React instance (dev
   * reload) replaces the UIManager: tags from the old instance are meaningless
   * in the new tree, and keeping them would make every applier flush walk
   * permanently-stale entries. The reloaded tree re-registers fresh
   * descriptors as it resolves; notifying here lets the applier prune layers
   * painted for the previous instance.
   */
  void resetForNewInstance() {
    registry_.resetForNewInstance();
  }

private:
  GradientTargets() = default;

  TargetRegistry<Entry, Tag> registry_;
};

} // namespace nitrocss
