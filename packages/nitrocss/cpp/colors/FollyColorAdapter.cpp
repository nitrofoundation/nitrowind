#include "FollyColorAdapter.hpp"

namespace nitrocss::colors {

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

std::optional<folly::dynamic> toNativeFollyColor(
    const ResolvedColor& color,
    NativeColorPlatform platform) {
  switch (color.kind) {
    case ResolvedColor::Kind::CssString:
      return folly::dynamic(color.text);
    case ResolvedColor::Kind::PlatformToken: {
      folly::dynamic names = folly::dynamic::array;
      names.push_back(color.text);
      folly::dynamic result = folly::dynamic::object;
      result[platform == NativeColorPlatform::IOS ? "semantic"
                                                  : "resource_paths"] =
          std::move(names);
      return result;
    }
    case ResolvedColor::Kind::DisplayP3: {
      folly::dynamic result = folly::dynamic::object;
      result["space"] = "display-p3";
      result["r"] = color.rgba.red;
      result["g"] = color.rgba.green;
      result["b"] = color.rgba.blue;
      result["a"] = color.rgba.alpha;
      return result;
    }
    case ResolvedColor::Kind::Dynamic: {
      if (platform != NativeColorPlatform::IOS || color.dynamic == nullptr ||
          color.dynamic->light == nullptr || color.dynamic->dark == nullptr) {
        return std::nullopt;
      }
      const auto light = toNativeFollyColor(*color.dynamic->light, platform);
      const auto dark = toNativeFollyColor(*color.dynamic->dark, platform);
      if (!light || !dark) return std::nullopt;
      folly::dynamic branches = folly::dynamic::object;
      branches["light"] = *light;
      branches["dark"] = *dark;
      if (color.dynamic->highContrastLight != nullptr) {
        if (const auto high = toNativeFollyColor(
                *color.dynamic->highContrastLight, platform)) {
          branches["highContrastLight"] = *high;
        }
      }
      if (color.dynamic->highContrastDark != nullptr) {
        if (const auto high = toNativeFollyColor(
                *color.dynamic->highContrastDark, platform)) {
          branches["highContrastDark"] = *high;
        }
      }
      folly::dynamic result = folly::dynamic::object;
      result["dynamic"] = std::move(branches);
      return result;
    }
    case ResolvedColor::Kind::Rgba:
      // Ordinary/OKLCH fallbacks continue through the engine's CSS parser.
      return std::nullopt;
  }
  return std::nullopt;
}

}  // namespace nitrocss::colors
