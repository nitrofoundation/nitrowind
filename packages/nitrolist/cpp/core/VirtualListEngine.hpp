#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <unordered_map>

namespace nitrolist {

struct Range {
  int first = 0;
  int last = -1;
};

struct NativeRangeResult : Range {
  double leadingSpacer = 0.0;
  double trailingSpacer = 0.0;
};

struct CellMetrics {
  int index = 0;
  std::string key;
  double offset = 0.0;
  double length = 0.0;
  bool mounted = false;
};

struct ScrollMetrics {
  double offset = 0.0;
  double visibleLength = 0.0;
  double contentLength = 0.0;
  double velocity = 0.0;
  double timestamp = 0.0;
  double zoomScale = 1.0;
};

class VirtualListEngine {
public:
  VirtualListEngine() = default;
  VirtualListEngine(int itemCount, bool horizontal, int initialScrollIndex);

  void setItemCount(int itemCount);
  void updateCell(int index, const std::string& key, double offset, double length);
  NativeRangeResult updateScroll(const ScrollMetrics& metrics);
  NativeRangeResult recompute();

private:
  CellMetrics metricsFor(int index) const;
  double averageLength() const;
  double contentLength() const;
  NativeRangeResult resultFor(Range range) const;

  int itemCount_ = 0;
  double estimatedItemSize_ = 64.0;
  bool horizontal_ = false;
  Range range_;
  ScrollMetrics lastScrollMetrics_;
  bool hasScrollMetrics_ = false;
  double measuredLength_ = 0.0;
  int measuredCount_ = 0;
  int highestMeasuredIndex_ = 0;
  std::unordered_map<int, CellMetrics> cells_;
};

} // namespace nitrolist