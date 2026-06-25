#include "VirtualListEngine.hpp"

namespace nitrolist {

namespace {

Range clampRange(Range range, int itemCount) {
  if (itemCount <= 0) return {0, -1};
  range.first = std::max(0, std::min(itemCount - 1, range.first));
  range.last = std::max(-1, std::min(itemCount - 1, range.last));
  return range;
}

int newRangeCount(Range previous, Range next) {
  if (next.last < next.first) return 0;
  const int overlap = std::max(
      0,
      1 + std::min(next.last, previous.last) - std::max(next.first, previous.first));
  return next.last - next.first + 1 - overlap;
}

} // namespace

VirtualListEngine::VirtualListEngine(
    int itemCount,
    bool horizontal,
    int initialScrollIndex)
    : itemCount_(itemCount),
      horizontal_(horizontal),
      range_(clampRange({initialScrollIndex, initialScrollIndex}, itemCount)) {}

void VirtualListEngine::setItemCount(int itemCount) {
  itemCount_ = std::max(0, itemCount);
  range_ = clampRange(range_, itemCount_);
}

void VirtualListEngine::updateCell(
    int index,
    const std::string& key,
    double offset,
    double length) {
  if (index < 0 || index >= itemCount_) return;
  auto it = cells_.find(index);
  if (it != cells_.end()) {
    measuredLength_ += length - it->second.length;
  } else {
    measuredLength_ += length;
    measuredCount_ += 1;
  }
  highestMeasuredIndex_ = std::max(highestMeasuredIndex_, index);
  cells_[index] = {index, key, offset, length, true};
}

NativeRangeResult VirtualListEngine::updateScroll(const ScrollMetrics& metrics) {
  if (itemCount_ <= 0) return resultFor({0, -1});
  if (metrics.visibleLength <= 0.0) return resultFor(range_);

  double velocity = 0.0;
  if (hasScrollMetrics_) {
    const double dt = std::max(1.0, metrics.timestamp - lastScrollMetrics_.timestamp);
    velocity = (metrics.offset - lastScrollMetrics_.offset) / dt;
  }
  lastScrollMetrics_ = metrics;
  hasScrollMetrics_ = true;

  constexpr int maxToRenderPerBatch = 10;
  constexpr int windowSize = 5;
  const double visibleBegin = std::max(0.0, metrics.offset);
  const double visibleEnd = visibleBegin + metrics.visibleLength;
  const double overscanLength = static_cast<double>(windowSize - 1) * metrics.visibleLength;
  const double overscanBegin = std::max(0.0, visibleBegin - 0.5 * overscanLength);
  const double overscanEnd = std::max(0.0, visibleEnd + 0.5 * overscanLength);

  auto indexForOffset = [&](double offset) {
    int left = 0;
    int right = itemCount_ - 1;
    while (left <= right) {
      const int middle = left + (right - left) / 2;
      const auto frame = metricsFor(middle);
      const double start = frame.offset;
      const double end = frame.offset + frame.length;
      if ((middle == 0 && offset < start) || (middle != 0 && offset <= start)) {
        right = middle - 1;
      } else if (offset > end) {
        left = middle + 1;
      } else {
        return middle;
      }
    }
    return -1;
  };

  const int overscanFirst = std::max(0, indexForOffset(overscanBegin));
  int first = indexForOffset(visibleBegin);
  if (first < 0) first = overscanFirst;
  int overscanLast = indexForOffset(overscanEnd);
  if (overscanLast < 0) overscanLast = itemCount_ - 1;
  int last = indexForOffset(visibleEnd);
  if (last < 0) last = std::min(overscanLast, first + maxToRenderPerBatch - 1);

  const Range visible{first, last};
  int newCells = newRangeCount(range_, visible);
  enum class FillPreference { None, Before, After };
    const FillPreference fillPreference = velocity > 1.0
      ? FillPreference::After
      : velocity < -1.0 ? FillPreference::Before : FillPreference::None;

  while (true) {
    if (first <= overscanFirst && last >= overscanLast) break;
    const bool maxNewCells = newCells >= maxToRenderPerBatch;
    const bool firstWillAddMore = first <= range_.first || first > range_.last;
    const bool lastWillAddMore = last >= range_.last || last < range_.first;
    const bool firstShouldIncrement = first > overscanFirst && (!maxNewCells || !firstWillAddMore);
    const bool lastShouldIncrement = last < overscanLast && (!maxNewCells || !lastWillAddMore);
    if (maxNewCells && !firstShouldIncrement && !lastShouldIncrement) break;
    if (firstShouldIncrement && !(fillPreference == FillPreference::After && lastShouldIncrement && lastWillAddMore)) {
      if (firstWillAddMore) newCells += 1;
      first -= 1;
    }
    if (lastShouldIncrement && !(fillPreference == FillPreference::Before && firstShouldIncrement && firstWillAddMore)) {
      if (lastWillAddMore) newCells += 1;
      last += 1;
    }
  }

  range_ = clampRange({first, last}, itemCount_);
  return resultFor(range_);
}

NativeRangeResult VirtualListEngine::recompute() {
  return hasScrollMetrics_ ? updateScroll(lastScrollMetrics_) : resultFor(range_);
}

CellMetrics VirtualListEngine::metricsFor(int index) const {
  auto it = cells_.find(index);
  if (it != cells_.end()) return it->second;
  const double average = averageLength();
  double offset = average * static_cast<double>(index);
  auto highest = cells_.find(highestMeasuredIndex_);
  if (highest != cells_.end() && highestMeasuredIndex_ < index) {
    offset = highest->second.offset + highest->second.length +
        average * static_cast<double>(index - highestMeasuredIndex_ - 1);
  }
  return {index, std::to_string(index), offset, average, false};
}

double VirtualListEngine::averageLength() const {
  return measuredCount_ > 0 ? measuredLength_ / static_cast<double>(measuredCount_) : estimatedItemSize_;
}

double VirtualListEngine::contentLength() const {
  if (itemCount_ <= 0) return 0.0;
  const auto last = metricsFor(itemCount_ - 1);
  return last.offset + last.length;
}

NativeRangeResult VirtualListEngine::resultFor(Range range) const {
  NativeRangeResult result;
  result.first = range.first;
  result.last = range.last;
  if (itemCount_ <= 0 || range.last < range.first) return result;
  const auto first = metricsFor(range.first);
  const auto last = metricsFor(range.last);
  result.leadingSpacer = std::max(0.0, first.offset);
  result.trailingSpacer = std::max(0.0, contentLength() - (last.offset + last.length));
  return result;
}

} // namespace nitrolist