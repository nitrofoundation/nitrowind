#pragma once

#include <folly/dynamic.h>

namespace nitrocss {

/** Final React Native prop normalization performed after CSS resolution. */
class NativeStyleNormalizer final {
public:
  static void normalize(folly::dynamic &style);
};

} // namespace nitrocss
