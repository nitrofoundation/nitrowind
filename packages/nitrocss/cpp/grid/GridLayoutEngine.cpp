#include "GridLayoutEngine.hpp"

#include <algorithm>
#include <cmath>
#include <vector>

namespace nitrocss::grid {
namespace {

int clampSpan(int span, int trackCount) {
  return std::max(1, std::min(span, std::max(1, trackCount)));
}

int clampColumns(int columns) {
  return std::max(1, columns);
}

double trackBaseSize(const Track& track, double fallback) {
  if (track.type == TrackType::Px || track.type == TrackType::Auto) {
    return std::max(0.0, track.value);
  }
  return fallback;
}

std::vector<double> resolveTracks(
    const std::vector<Track>& tracks,
    double available,
    double gap,
    double fallback) {
  if (tracks.empty()) return {};

  double fixed = 0.0;
  double fr = 0.0;
  for (const auto& track : tracks) {
    if (track.type == TrackType::Fr) {
      fr += std::max(0.0, track.value);
    } else {
      fixed += trackBaseSize(track, fallback);
    }
  }

  const double totalGap = gap * static_cast<double>(tracks.size() - 1);
  const double free = std::max(0.0, available - fixed - totalGap);
  const double frUnit = fr > 0.0 ? free / fr : 0.0;

  std::vector<double> out;
  out.reserve(tracks.size());
  for (const auto& track : tracks) {
    if (track.type == TrackType::Fr) {
      out.push_back(frUnit * std::max(0.0, track.value));
    } else {
      out.push_back(trackBaseSize(track, fallback));
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
                              int columnCount) {
  for (int row = 0;; ++row) {
    while (row >= static_cast<int>(occupied.size())) {
      occupied.push_back(std::vector<bool>(static_cast<std::size_t>(columnCount), false));
    }
    for (int column = 0; column < columnCount; ++column) {
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
  const auto columns = resolveTracks(
      input.columns, output.width, input.columnGap, output.width / columnCount);

  std::vector<std::vector<bool>> occupied;
  output.items.reserve(input.items.size());

  for (const auto& item : input.items) {
    const int columnSpan = clampSpan(item.columnSpan, columnCount);
    const int rowSpan = std::max(1, item.rowSpan);
    int row = item.rowStart > 0 ? item.rowStart - 1 : -1;
    int column = item.columnStart > 0 ? item.columnStart - 1 : -1;

    if (column >= columnCount) column = columnCount - 1;
    if (column < 0 || row < 0 || !fits(occupied, row, column, rowSpan, columnSpan, columnCount)) {
      auto placed = autoPlace(occupied, rowSpan, columnSpan, columnCount);
      row = placed.first;
      column = placed.second;
    }
    mark(occupied, row, column, rowSpan, columnSpan, columnCount);

    std::vector<Track> rows = input.rows;
    while (static_cast<int>(rows.size()) < static_cast<int>(occupied.size())) {
      rows.push_back(input.autoRow);
    }
    const auto rowTracks = resolveTracks(rows, 0.0, input.rowGap, input.autoRow.value);

    output.items.push_back({
        offsetFor(columns, column, input.columnGap),
        offsetFor(rowTracks, row, input.rowGap),
        spanSize(columns, column, columnSpan, input.columnGap),
        spanSize(rowTracks, row, rowSpan, input.rowGap),
    });
  }

  std::vector<Track> rows = input.rows;
  while (rows.size() < occupied.size()) rows.push_back(input.autoRow);
  const auto rowTracks = resolveTracks(rows, 0.0, input.rowGap, input.autoRow.value);
  output.height = tracksExtent(rowTracks, input.rowGap);
  return output;
}

} // namespace nitrocss::grid