#include "GridLayoutEngine.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace nitrocss::grid {
namespace {

int clampSpan(int span, int trackCount) {
  return std::max(1, std::min(span, std::max(1, trackCount)));
}

int clampColumns(int columns) {
  return std::max(1, columns);
}

double trackBaseSize(const Track& track, double fallback, double content) {
  if (track.type == TrackType::Px) {
    return std::max(0.0, track.value);
  }
  if (track.type == TrackType::MinContent ||
      track.type == TrackType::MaxContent) {
    return std::max(0.0, content);
  }
  if (track.type == TrackType::Auto) {
    return std::max(0.0, content > 0.0 ? content : track.value > 0.0
                                                ? track.value
                                                : fallback);
  }
  return fallback;
}

std::vector<double> resolveTracks(
    const std::vector<Track>& tracks,
    double available,
    double gap,
    double fallback,
    const std::vector<double>& contentSizes = {}) {
  if (tracks.empty()) return {};

  double fixed = 0.0;
  double fr = 0.0;
  for (std::size_t i = 0; i < tracks.size(); ++i) {
    const auto& track = tracks[i];
    if (track.type == TrackType::Fr) {
      fr += std::max(0.0, track.value);
    } else {
      const double content = i < contentSizes.size() ? contentSizes[i] : 0.0;
      fixed += trackBaseSize(track, fallback, content);
    }
  }

  const double totalGap = gap * static_cast<double>(tracks.size() - 1);
  const double free = std::max(0.0, available - fixed - totalGap);
  const double frUnit = fr > 0.0 ? free / fr : 0.0;

  std::vector<double> out;
  out.reserve(tracks.size());
  for (std::size_t i = 0; i < tracks.size(); ++i) {
    const auto& track = tracks[i];
    if (track.type == TrackType::Fr) {
      out.push_back(frUnit * std::max(0.0, track.value));
    } else {
      const double content = i < contentSizes.size() ? contentSizes[i] : 0.0;
      out.push_back(trackBaseSize(track, fallback, content));
    }
  }
  return out;
}

// Offset of the `start`-th track's leading edge: the sum of all preceding track
// sizes plus one gap *between* each of them and before the target track. There
// are exactly `start` gaps before track `start` (one after each of the `start`
// preceding tracks). This mirrors the JS `templateOffset` (grid.tsx), which adds
// `gap * start`. The previous implementation added the gap only `start - 1`
// times (`if (i + 1 < start)`), under-counting by one gap for every item's x/y —
// a bug that never surfaced because the engine was dead code. Note this must NOT
// be used to compute the full track extent (that has `count - 1` gaps); use
// `tracksExtent` for that.
double offsetFor(const std::vector<double>& tracks, int start, double gap) {
  double offset = 0.0;
  for (int i = 0; i < start; ++i) {
    offset += tracks[static_cast<std::size_t>(i)];
    offset += gap;
  }
  return offset;
}

// Total laid-out extent of all tracks: the sum of every track size plus one gap
// *between* consecutive tracks (`count - 1` gaps, no trailing gap). Used for the
// grid container's computed height.
double tracksExtent(const std::vector<double>& tracks, double gap) {
  if (tracks.empty()) return 0.0;
  double size = 0.0;
  for (const auto& track : tracks) size += track;
  size += gap * static_cast<double>(tracks.size() - 1);
  return size;
}

double spanSize(const std::vector<double>& tracks, int start, int span, double gap) {
  double size = 0.0;
  for (int i = 0; i < span; ++i) {
    size += tracks[static_cast<std::size_t>(start + i)];
  }
  if (span > 1) size += gap * static_cast<double>(span - 1);
  return size;
}

bool fits(const std::vector<std::vector<bool>>& occupied,
          int row,
          int column,
          int rowSpan,
          int columnSpan,
          int columnCount) {
  if (column + columnSpan > columnCount) return false;
  for (int r = row; r < row + rowSpan; ++r) {
    if (r >= static_cast<int>(occupied.size())) continue;
    for (int c = column; c < column + columnSpan; ++c) {
      if (occupied[static_cast<std::size_t>(r)][static_cast<std::size_t>(c)]) {
        return false;
      }
    }
  }
  return true;
}

void mark(std::vector<std::vector<bool>>& occupied,
          int row,
          int column,
          int rowSpan,
          int columnSpan,
          int columnCount) {
  while (static_cast<int>(occupied.size()) < row + rowSpan) {
    occupied.push_back(std::vector<bool>(static_cast<std::size_t>(columnCount), false));
  }
  for (int r = row; r < row + rowSpan; ++r) {
    for (int c = column; c < column + columnSpan; ++c) {
      occupied[static_cast<std::size_t>(r)][static_cast<std::size_t>(c)] = true;
    }
  }
}

std::pair<int, int> autoPlace(std::vector<std::vector<bool>>& occupied,
                              int rowSpan,
                              int columnSpan,
                              int columnCount,
                              int startRow = 0,
                              int startColumn = 0) {
  for (int row = startRow;; ++row) {
    while (row >= static_cast<int>(occupied.size())) {
      occupied.push_back(std::vector<bool>(static_cast<std::size_t>(columnCount), false));
    }
    const int firstColumn = row == startRow ? startColumn : 0;
    for (int column = firstColumn; column < columnCount; ++column) {
      if (fits(occupied, row, column, rowSpan, columnSpan, columnCount)) {
        return {row, column};
      }
    }
  }
}

} // namespace

double GridLayoutEngine::equalTrackWidth(double width, int columns, double gap) {
  const int columnCount = clampColumns(columns);
  const double totalGap = std::max(0.0, gap) * static_cast<double>(columnCount - 1);
  return std::max(0.0, (std::max(0.0, width) - totalGap) / columnCount);
}

double GridLayoutEngine::spannedTrackWidth(double width, int columns, double gap, int span) {
  const int columnCount = clampColumns(columns);
  const int clampedSpan = clampSpan(span, columnCount);
  const double track = equalTrackWidth(width, columnCount, gap);
  return track * clampedSpan + std::max(0.0, gap) * static_cast<double>(clampedSpan - 1);
}

GridOutput GridLayoutEngine::layout(const GridInput& input) {
  GridOutput output;
  output.width = std::max(0.0, input.width);
  if (input.columns.empty()) return output;

  const int columnCount = static_cast<int>(input.columns.size());
  struct Positioned {
    int row;
    int column;
    int rowSpan;
    int columnSpan;
  };
  std::vector<Positioned> positioned;
  positioned.reserve(input.items.size());
  std::vector<std::vector<bool>> occupied;
  int cursorRow = 0;
  int cursorColumn = 0;

  for (const auto& item : input.items) {
    const int columnSpan = clampSpan(item.columnSpan, columnCount);
    const int rowSpan = std::max(1, item.rowSpan);
    int row = item.rowStart > 0 ? item.rowStart - 1 : -1;
    int column = item.columnStart > 0 ? item.columnStart - 1 : -1;

    if (column >= columnCount) column = columnCount - 1;
    if (column < 0 || row < 0 || !fits(occupied, row, column, rowSpan, columnSpan, columnCount)) {
      auto placed = autoPlace(
          occupied, rowSpan, columnSpan, columnCount,
          input.dense ? 0 : cursorRow,
          input.dense ? 0 : cursorColumn);
      row = placed.first;
      column = placed.second;
    }
    mark(occupied, row, column, rowSpan, columnSpan, columnCount);
    positioned.push_back({row, column, rowSpan, columnSpan});
    if (!input.dense) {
      cursorRow = row;
      cursorColumn = column + columnSpan;
      if (cursorColumn >= columnCount) {
        cursorRow += 1;
        cursorColumn = 0;
      }
    }
  }

  std::vector<double> columnContent(static_cast<std::size_t>(columnCount), 0.0);
  for (std::size_t i = 0; i < positioned.size(); ++i) {
    const auto& p = positioned[i];
    if (p.columnSpan == 1) {
      columnContent[static_cast<std::size_t>(p.column)] = std::max(
          columnContent[static_cast<std::size_t>(p.column)],
          input.items[i].intrinsicWidth);
    }
  }
  const auto columns = resolveTracks(
      input.columns, output.width, input.columnGap, output.width / columnCount,
      columnContent);

  if (input.masonry) {
    std::vector<double> heights(static_cast<std::size_t>(columnCount), 0.0);
    output.items.reserve(input.items.size());
    for (std::size_t i = 0; i < input.items.size(); ++i) {
      const auto& item = input.items[i];
      const int span = clampSpan(item.columnSpan, columnCount);
      int bestColumn = 0;
      double bestY = std::numeric_limits<double>::max();
      for (int column = 0; column <= columnCount - span; ++column) {
        double y = 0.0;
        for (int c = column; c < column + span; ++c) {
          y = std::max(y, heights[static_cast<std::size_t>(c)]);
        }
        if (y < bestY) {
          bestY = y;
          bestColumn = column;
        }
      }
      const double height = std::max(
          1.0, item.intrinsicHeight > 0.0 ? item.intrinsicHeight
                                         : input.autoRow.value);
      output.items.push_back({
          offsetFor(columns, bestColumn, input.columnGap),
          bestY,
          spanSize(columns, bestColumn, span, input.columnGap),
          height,
      });
      const double next = bestY + height + input.rowGap;
      for (int c = bestColumn; c < bestColumn + span; ++c) {
        heights[static_cast<std::size_t>(c)] = next;
      }
    }
    for (double height : heights) output.height = std::max(output.height, height);
    if (output.height > 0.0) output.height -= input.rowGap;
    return output;
  }

  std::vector<Track> rows = input.rows;
  while (rows.size() < occupied.size()) rows.push_back(input.autoRow);
  std::vector<double> rowContent(rows.size(), 0.0);
  for (std::size_t i = 0; i < positioned.size(); ++i) {
    const auto& p = positioned[i];
    if (p.rowSpan == 1 && p.row >= 0 &&
        static_cast<std::size_t>(p.row) < rowContent.size()) {
      rowContent[static_cast<std::size_t>(p.row)] = std::max(
          rowContent[static_cast<std::size_t>(p.row)],
          input.items[i].intrinsicHeight);
    }
  }
  const auto rowTracks = resolveTracks(
      rows, 0.0, input.rowGap, input.autoRow.value, rowContent);

  output.items.reserve(input.items.size());
  for (const auto& p : positioned) {
    output.items.push_back({
        offsetFor(columns, p.column, input.columnGap),
        offsetFor(rowTracks, p.row, input.rowGap),
        spanSize(columns, p.column, p.columnSpan, input.columnGap),
        spanSize(rowTracks, p.row, p.rowSpan, input.rowGap),
    });
  }

  output.height = tracksExtent(rowTracks, input.rowGap);
  return output;
}

} // namespace nitrocss::grid
