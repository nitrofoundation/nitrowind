#pragma once

#include "FabricTreeSnapshot.hpp"

#include <react/renderer/core/ShadowNode.h>

namespace nitrocss {

/** Captures CSS measurement and ancestry data from one mounted Fabric tree. */
class FabricTreeWalker final {
public:
  static bool hasWork(const NitroCssCore &core);
  static FabricTreeSnapshot capture(const facebook::react::ShadowNode &root,
                                    const NitroCssCore &core);
  static void captureAndSync(const facebook::react::ShadowNode &root,
                             NitroCssCore &core,
                             bool forceRecompute);
};

} // namespace nitrocss
