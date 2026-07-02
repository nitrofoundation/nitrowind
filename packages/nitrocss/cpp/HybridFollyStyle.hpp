#pragma once

#include "HybridFollyStyleSpec.hpp"
#include "core/SharedFolly.hpp"

namespace margelo::nitro::nitrowind {

/**
 * Concrete `FollyStyle`. Holds a JS style object as a shared `folly::dynamic`
 * so it can be merged and committed into Fabric props without re-marshalling.
 */
class HybridFollyStyle : public HybridFollyStyleSpec {
public:
  HybridFollyStyle() : HybridObject(TAG) {}

  void fromJSObject(::nitrowind::SharedFolly style) override {
    style_ = style;
  }

  ::nitrowind::SharedFolly getStyle() override {
    return style_ ? style_ : ::nitrowind::makeFolly();
  }

  // --- Engine-facing accessor ----------------------------------------------
  ::nitrowind::SharedFolly style() const { return style_; }

private:
  ::nitrowind::SharedFolly style_;
};

} // namespace margelo::nitro::nitrowind
