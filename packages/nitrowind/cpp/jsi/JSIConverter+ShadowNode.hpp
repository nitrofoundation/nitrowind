#pragma once

#include "../NitrowindInstaller.hpp"

#include <NitroModules/JSIConverter.hpp>
#include <jsi/jsi.h>
#include <memory>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/uimanager/primitives.h>

namespace margelo::nitro {

/**
 * Converts a JS shadow-node value into a C++
 * `std::shared_ptr<const facebook::react::ShadowNode>`.
 *
 * The JS side passes `ref.__internalInstanceHandle.stateNode.node` — a
 * `ShadowNodeWrapper` native-state object — which we unwrap directly (the
 * inverse of React Native's `valueFromShadowNode`). Same primitive Reanimated
 * and Skia rely on.
 */
template <>
struct JSIConverter<std::shared_ptr<const facebook::react::ShadowNode>> {
  static std::shared_ptr<const facebook::react::ShadowNode> fromJSI(
      facebook::jsi::Runtime& runtime,
      const facebook::jsi::Value& value) {
    if (!value.isObject()) {
      return nullptr;
    }
    auto object = value.asObject(runtime);
    if (!object.hasNativeState<facebook::react::ShadowNodeWrapper>(runtime)) {
      return nullptr;
    }
    // We hold a live JS runtime here, on the JS thread, at the exact moment a
    // node is first linked — the bridgeless-safe seam to capture the UIManager
    // (its binding isn't reachable via `setBridge:` under the New Arch host).
    ::nitrowind::NitrowindInstaller::shared().ensureCaptured(runtime);
    return object.getNativeState<facebook::react::ShadowNodeWrapper>(runtime)->shadowNode;
  }

  static facebook::jsi::Value toJSI(
      facebook::jsi::Runtime& runtime,
      const std::shared_ptr<const facebook::react::ShadowNode>& node) {
    if (node == nullptr) return facebook::jsi::Value::null();
    return facebook::react::valueFromShadowNode(runtime, node);
  }

  static bool canConvert(facebook::jsi::Runtime& /*runtime*/,
                         const facebook::jsi::Value& value) {
    return value.isObject();
  }
};

} // namespace margelo::nitro
