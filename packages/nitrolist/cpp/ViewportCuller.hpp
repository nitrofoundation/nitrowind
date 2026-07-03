#pragma once

#include <algorithm>
#include <cstddef>

#include "Virtualizer.hpp"

namespace nitrolist {

/** Inclusive item-index window [first, last]; `empty` when the list has 0 items. */
struct Window {
  std::size_t first = 0;
  std::size_t last = 0;
  bool empty = true;

  bool contains(std::size_t index) const {
    return !empty && index >= first && index <= last;
  }
  bool operator==(const Window& o) const {
    return empty == o.empty && (empty || (first == o.first && last == o.last));
  }
  bool operator!=(const Window& o) const { return !(*this == o); }
};

/**
 * Computes the "keep mounted & shown" window from the live scroll offset — the
 * viewport V inflated by a prerender pad on each edge (PV). Items inside PV are
 * shown; items outside are hidden by the platform applier.
 *
 * Mirrors the P/V/PV model from the virtualization research
 * (`docs/engine-v2/nitrolist.md`) but, for the M1 view-hide culling path, the
 * only decision the applier needs is in-window vs out-of-window. The culler
 * tracks the previous window so callers can act on just the delta (the items
 * that crossed the boundary), not the whole list.
 */
class ViewportCuller {
public:
  /**
   * @param prerenderRatio pad on EACH edge, in units of the viewport extent
   *        (0.5 ⇒ half a screen of prerender above and below). Velocity-scaling
   *        is a later refinement; M1 uses a static ratio.
   */
  Window compute(const Virtualizer& v, double scrollOffset, double viewportExtent,
                 double prerenderRatio) const {
    Window w;
    if (v.count() == 0) return w;  // empty
    const double pad = viewportExtent * prerenderRatio;
    const double start = scrollOffset - pad;
    const double end = scrollOffset + viewportExtent + pad;
    w.empty = false;
    w.first = v.indexAt(std::max(0.0, start));
    w.last = v.indexAt(std::max(0.0, end));
    if (w.last < w.first) w.last = w.first;
    return w;
  }

  /** Recompute and store the current window; returns it. */
  Window update(const Virtualizer& v, double scrollOffset, double viewportExtent,
                double prerenderRatio) {
    previous_ = current_;
    current_ = compute(v, scrollOffset, viewportExtent, prerenderRatio);
    return current_;
  }

  const Window& current() const { return current_; }
  const Window& previous() const { return previous_; }
  bool changed() const { return current_ != previous_; }

private:
  Window current_;
  Window previous_;
};

} // namespace nitrolist
