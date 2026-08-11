#ifdef NITROCSS_STANDALONE_TEST

#include "../NativeColorConverter.hpp"

#include <cassert>
#include <cmath>
#include <iostream>

using nitrocss::colors::DescriptorValue;

int main() {
  const DescriptorValue semantic = DescriptorValue::Object{
      {"$semanticColor", "dynamic"},
      {"light",
       DescriptorValue::Object{{"$semanticColor", "platform"},
                               {"name", "labelColor"},
                               {"fallback", "#111111"}}},
      {"dark", "#ffffff"}};
  const auto decodedSemantic = nitrocss::colors::decodeDescriptor(semantic);
  assert(decodedSemantic);
  nitrocss::colors::Runtime runtime;
  runtime.preserveDynamic = false;
  runtime.scheme = nitrocss::colors::Runtime::Scheme::Light;
  runtime.platformColor = [](const std::string& name)
      -> std::optional<std::string> {
    return name == "labelColor" ? std::optional("native-label")
                                : std::nullopt;
  };
  const auto resolved = nitrocss::colors::resolve(
      *decodedSemantic.descriptor, runtime);
  assert(resolved.kind == nitrocss::colors::ResolvedColor::Kind::CssString);
  assert(resolved.text == "native-label");

  const DescriptorValue wide = DescriptorValue::Object{
      {"$wideGamutColor", "oklch"},
      {"lightness", 0.72},
      {"chroma", 0.18},
      {"hue", 40.0},
      {"alpha", 0.5}};
  const auto decodedWide = nitrocss::colors::decodeDescriptor(wide);
  assert(decodedWide);
  const auto converted = nitrocss::colors::resolve(
      *decodedWide.descriptor, runtime);
  assert(converted.kind == nitrocss::colors::ResolvedColor::Kind::Rgba);
  assert(std::abs(converted.rgba.red - 1.0) < 0.001);
  assert(std::abs(converted.rgba.green - 0.462) < 0.01);
  assert(std::abs(converted.rgba.blue - 0.264) < 0.01);
  assert(converted.rgba.alpha == 0.5);

  const DescriptorValue p3 = DescriptorValue::Object{
      {"$wideGamutColor", "display-p3"},
      {"channels", DescriptorValue::Array{1.0, 0.1, 0.2}},
      {"alpha", 0.75}};
  const auto decodedP3 = nitrocss::colors::decodeDescriptor(p3);
  assert(decodedP3);
  const auto preservedP3 = nitrocss::colors::resolve(*decodedP3.descriptor, runtime);
  assert(preservedP3.kind ==
         nitrocss::colors::ResolvedColor::Kind::DisplayP3);
  assert(preservedP3.rgba.red == 1.0);
  assert(preservedP3.rgba.green == 0.1);
  assert(preservedP3.rgba.blue == 0.2);

  runtime.platformColor = nullptr;
  runtime.preserveDynamic = true;
  const auto nativeDynamic = nitrocss::colors::resolve(
      *decodedSemantic.descriptor, runtime);
  assert(nativeDynamic.kind == nitrocss::colors::ResolvedColor::Kind::Dynamic);
  assert(nativeDynamic.dynamic->light->kind ==
         nitrocss::colors::ResolvedColor::Kind::PlatformToken);

  const DescriptorValue invalid = DescriptorValue::Object{
      {"$wideGamutColor", "display-p3"},
      {"channels", DescriptorValue::Array{1.0, 0.0}}};
  assert(!nitrocss::colors::decodeDescriptor(invalid));
  std::cout << "NativeColorConverterTest passed\n";
}

#endif
