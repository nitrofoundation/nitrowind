#pragma once

#include "GridTypes.hpp"

namespace nitrowind::grid {

class GridLayoutEngine {
public:
  static double equalTrackWidth(double width, int columns, double gap);
  static double spannedTrackWidth(double width, int columns, double gap, int span);
  static GridOutput layout(const GridInput& input);
};

} // namespace nitrowind::grid