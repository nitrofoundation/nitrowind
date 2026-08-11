#pragma once

#include "CssMathEvaluator.hpp"

#include <folly/dynamic.h>

namespace nitrocss::cssmath {

/** Convert a Folly value from the compiled artifact into the portable decoder value. */
DescriptorValue fromFollyDynamic(const folly::dynamic& value);

/** One-call bridge used by the shared style engine. */
DecodeResult decodeFollyDescriptor(const folly::dynamic& value);

}  // namespace nitrocss::cssmath
