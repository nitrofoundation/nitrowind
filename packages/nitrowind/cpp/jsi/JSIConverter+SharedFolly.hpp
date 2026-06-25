#pragma once

#include "../core/SharedFolly.hpp"

#include <NitroModules/JSIConverter.hpp>
#include <jsi/JSIDynamic.h>
#include <jsi/jsi.h>

namespace margelo::nitro {

/**
 * Converts a JS style object <-> `nitrowind::SharedFolly` (a shared
 * `folly::dynamic`). Uses React Native's own `dynamicFromValue` /
 * `valueFromDynamic` so the representation is byte-for-byte what Fabric expects.
 */
template <>
struct JSIConverter<::nitrowind::SharedFolly> {
  static ::nitrowind::SharedFolly fromJSI(facebook::jsi::Runtime& runtime,
                                          const facebook::jsi::Value& value) {
    return ::nitrowind::makeFolly(facebook::jsi::dynamicFromValue(runtime, value));
  }

  static facebook::jsi::Value toJSI(facebook::jsi::Runtime& runtime,
                                    const ::nitrowind::SharedFolly& value) {
    if (!value) return facebook::jsi::Value::null();
    return facebook::jsi::valueFromDynamic(runtime, *value);
  }

  static bool canConvert(facebook::jsi::Runtime& /*runtime*/,
                         const facebook::jsi::Value& value) {
    return value.isObject();
  }
};

} // namespace margelo::nitro
