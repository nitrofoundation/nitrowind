#pragma once

#include <algorithm>
#include <cstddef>
#include <vector>

namespace nitrolist {

/**
 * Single-span (linear) frame store backed by a Fenwick / binary-indexed tree
 * over per-item main-axis "slot" sizes (item size + trailing gap). Because
 * NitroList *owns* layout, frames are non-overlapping and monotonic, so a
 * prefix-sum tree is all we need — no interval tree (that's RN VirtualView's
 * cost because it does not own layout).
 *
 *   offset(i)     — start of item i on the main axis            O(log n)
 *   indexAt(pos)  — item whose slot contains `pos`               O(log n)
 *   setSize(i, s) — apply a measured size correction            O(log n)
 *   contentSize() — exact total main-axis extent                 O(1)
 *
 * Gaps are folded into each item's slot (size + gap); `contentSize()` removes
 * the trailing gap. Property-tested against a naive O(n) oracle in
 * `cpptests/virtualizer_test.cpp`.
 */
class Virtualizer {
public:
  /** (Re)initialise for `count` items at a uniform estimated size + gap. */
  void reset(std::size_t count, double estimatedSize, double gap = 0.0) {
    count_ = count;
    gap_ = gap;
    sizes_.assign(count, estimatedSize);
    // 1-indexed Fenwick over slot sizes (size + gap); rebuilt in O(n).
    slotTree_.assign(count + 1, 0.0);
    const double slot = estimatedSize + gap;
    for (std::size_t i = 0; i < count; ++i) treeAdd(i, slot);
    slotTotal_ = slot * static_cast<double>(count);
  }

  std::size_t count() const { return count_; }
  double size(std::size_t index) const {
    return index < count_ ? sizes_[index] : 0.0;
  }

  /** Apply a measured size for one item (single Fenwick point update). */
  void setSize(std::size_t index, double newSize) {
    if (index >= count_) return;
    const double delta = newSize - sizes_[index];
    if (delta == 0.0) return;
    sizes_[index] = newSize;
    treeAdd(index, delta);
    slotTotal_ += delta;
  }

  /** Start offset of item `index` (sum of preceding slots). */
  double offset(std::size_t index) const {
    if (index >= count_) return contentSizeInclTrailingGap();
    return prefix(index);
  }

  /** Total content extent (no trailing gap after the last item). */
  double contentSize() const {
    if (count_ == 0) return 0.0;
    return slotTotal_ - gap_;
  }

  /**
   * Largest item index whose start offset ≤ `pos`, clamped to [0, count-1].
   * Fenwick binary-lift: walk the tree accumulating slots while the running sum
   * stays ≤ `pos`.
   */
  std::size_t indexAt(double pos) const {
    if (count_ == 0) return 0;
    if (pos <= 0.0) return 0;
    std::size_t idx = 0;      // number of leading slots fully consumed
    double remaining = pos;
    for (std::size_t step = highBit_; step > 0; step >>= 1) {
      const std::size_t next = idx + step;
      if (next <= count_ && slotTree_[next] <= remaining) {
        idx = next;
        remaining -= slotTree_[next];
      }
    }
    // `idx` slots have start ≤ pos; the item at `pos` is index `idx` (0-based),
    // clamped to the last item.
    return std::min(idx, count_ - 1);
  }

private:
  void treeAdd(std::size_t i, double delta) {
    for (std::size_t x = i + 1; x <= count_; x += x & (~x + 1)) {
      slotTree_[x] += delta;
    }
    // Track the highest power-of-two ≤ count_ for the binary-lift.
    highBit_ = 1;
    while ((highBit_ << 1) <= count_) highBit_ <<= 1;
  }

  /** Sum of the first `i` slots (= offset of item i). */
  double prefix(std::size_t i) const {
    double sum = 0.0;
    for (std::size_t x = i; x > 0; x -= x & (~x + 1)) sum += slotTree_[x];
    return sum;
  }

  double contentSizeInclTrailingGap() const { return slotTotal_; }

  std::size_t count_ = 0;
  std::size_t highBit_ = 0;
  double gap_ = 0.0;
  double slotTotal_ = 0.0;  // sum of all slots (size + gap)
  std::vector<double> sizes_;
  std::vector<double> slotTree_;  // Fenwick over slots, 1-indexed
};

} // namespace nitrolist
