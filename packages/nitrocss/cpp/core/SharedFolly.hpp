#pragma once

#include <folly/dynamic.h>
#include <memory>

namespace nitrocss {

/**
 * A reference-counted `folly::dynamic`. We pass styles around as
 * `folly::dynamic` so they can be merged and committed straight into Fabric
 * props without re-marshalling through JSI on every update.
 *
 * Aliased in the Nitro spec as `nitrocss::SharedFolly` (see
 * `src/specs/types.ts`).
 */
using SharedFolly = std::shared_ptr<folly::dynamic>;

inline SharedFolly makeFolly(folly::dynamic value = folly::dynamic::object()) {
  return std::make_shared<folly::dynamic>(std::move(value));
}

/** Shallow-merge `source` into `target` (object members only). */
inline void mergeFolly(folly::dynamic& target, const folly::dynamic& source) {
  if (!source.isObject()) return;
  if (!target.isObject()) target = folly::dynamic::object();
  for (const auto& pair : source.items()) {
    target[pair.first] = pair.second;
  }
}

} // namespace nitrocss
