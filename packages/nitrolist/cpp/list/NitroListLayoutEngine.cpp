#include "NitroListLayoutEngine.hpp"

#include <algorithm>

namespace nitrolist::layout {
namespace {

double ClampNonNegative(double value) { return std::max(0.0, value); }

double SafeExtent(double value, double fallback) {
  return std::max(24.0, value > 0 ? value : fallback);
}

}  // namespace

LayoutResult LayoutEngine::Layout(const std::vector<ItemInput>& items,
                                  const LayoutOptions& options) const {
  if (options.grid && options.crossAxisCount > 1) {
    return LayoutGrid(items, options);
  }
  return LayoutList(items, options);
}

ViewportRange LayoutEngine::RangeForViewport(const std::vector<ItemFrame>& frames,
                                             double viewportMainExtent,
                                             double scrollOffset,
                                             double overscanScreens) const {
  ViewportRange range;
  if (frames.empty() || viewportMainExtent <= 0.0) {
    return range;
  }

  const int totalCount = static_cast<int>(frames.size());
  const double overscan = std::max(0.5, overscanScreens);
  const double visibleStartOffset = std::max(0.0, scrollOffset);
  const double visibleEndOffset = scrollOffset + viewportMainExtent;
  const double renderStartOffset = std::max(0.0, scrollOffset - viewportMainExtent * overscan);
  const double renderEndOffset = scrollOffset + viewportMainExtent * (1.0 + overscan);

  auto firstIntersecting = [&](double startOffset) {
    int index = 0;
    while (index < totalCount &&
           frames[static_cast<size_t>(index)].mainStart +
                   frames[static_cast<size_t>(index)].mainExtent <= startOffset) {
      index += 1;
    }
    return index;
  };

  auto lastBefore = [&](int startIndex, double endOffset) {
    int index = startIndex;
    while (index < totalCount - 1 &&
           frames[static_cast<size_t>(index + 1)].mainStart < endOffset) {
      index += 1;
    }
    return index;
  };

  range.renderStartIndex = firstIntersecting(renderStartOffset);
  if (range.renderStartIndex >= totalCount) {
    return range;
  }
  range.renderEndIndex = lastBefore(range.renderStartIndex, renderEndOffset);

  range.visibleStartIndex = firstIntersecting(visibleStartOffset);
  if (range.visibleStartIndex >= totalCount) {
    range.visibleStartIndex = range.renderStartIndex;
    range.visibleEndIndex = range.renderEndIndex;
    return range;
  }
  range.visibleEndIndex = lastBefore(range.visibleStartIndex, visibleEndOffset);
  return range;
}

LayoutResult LayoutEngine::LayoutList(const std::vector<ItemInput>& items,
                                      const LayoutOptions& options) const {
  LayoutResult result;
  result.frames.reserve(items.size());

  const double gap = options.horizontal ? ClampNonNegative(options.columnGap)
                                        : ClampNonNegative(options.rowGap);
  const double width = std::max(1.0, options.viewportWidth - options.horizontalInset * 2.0);
  const double height = std::max(1.0, options.viewportHeight - options.verticalInset * 2.0);
  double cursor = options.horizontal ? 0.0 : ClampNonNegative(options.startInset);

  for (const auto& item : items) {
    const double extent = SafeExtent(item.extent, 24.0);
    ItemFrame frame;
    frame.index = item.index;
    frame.mainStart = cursor;
    frame.mainExtent = extent;
    if (options.horizontal) {
      frame.x = cursor;
      frame.y = options.verticalInset;
      frame.width = extent;
      frame.height = height;
    } else {
      frame.x = options.horizontalInset;
      frame.y = cursor;
      frame.width = width;
      frame.height = extent;
    }
    result.frames.push_back(frame);
    cursor += extent + gap;
  }

  const double trailingGap = items.empty() ? 0.0 : gap;
  result.totalMainExtent = std::max(0.0, cursor - trailingGap +
                                             (options.horizontal ? 0.0 : ClampNonNegative(options.endInset)));
  result.contentWidth = options.horizontal ? result.totalMainExtent : std::max(1.0, options.viewportWidth);
  result.contentHeight = options.horizontal ? std::max(1.0, options.viewportHeight) : result.totalMainExtent;
  return result;
}

LayoutResult LayoutEngine::LayoutGrid(const std::vector<ItemInput>& items,
                                      const LayoutOptions& options) const {
  LayoutResult result;
  result.frames.resize(items.size());

  const int crossAxisCount = std::max(1, options.crossAxisCount);
  const double mainGap = ClampNonNegative(options.rowGap);
  const double crossGap = ClampNonNegative(options.columnGap);
  const double availableCrossExtent = std::max(
      1.0, options.horizontal ? options.viewportHeight - options.verticalInset * 2.0
                              : options.viewportWidth - options.horizontalInset * 2.0);
  const double cellCrossExtent = std::max(
      1.0, (availableCrossExtent - crossGap * static_cast<double>(crossAxisCount - 1)) /
               static_cast<double>(crossAxisCount));

  struct LineEntry {
    ItemInput item;
    int span{1};
    double extent{24};
  };

  std::vector<LineEntry> line;
  line.reserve(crossAxisCount);
  int remainingSpan = crossAxisCount;
  double cursor = options.horizontal ? 0.0 : ClampNonNegative(options.startInset);
  double maxCrossEnd = 0.0;

  auto flushLine = [&]() {
    if (line.empty()) {
      return;
    }

    double lineExtent = 24.0;
    for (const auto& entry : line) {
      lineExtent = std::max(lineExtent, entry.extent);
    }

    int crossCursor = 0;
    for (const auto& entry : line) {
      const double crossStart = static_cast<double>(crossCursor) * (cellCrossExtent + crossGap);
      const double crossExtent = cellCrossExtent * static_cast<double>(entry.span) +
                                 crossGap * static_cast<double>(entry.span - 1);
      ItemFrame frame;
      frame.index = entry.item.index;
      frame.mainStart = cursor;
      frame.mainExtent = lineExtent;
      if (options.horizontal) {
        frame.x = cursor;
        frame.y = options.verticalInset + crossStart;
        frame.width = entry.extent;
        frame.height = crossExtent;
        maxCrossEnd = std::max(maxCrossEnd, frame.y + frame.height);
      } else {
        frame.x = options.horizontalInset + crossStart;
        frame.y = cursor;
        frame.width = crossExtent;
        frame.height = entry.extent;
        maxCrossEnd = std::max(maxCrossEnd, frame.x + frame.width);
      }
      if (entry.item.index >= 0 && static_cast<size_t>(entry.item.index) < result.frames.size()) {
        result.frames[static_cast<size_t>(entry.item.index)] = frame;
      }
      crossCursor += entry.span;
    }

    cursor += lineExtent + mainGap;
    line.clear();
    remainingSpan = crossAxisCount;
  };

  for (const auto& item : items) {
    int span = item.fullSpan ? crossAxisCount : std::max(1, std::min(item.span, crossAxisCount));
    if (span > remainingSpan && !line.empty()) {
      flushLine();
    }
    line.push_back(LineEntry{item, span, SafeExtent(item.extent, 24.0)});
    remainingSpan -= span;
    if (remainingSpan == 0) {
      flushLine();
    }
  }

  flushLine();
  const double trailingGap = items.empty() ? 0.0 : mainGap;
  result.totalMainExtent = std::max(0.0, cursor - trailingGap +
                                             (options.horizontal ? 0.0 : ClampNonNegative(options.endInset)));
  result.contentWidth = options.horizontal ? result.totalMainExtent
                                           : std::max(options.viewportWidth, maxCrossEnd);
  result.contentHeight = options.horizontal ? std::max(options.viewportHeight, maxCrossEnd)
                                            : result.totalMainExtent;
  return result;
}

}  // namespace nitrolist::layout