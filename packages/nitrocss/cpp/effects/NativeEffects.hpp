#pragma once

#include <cstdint>
#include <folly/dynamic.h>

namespace nitrocss {

/** Routes resolved native-only descriptors and coordinates their lifecycle. */
class NativeEffects final {
public:
  using Tag = int32_t;

  /** Extract native-only descriptors from style, updating typed registries. */
  static void extract(Tag tag, folly::dynamic &style);

  /** Clear every effect associated with a retiring or unlinked Fabric tag. */
  static void clear(Tag tag);

  /** Notify platform appliers that mounted views may have changed. */
  static void onMountTransaction();

  /** Drop all target state belonging to a retiring React instance. */
  static void resetForNewInstance();
};

} // namespace nitrocss
