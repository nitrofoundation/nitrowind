#ifdef NITROCSS_STANDALONE_TEST

#include "../CssMathEvaluator.hpp"

#include <cassert>
#include <cmath>
#include <iostream>

using nitrocss::cssmath::DescriptorValue;

namespace {
DescriptorValue value(double number, const char* unit) {
  return DescriptorValue::Object{
      {"type", "value"}, {"value", number}, {"unit", unit}};
}
}  // namespace

int main() {
  const DescriptorValue descriptor = DescriptorValue::Object{{
      "$cssMath",
      DescriptorValue::Object{
          {"type", "function"},
          {"name", "clamp"},
          {"values",
           DescriptorValue::Array{
               value(16, "px"),
               DescriptorValue::Object{
                   {"type", "operation"},
                   {"operator", "+"},
                   {"left", value(10, "vw")},
                   {"right", value(5, "cqi")}},
               value(80, "px")}}}}};

  const auto decoded = nitrocss::cssmath::decodeDescriptor(descriptor);
  assert(decoded);
  nitrocss::cssmath::Runtime runtime;
  runtime.viewportWidth = 400;
  runtime.viewportHeight = 800;
  runtime.containerInlineSize = 200;
  const auto result = nitrocss::cssmath::evaluate(*decoded.node, runtime);
  assert(result && std::abs(*result - 50.0) < 0.0001);

  const DescriptorValue invalid = DescriptorValue::Object{{"$cssMath", "bad"}};
  assert(!nitrocss::cssmath::decodeDescriptor(invalid));
  std::cout << "CssMathEvaluatorTest passed\n";
}

#endif
