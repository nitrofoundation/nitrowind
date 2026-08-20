#pragma once

#include "../core/NitroCssCore.hpp"

#include <react/renderer/core/ReactPrimitives.h>
#include <unordered_map>
#include <vector>

namespace nitrocss {

/** All CSS-relevant structure collected during one mounted-tree traversal. */
struct FabricTreeSnapshot {
  using Tag = facebook::react::Tag;

  std::vector<NitroCssCore::ContainerMeasurement> containers;
  std::unordered_map<Tag, Tag> nodeToContainer;
  std::unordered_map<Tag, Tag> nodeToGroup;
  std::unordered_map<Tag, NitroCssCore::StructuralPseudoState> structuralPseudos;
  std::vector<NitroCssCore::GridMeasurement> grids;

  void sync(NitroCssCore &core, bool forceRecompute) const;
};

} // namespace nitrocss
