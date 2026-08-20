#pragma once

#include "GridTypes.hpp"

#include <folly/dynamic.h>

namespace nitrocss::grid {

/** Decode the compiler's reserved native-grid descriptor. */
GridConfig parseGridConfig(const folly::dynamic &value);

} // namespace nitrocss::grid
