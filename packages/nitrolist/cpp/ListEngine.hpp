#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "ViewportCuller.hpp"
#include "Virtualizer.hpp"

namespace nitrolist {

using Tag = int32_t;

/**
 * The pure, thread-agnostic decision core of the UI-thread list engine — no
 * threading, no JSI, no Fabric, so it is fully unit-testable (see
 * `cpptests/virtualizer_test.cpp`). The native module wraps ONE instance per
 * mounted list and drives it entirely from the UI thread:
 *
 *   - `configure()` / `setCellTag()` — cold path, from the JS control surface
 *     (list registered, cell mounted → its Fabric tag reported).
 *   - `setViewport(offset, extent)` — hot path, called from the native scroll
 *     observer's `scrollViewDidScroll:` (iOS) / `onScrollChanged` (Android) on
 *     the UI thread, NO JS involved. Recomputes the window via the tested
 *     `Virtualizer`/`ViewportCuller` and returns the delta of cell tags that
 *     crossed the window boundary, which the platform applier then hides/shows
 *     (view-hide stage) or commits `display:none` for (ShadowTreeMutator stage).
 *
 * Delta-based (only crossed cells) mirrors RN's own VirtualView and avoids
 * touching untouched cells every frame.
 */
class ListEngine {
public:
  struct Delta {
    /** Cell tags that entered the visible+prerender window this tick. */
    std::vector<Tag> toVisible;
    /** Cell tags that left the window this tick. */
    std::vector<Tag> toHidden;
    bool changed = false;
  };

  /** (Re)configure the list. `estimatedSize`/`gap` seed the Fenwick store. */
  void configure(std::size_t count, double estimatedSize, double gap = 0.0,
                 double prerenderRatio = 0.5) {
    prerenderRatio_ = prerenderRatio;
    virtualizer_.reset(count, estimatedSize, gap);
    tags_.assign(count, 0);
    culler_ = ViewportCuller{};
    hasWindow_ = false;
  }

  std::size_t count() const { return virtualizer_.count(); }

  /** Report a mounted cell's stable Fabric tag (0 = unmounted). */
  void setCellTag(std::size_t index, Tag tag) {
    if (index < tags_.size()) tags_[index] = tag;
  }

  /** Apply a measured cell size (from native measurement); O(log n). */
  void setCellSize(std::size_t index, double size) {
    virtualizer_.setSize(index, size);
  }

  double contentSize() const { return virtualizer_.contentSize(); }
  double offsetOf(std::size_t index) const { return virtualizer_.offset(index); }

  /**
   * Hot path (UI thread): new scroll offset + viewport extent → window recompute
   * → tag delta. Returns which cells to show/hide since the last call.
   */
  Delta setViewport(double scrollOffset, double viewportExtent) {
    const Window prev = hasWindow_ ? culler_.current() : Window{};
    const Window next =
        culler_.compute(virtualizer_, scrollOffset, viewportExtent, prerenderRatio_);
    culler_.update(virtualizer_, scrollOffset, viewportExtent, prerenderRatio_);
    hasWindow_ = true;

    Delta d;
    d.changed = (next != prev);
    if (!d.changed) return d;

    // Cells now in `next` but not in `prev` → show; in `prev` but not `next` → hide.
    forEachTagInWindowNotIn(next, prev, d.toVisible);
    forEachTagInWindowNotIn(prev, next, d.toHidden);
    return d;
  }

  /** Full set of currently-visible cell tags (for a fresh applier attach). */
  std::vector<Tag> visibleTags() const {
    std::vector<Tag> out;
    if (!hasWindow_) return out;
    appendTags(culler_.current(), out);
    return out;
  }

  const Window& window() const { return culler_.current(); }

private:
  void appendTags(const Window& w, std::vector<Tag>& out) const {
    if (w.empty) return;
    for (std::size_t i = w.first; i <= w.last && i < tags_.size(); ++i) {
      if (tags_[i] != 0) out.push_back(tags_[i]);
    }
  }

  /** Tags for indices in `a` but not in `b` (with a mounted tag). */
  void forEachTagInWindowNotIn(const Window& a, const Window& b,
                               std::vector<Tag>& out) const {
    if (a.empty) return;
    for (std::size_t i = a.first; i <= a.last && i < tags_.size(); ++i) {
      if (b.contains(i)) continue;
      if (tags_[i] != 0) out.push_back(tags_[i]);
    }
  }

  Virtualizer virtualizer_;
  ViewportCuller culler_;
  std::vector<Tag> tags_;
  double prerenderRatio_ = 0.5;
  bool hasWindow_ = false;
};

} // namespace nitrolist
