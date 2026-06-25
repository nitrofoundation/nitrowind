#pragma once

#include "StyleDependency.hpp"

#include <cstdint>
#include <vector>

namespace nitrowind {

using GeneratedDependency = margelo::nitro::nitrowind::StyleDependency;

/** Pack a list of generated `StyleDependency` enum values into a bitmask. */
inline uint32_t maskFromDeps(const std::vector<GeneratedDependency>& deps) {
  uint32_t mask = 0;
  for (auto dep : deps) {
    mask |= (1u << static_cast<uint32_t>(dep));
  }
  return mask;
}

/** Expand a bitmask back into generated `StyleDependency` enum values. */
inline std::vector<GeneratedDependency> depsFromMask(uint32_t mask) {
  std::vector<GeneratedDependency> deps;
  for (uint32_t bit = 0; bit <= static_cast<uint32_t>(GeneratedDependency::CONTAINERSIZE); ++bit) {
    if ((mask & (1u << bit)) != 0) {
      deps.push_back(static_cast<GeneratedDependency>(bit));
    }
  }
  return deps;
}

} // namespace nitrowind
