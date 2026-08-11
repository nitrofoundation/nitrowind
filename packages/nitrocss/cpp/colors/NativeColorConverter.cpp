#include "NativeColorConverter.hpp"

#include <algorithm>
#include <cmath>

namespace nitrocss::colors {
namespace {

constexpr double kPi = 3.14159265358979323846;

const DescriptorValue* get(
    const DescriptorValue::Object& object,
    const std::string& key) {
  const auto iterator = object.find(key);
  return iterator == object.end() ? nullptr : &iterator->second;
}

std::optional<SemanticValue> decodeSemanticValue(
    const DescriptorValue& value,
    int depth);

DecodeResult decode(const DescriptorValue& value, int depth) {
  if (depth > 32) return {nullptr, "Color descriptor is too deeply nested"};
  const auto* object = value.object();
  if (object == nullptr) return {nullptr, "Color descriptor must be an object"};
  const auto* semanticMarkerValue = get(*object, "$semanticColor");
  const auto* semanticMarker = semanticMarkerValue == nullptr
      ? nullptr
      : semanticMarkerValue->string();
  if (semanticMarker != nullptr && *semanticMarker == "platform") {
    const auto* nameValue = get(*object, "name");
    const auto* name = nameValue == nullptr ? nullptr : nameValue->string();
    if (name == nullptr || name->empty()) {
      return {nullptr, "Platform color is missing name"};
    }
    PlatformColor platform{*name, std::nullopt};
    if (const auto* fallbackValue = get(*object, "fallback")) {
      const auto* fallback = fallbackValue->string();
      if (fallback == nullptr) return {nullptr, "Platform fallback must be a string"};
      platform.fallback = *fallback;
    }
    return {std::make_shared<ColorDescriptor>(ColorDescriptor{platform}), {}};
  }
  if (semanticMarker != nullptr && *semanticMarker == "dynamic") {
    const auto* lightValue = get(*object, "light");
    const auto* darkValue = get(*object, "dark");
    if (lightValue == nullptr || darkValue == nullptr) {
      return {nullptr, "Dynamic color requires light and dark"};
    }
    const auto light = decodeSemanticValue(*lightValue, depth + 1);
    const auto dark = decodeSemanticValue(*darkValue, depth + 1);
    if (!light || !dark) return {nullptr, "Invalid dynamic color branch"};
    DynamicColor dynamic{*light, *dark, std::nullopt, std::nullopt};
    if (const auto* contrast = get(*object, "highContrastLight")) {
      dynamic.highContrastLight = decodeSemanticValue(*contrast, depth + 1);
      if (!dynamic.highContrastLight) {
        return {nullptr, "Invalid high-contrast light color"};
      }
    }
    if (const auto* contrast = get(*object, "highContrastDark")) {
      dynamic.highContrastDark = decodeSemanticValue(*contrast, depth + 1);
      if (!dynamic.highContrastDark) {
        return {nullptr, "Invalid high-contrast dark color"};
      }
    }
    return {std::make_shared<ColorDescriptor>(ColorDescriptor{dynamic}), {}};
  }

  const auto* wideMarkerValue = get(*object, "$wideGamutColor");
  const auto* wideMarker =
      wideMarkerValue == nullptr ? nullptr : wideMarkerValue->string();
  if (wideMarker == nullptr) return {nullptr, "Missing native color marker"};
  WideGamutColor wide;
  if (*wideMarker == "display-p3") {
    const auto* channelsValue = get(*object, "channels");
    const auto* channels =
        channelsValue == nullptr ? nullptr : channelsValue->array();
    if (channels == nullptr || channels->size() != 3) {
      return {nullptr, "Display P3 requires three channels"};
    }
    wide.space = WideGamutColor::Space::DisplayP3;
    for (std::size_t index = 0; index < 3; index += 1) {
      const auto* channel = (*channels)[index].number();
      if (channel == nullptr || !std::isfinite(*channel)) {
        return {nullptr, "Invalid Display P3 channel"};
      }
      wide.channels[index] = *channel;
    }
  } else if (*wideMarker == "oklch") {
    const auto* lightnessValue = get(*object, "lightness");
    const auto* chromaValue = get(*object, "chroma");
    const auto* hueValue = get(*object, "hue");
    const auto* lightness =
        lightnessValue == nullptr ? nullptr : lightnessValue->number();
    const auto* chroma =
        chromaValue == nullptr ? nullptr : chromaValue->number();
    const auto* hue = hueValue == nullptr ? nullptr : hueValue->number();
    if (lightness == nullptr || chroma == nullptr || hue == nullptr ||
        !std::isfinite(*lightness) || !std::isfinite(*chroma) ||
        !std::isfinite(*hue)) {
      return {nullptr, "Invalid OKLCH descriptor"};
    }
    wide.space = WideGamutColor::Space::Oklch;
    wide.channels = {*lightness, *chroma, *hue};
  } else {
    return {nullptr, "Unsupported wide-gamut color space"};
  }
  if (const auto* alphaValue = get(*object, "alpha")) {
    const auto* alpha = alphaValue->number();
    if (alpha == nullptr || !std::isfinite(*alpha)) {
      return {nullptr, "Invalid color alpha"};
    }
    wide.alpha = std::clamp(*alpha, 0.0, 1.0);
  }
  return {std::make_shared<ColorDescriptor>(ColorDescriptor{wide}), {}};
}

std::optional<SemanticValue> decodeSemanticValue(
    const DescriptorValue& value,
    int depth) {
  if (const auto* css = value.string()) return SemanticValue(*css);
  const auto descriptor = decode(value, depth);
  return descriptor ? std::optional(SemanticValue(descriptor.descriptor))
                    : std::nullopt;
}

double linearize(double value) {
  return value <= 0.04045 ? value / 12.92
                          : std::pow((value + 0.055) / 1.055, 2.4);
}

double transfer(double value) {
  const double clamped = std::clamp(value, 0.0, 1.0);
  return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * std::pow(clamped, 1.0 / 2.4) - 0.055;
}

ResolvedColor resolveValue(const SemanticValue& value, const Runtime& runtime);

ResolvedColor platformResult(
    const PlatformColor& platform,
    const Runtime& runtime) {
  if (runtime.platformColor) {
    if (const auto resolved = runtime.platformColor(platform.name)) {
      return {ResolvedColor::Kind::CssString, *resolved, {}, nullptr};
    }
  }
  if (runtime.preservePlatformTokens) {
    return {ResolvedColor::Kind::PlatformToken, platform.name, {}, nullptr};
  }
  if (platform.fallback) {
    return {ResolvedColor::Kind::CssString, *platform.fallback, {}, nullptr};
  }
  return {ResolvedColor::Kind::PlatformToken, platform.name, {}, nullptr};
}

ResolvedColor resolveDynamic(
    const DynamicColor& dynamic,
    const Runtime& runtime) {
  if (!runtime.preserveDynamic) {
    const SemanticValue* selected = runtime.scheme == Runtime::Scheme::Dark
        ? &dynamic.dark
        : &dynamic.light;
    if (runtime.highContrast) {
      if (runtime.scheme == Runtime::Scheme::Dark && dynamic.highContrastDark) {
        selected = &*dynamic.highContrastDark;
      } else if (
          runtime.scheme == Runtime::Scheme::Light &&
          dynamic.highContrastLight) {
        selected = &*dynamic.highContrastLight;
      }
    }
    return resolveValue(*selected, runtime);
  }
  auto branches = std::make_shared<DynamicResolvedColor>();
  branches->light = std::make_shared<ResolvedColor>(
      resolveValue(dynamic.light, runtime));
  branches->dark = std::make_shared<ResolvedColor>(
      resolveValue(dynamic.dark, runtime));
  if (dynamic.highContrastLight) {
    branches->highContrastLight = std::make_shared<ResolvedColor>(
        resolveValue(*dynamic.highContrastLight, runtime));
  }
  if (dynamic.highContrastDark) {
    branches->highContrastDark = std::make_shared<ResolvedColor>(
        resolveValue(*dynamic.highContrastDark, runtime));
  }
  return {ResolvedColor::Kind::Dynamic, {}, {}, branches};
}

ResolvedColor resolveValue(const SemanticValue& value, const Runtime& runtime) {
  if (const auto* string = std::get_if<std::string>(&value)) {
    return {ResolvedColor::Kind::CssString, *string, {}, nullptr};
  }
  return resolve(**std::get_if<ColorDescriptorPtr>(&value), runtime);
}

}  // namespace

DecodeResult decodeDescriptor(const DescriptorValue& value) {
  return decode(value, 0);
}

Rgba toSrgb(const WideGamutColor& color) {
  double red;
  double green;
  double blue;
  if (color.space == WideGamutColor::Space::DisplayP3) {
    const double p3r = linearize(color.channels[0]);
    const double p3g = linearize(color.channels[1]);
    const double p3b = linearize(color.channels[2]);
    red = 1.22474527 * p3r - 0.22490437 * p3g;
    green = -0.0420571 * p3r + 1.042081 * p3g;
    blue = -0.01964228 * p3r - 0.07865492 * p3g + 1.0985372 * p3b;
  } else {
    const double angle = color.channels[2] * kPi / 180.0;
    const double a = color.channels[1] * std::cos(angle);
    const double b = color.channels[1] * std::sin(angle);
    const double lRoot = color.channels[0] + 0.39633778 * a + 0.21580376 * b;
    const double mRoot = color.channels[0] - 0.10556135 * a - 0.06385417 * b;
    const double sRoot = color.channels[0] - 0.08948418 * a - 1.29148555 * b;
    const double l = lRoot * lRoot * lRoot;
    const double m = mRoot * mRoot * mRoot;
    const double s = sRoot * sRoot * sRoot;
    red = 4.07674166 * l - 3.30771159 * m + 0.23096993 * s;
    green = -1.268438 * l + 2.6097574 * m - 0.3413194 * s;
    blue = -0.00419609 * l - 0.70341861 * m + 1.7076147 * s;
  }
  return {transfer(red), transfer(green), transfer(blue), color.alpha};
}

ResolvedColor resolve(const ColorDescriptor& descriptor, const Runtime& runtime) {
  if (const auto* platform = std::get_if<PlatformColor>(&descriptor.value)) {
    return platformResult(*platform, runtime);
  }
  if (const auto* dynamic = std::get_if<DynamicColor>(&descriptor.value)) {
    return resolveDynamic(*dynamic, runtime);
  }
  const auto& wide = std::get<WideGamutColor>(descriptor.value);
  if (wide.space == WideGamutColor::Space::DisplayP3) {
    return {ResolvedColor::Kind::DisplayP3,
            {},
            {wide.channels[0], wide.channels[1], wide.channels[2], wide.alpha},
            nullptr};
  }
  const auto rgba = toSrgb(wide);
  return {ResolvedColor::Kind::Rgba, {}, rgba, nullptr};
}

}  // namespace nitrocss::colors
