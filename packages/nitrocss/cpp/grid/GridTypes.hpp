#pragma once

#include <vector>

namespace nitrocss::grid {

enum class TrackType { Fr, Px, Percent, Auto };

struct Track {
  TrackType type = TrackType::Fr;
  double value = 1.0;
};

enum class Alignment { Stretch, Start, Center, End };

struct Placement {
  int columnStart = 0; // 1-based, 0 = auto
  int columnSpan = 1;
  int rowStart = 0; // 1-based, 0 = auto
  int rowSpan = 1;
  Alignment justifySelf = Alignment::Stretch;
  Alignment alignSelf = Alignment::Stretch;
};

struct ItemLayout {
  double x = 0.0;
  double y = 0.0;
  double width = 0.0;
  double height = 0.0;
};

struct GridInput {
  double width = 0.0;
  std::vector<Track> columns;
  std::vector<Track> rows;
  Track autoRow{TrackType::Px, 64.0};
  double columnGap = 0.0;
  double rowGap = 0.0;
  bool dense = false;
  Alignment justifyItems = Alignment::Stretch;
  Alignment alignItems = Alignment::Stretch;
  std::vector<Placement> items;
  /** Pre-grid Yoga measurements used to size intrinsic `auto` tracks. */
  std::vector<double> intrinsicWidths;
  std::vector<double> intrinsicHeights;
};

struct GridOutput {
  std::vector<ItemLayout> items;
  double width = 0.0;
  double height = 0.0;
};

/**
 * A grid container's parsed config, serialized once in JS (grid.tsx) and stored
 * in the engine at link time. `items` holds one placement per grid-item child,
 * in child order; the layout layer zips them positionally with the measured
 * child families. `paddingHorizontal` is subtracted from the measured container
 * width before the tracks are resolved (mirrors JS `calculateGridContentWidth`).
 */
struct GridConfig {
  std::vector<Track> columns;
  std::vector<Track> rows;
  Track autoRow{TrackType::Px, 64.0};
  double columnGap = 0.0;
  double rowGap = 0.0;
  bool dense = false;
  Alignment justifyItems = Alignment::Stretch;
  Alignment alignItems = Alignment::Stretch;
  double paddingHorizontal = 0.0;
  double paddingTop = 0.0;
  double paddingBottom = 0.0;
  std::vector<Placement> items;
};

} // namespace nitrocss::grid
