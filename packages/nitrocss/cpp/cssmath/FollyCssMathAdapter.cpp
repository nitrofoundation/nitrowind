#include "FollyCssMathAdapter.hpp"

namespace nitrocss::cssmath {

DescriptorValue fromFollyDynamic(const folly::dynamic& value) {
  if (value.isNumber()) return DescriptorValue(value.asDouble());
  if (value.isString()) return DescriptorValue(value.getString());
  if (value.isArray()) {
    DescriptorValue::Array output;
    output.reserve(value.size());
    for (const auto& item : value) output.push_back(fromFollyDynamic(item));
    return DescriptorValue(std::move(output));
  }
  if (value.isObject()) {
    DescriptorValue::Object output;
    for (const auto& item : value.items()) {
      if (!item.first.isString()) continue;
      output.emplace(item.first.getString(), fromFollyDynamic(item.second));
    }
    return DescriptorValue(std::move(output));
  }
  return DescriptorValue();
}

DecodeResult decodeFollyDescriptor(const folly::dynamic& value) {
  return decodeDescriptor(fromFollyDynamic(value));
}

}  // namespace nitrocss::cssmath
