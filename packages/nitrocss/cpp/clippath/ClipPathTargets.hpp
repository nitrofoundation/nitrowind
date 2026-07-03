#pragma once

#include <folly/dynamic.h>

#include <cstdint>
#include <functional>
#include <mutex>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/**
 * The engine's clip-path registry: `tag → folded clip-path descriptor`.
 *
 * Architecture (effects contract v1): a clip-path is NOT a child Fabric
 * component — it applies as a mask on the target view's OWN layer, exactly like
 * {@link GradientTargets} paints a `CAGradientLayer` on the view's backing
 * layer. The C++ resolve pipeline routes the compiler-emitted
 * `--nitrocss-clip-path` descriptor here (it never rides on committed RN
 * props), and the platform applier consumes the snapshot on the main thread.
 *
 * Descriptor shape (folly::dynamic mirror of the JS object, see the contract):
 *   { type:"polygon", points:[[V,V],...] }
 *   { type:"circle",  cx:V, cy:V, r:V }
 *   { type:"ellipse", cx:V, cy:V, rx:V, ry:V }
 *   { type:"inset",   top:V, right:V, bottom:V, left:V, round?:number }
 *   { type:"path",    d:string }
 * where V = { v:number, u:"pct"|"px" }.
 *
 * Why a standing registry instead of a one-shot push: with Fabric view culling
 * or recycling, off-screen component views are destroyed and re-created without
 * React (or the engine's link/unlink) noticing. The Fabric mount hook
 * ({@link LayoutObserver}) calls {@link onMountTransaction} after every mount
 * transaction, and the platform applier re-applies from this registry, so a
 * re-created view always gets its mask back.
 *
 * Thread-safety: written from the JS thread (resolve/recompute) and read from
 * the platform's main thread (the applier snapshots under the lock). The
 * invalidation listener only signals "something changed" — the platform side
 * owns coalescing onto its main thread (Lynx-style single hop).
 */
class ClipPathTargets {
public:
  /** Mirrors `facebook::react::Tag` without dragging in the ShadowNode headers. */
  using Tag = int32_t;

  struct Entry {
    /** The folded `--nitrocss-clip-path` object (see parsers/clipPath.ts). */
    folly::dynamic descriptor = nullptr;
    /**
     * Monotonic change stamp. The applier records the generation it applied on
     * each view and skips re-masks when it (and the view's frame) is unchanged.
     */
    uint64_t generation = 0;
  };

  static ClipPathTargets& shared() {
    static ClipPathTargets instance;
    return instance;
  }

  /**
   * Register/refresh the descriptor for a linked node. Called by the engine's
   * resolve path whenever a resolved style carries `--nitrocss-clip-path`.
   * Notifies the platform applier only when the payload actually changed.
   */
  void setDescriptor(Tag tag, const folly::dynamic& descriptor) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto it = entries_.find(tag);
      if (it == entries_.end()) {
        Entry entry;
        entry.descriptor = descriptor;
        entry.generation = ++generationCounter_;
        entries_.emplace(tag, std::move(entry));
        changed = true;
      } else if (it->second.descriptor != descriptor) {
        it->second.descriptor = descriptor;
        it->second.generation = ++generationCounter_;
        changed = true;
      }
    }
    if (changed) notify();
  }

  /**
   * Drop the descriptor for a tag (the style no longer folds a clip-path, or the
   * node unlinked). The applier's next flush removes the view's mask.
   */
  void clearDescriptor(Tag tag) {
    bool removed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      removed = entries_.erase(tag) > 0;
    }
    if (removed) notify();
  }

  bool empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_.empty();
  }

  bool contains(Tag tag) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_.find(tag) != entries_.end();
  }

  /** Copy of every registered target, safe to consume off-thread. */
  std::unordered_map<Tag, Entry> snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return entries_;
  }

  /**
   * Install the platform's "something to (re)apply" signal. Invoked (from any
   * thread) on descriptor changes and after mount transactions; the platform
   * coalesces into a single main-thread flush. Fires immediately when targets
   * already exist so a late-attaching applier catches up.
   */
  void setInvalidationListener(std::function<void()> listener) {
    bool hasEntries = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener_ = std::move(listener);
      hasEntries = !entries_.empty();
    }
    if (hasEntries) notify();
  }

  /**
   * Fabric mount hook: a transaction may have created, resized, recycled or
   * destroyed component views — schedule a re-apply pass. O(1) when the app
   * uses no clip-paths.
   */
  void onMountTransaction() {
    if (empty()) return;
    notify();
  }

  /**
   * Drop every registered target. Called when a new React instance (dev
   * reload) replaces the UIManager: tags from the old instance are meaningless
   * in the new tree. The reloaded tree re-registers fresh descriptors as it
   * resolves; notifying here lets the applier prune masks from the previous
   * instance.
   */
  void resetForNewInstance() {
    bool hadEntries = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      hadEntries = !entries_.empty();
      entries_.clear();
    }
    if (hadEntries) notify();
  }

private:
  ClipPathTargets() = default;

  void notify() {
    std::function<void()> listener;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener = listener_;
    }
    if (listener) listener();
  }

  mutable std::mutex mutex_;
  std::unordered_map<Tag, Entry> entries_;
  std::function<void()> listener_;
  uint64_t generationCounter_ = 0;
};

} // namespace nitrocss
