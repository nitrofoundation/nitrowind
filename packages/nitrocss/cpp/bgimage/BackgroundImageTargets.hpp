#pragma once

#include "../effects/TargetRegistry.hpp"

#include <folly/dynamic.h>

#include <cstdint>
#include <functional>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/**
 * The engine's background-image registry: `tag → folded background-image
 * descriptor`.
 *
 * Architecture (effects contract v1): a `background-image: url()` is NOT a child
 * Fabric component — it paints as an image layer on the target view's OWN layer,
 * exactly like {@link GradientTargets} paints a `CAGradientLayer` on the view's
 * backing layer. The C++ resolve pipeline routes the compiler-emitted
 * `--nitrocss-background-image` descriptor here (it never rides on committed RN
 * props), and the platform applier consumes the snapshot on the main thread.
 *
 * Descriptor shape (folly::dynamic mirror of the JS object, see the contract):
 *   { url:string, size:"cover"|"contain"|"stretch"|"auto",
 *     repeat:"no-repeat"|"repeat"|"repeat-x"|"repeat-y",
 *     positionX:number, positionY:number }
 *
 * Why a standing registry instead of a one-shot push: with Fabric view culling
 * or recycling, off-screen component views are destroyed and re-created without
 * React (or the engine's link/unlink) noticing. The Fabric mount hook
 * ({@link LayoutObserver}) calls {@link onMountTransaction} after every mount
 * transaction, and the platform applier re-applies from this registry, so a
 * re-created view always gets its background image back.
 *
 * Thread-safety: written from the JS thread (resolve/recompute) and read from
 * the platform's main thread (the applier snapshots under the lock). The
 * invalidation listener only signals "something changed" — the platform side
 * owns coalescing onto its main thread (Lynx-style single hop).
 */
class BackgroundImageTargets {
public:
  /** Mirrors `facebook::react::Tag` without dragging in the ShadowNode headers. */
  using Tag = int32_t;

  struct Entry {
    /** The folded `--nitrocss-background-image` object (see parsers). */
    folly::dynamic descriptor = nullptr;
    /**
     * Monotonic change stamp. The applier records the generation it applied on
     * each view and skips re-apply when it (and the view's frame) is unchanged.
     */
    uint64_t generation = 0;
  };

  static BackgroundImageTargets& shared() {
    static BackgroundImageTargets instance;
    return instance;
  }

  /**
   * Register/refresh the descriptor for a linked node. Called by the engine's
   * resolve path whenever a resolved style carries `--nitrocss-background-image`.
   * Notifies the platform applier only when the payload actually changed.
   */
  void setDescriptor(Tag tag, const folly::dynamic& descriptor) {
    registry_.set(tag, Entry{descriptor, 0},
                  [](const Entry& current, const Entry& next) {
                    return current.descriptor == next.descriptor;
                  });
  }

  /**
   * Drop the descriptor for a tag (the style no longer folds a background image,
   * or the node unlinked). The applier's next flush removes the view's image.
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
   * Install the platform's "something to (re)apply" signal. Invoked (from any
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
   * uses no background images.
   */
  void onMountTransaction() {
    registry_.onMountTransaction();
  }

  /**
   * Drop every registered target. Called when a new React instance (dev
   * reload) replaces the UIManager: tags from the old instance are meaningless
   * in the new tree. The reloaded tree re-registers fresh descriptors as it
   * resolves; notifying here lets the applier prune images from the previous
   * instance.
   */
  void resetForNewInstance() {
    registry_.resetForNewInstance();
  }

private:
  BackgroundImageTargets() = default;

  TargetRegistry<Entry, Tag> registry_;
};

} // namespace nitrocss
