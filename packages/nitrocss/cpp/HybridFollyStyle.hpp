#pragma once

#include "HybridFollyStyleSpec.hpp"
#include "core/SharedFolly.hpp"

namespace margelo::nitro::nitrocss {

/**
 * Concrete `FollyStyle`. Holds a JS style object as a shared `folly::dynamic`
 * so it can be merged and committed into Fabric props without re-marshalling.
 */
class HybridFollyStyle : public HybridFollyStyleSpec {
public:
  HybridFollyStyle() : HybridObject(TAG) {}

  void fromJSObject(::nitrocss::SharedFolly style) override {
    style_ = style;
  }

  ::nitrocss::SharedFolly getStyle() override {
    return style_ ? style_ : ::nitrocss::makeFolly();
  }

  // --- Engine-facing accessor ----------------------------------------------
  ::nitrocss::SharedFolly style() const { return style_; }

private:
  ::nitrocss::SharedFolly style_;
};

} // namespace margelo::nitro::nitrocss
