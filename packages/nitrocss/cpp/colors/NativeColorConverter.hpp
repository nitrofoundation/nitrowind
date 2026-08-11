#pragma once

#include <array>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <variant>
#include <vector>

namespace nitrocss::colors {

class DescriptorValue {
 public:
  using Object = std::map<std::string, DescriptorValue>;
  using Array = std::vector<DescriptorValue>;
  using Storage =
      std::variant<std::monostate, double, std::string, Object, Array>;

  DescriptorValue() = default;
  DescriptorValue(double value) : storage_(value) {}
  DescriptorValue(const char* value) : storage_(std::string(value)) {}
  DescriptorValue(std::string value) : storage_(std::move(value)) {}
  DescriptorValue(Object value) : storage_(std::move(value)) {}
  DescriptorValue(Array value) : storage_(std::move(value)) {}

  const Object* object() const { return std::get_if<Object>(&storage_); }
  const Array* array() const { return std::get_if<Array>(&storage_); }
  const std::string* string() const {
    return std::get_if<std::string>(&storage_);
  }
  const double* number() const { return std::get_if<double>(&storage_); }

 private:
  Storage storage_;
};

struct PlatformColor {
  std::string name;
  std::optional<std::string> fallback;
};

struct ColorDescriptor;
using ColorDescriptorPtr = std::shared_ptr<const ColorDescriptor>;
using SemanticValue = std::variant<std::string, ColorDescriptorPtr>;

struct DynamicColor {
  SemanticValue light;
  SemanticValue dark;
  std::optional<SemanticValue> highContrastLight;
  std::optional<SemanticValue> highContrastDark;
};

struct WideGamutColor {
  enum class Space { DisplayP3, Oklch };
  Space space{Space::DisplayP3};
  std::array<double, 3> channels{};
  double alpha{1.0};
};

struct ColorDescriptor {
  std::variant<PlatformColor, DynamicColor, WideGamutColor> value;
};

struct DecodeResult {
  ColorDescriptorPtr descriptor;
  std::string error;
  explicit operator bool() const { return descriptor != nullptr; }
};

struct Rgba {
  double red{0};
  double green{0};
  double blue{0};
  double alpha{1};
};

struct ResolvedColor;
using ResolvedColorPtr = std::shared_ptr<const ResolvedColor>;

struct DynamicResolvedColor {
  ResolvedColorPtr light;
  ResolvedColorPtr dark;
  ResolvedColorPtr highContrastLight;
  ResolvedColorPtr highContrastDark;
};

struct ResolvedColor {
  enum class Kind { CssString, PlatformToken, Dynamic, Rgba, DisplayP3 };
  Kind kind{Kind::CssString};
  std::string text;
  Rgba rgba;
  std::shared_ptr<const DynamicResolvedColor> dynamic;
};

struct Runtime {
  enum class Scheme { Light, Dark };
  Scheme scheme{Scheme::Light};
  bool highContrast{false};
  /** Optional native bridge. Missing tokens remain typed platform tokens. */
  std::function<std::optional<std::string>(const std::string&)> platformColor;
  /** Preserve dynamic branches for DynamicColorIOS/Android resource adapters. */
  bool preserveDynamic{true};
  /** Preserve a platform token even when its descriptor includes a JS fallback. */
  bool preservePlatformTokens{true};
};

/** Decode `$semanticColor` or `$wideGamutColor` descriptors emitted by TypeScript. */
DecodeResult decodeDescriptor(const DescriptorValue& value);

/** Resolve semantic branches while preserving native tokens when possible. */
ResolvedColor resolve(const ColorDescriptor& descriptor, const Runtime& runtime);

/** Deterministic clipped sRGB fallback for Display P3 and OKLCH. */
Rgba toSrgb(const WideGamutColor& color);

}  // namespace nitrocss::colors
