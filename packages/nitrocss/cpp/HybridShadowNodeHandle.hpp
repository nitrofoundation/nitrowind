#pragma once

#include "HybridShadowNodeHandleSpec.hpp"

#include <memory>
#include <react/renderer/core/ShadowNode.h>

namespace margelo::nitro::nitrocss {

/**
 * Concrete `ShadowNodeHandle`. Wraps a Fabric `ShadowNode` obtained from a JS
 * ref and exposes the bits the engine needs (tag, family, surface).
 */
class HybridShadowNodeHandle : public HybridShadowNodeHandleSpec {
public:
  HybridShadowNodeHandle() : HybridObject(TAG) {}

  void fromRef(std::shared_ptr<const facebook::react::ShadowNode> ref) override {
    node_ = ref;
    if (ref != nullptr) {
      tag_ = ref->getTag();
      surfaceId_ = ref->getSurfaceId();
      family_ = ref->getFamilyShared();
    }
  }

  void fromTag(double tag) override {
    tag_ = static_cast<facebook::react::Tag>(tag);
  }

  double getTag() override {
    return static_cast<double>(tag_);
  }

  // --- Engine-facing accessors (not part of the JS spec) -------------------
  facebook::react::Tag nativeTag() const { return tag_; }
  facebook::react::SurfaceId surfaceId() const { return surfaceId_; }
  facebook::react::ShadowNodeFamily::Shared family() const { return family_; }
  std::shared_ptr<const facebook::react::ShadowNode> node() const { return node_; }

private:
  std::shared_ptr<const facebook::react::ShadowNode> node_;
  facebook::react::ShadowNodeFamily::Shared family_;
  facebook::react::Tag tag_ = 0;
  facebook::react::SurfaceId surfaceId_ = 0;
};

} // namespace margelo::nitro::nitrocss
