#include "NativeStyleNormalizer.hpp"

#include <cstdint>
#include <string>
#include <vector>

namespace nitrocss {
namespace {

bool isHexDigit(char value) {
  return (value >= '0' && value <= '9') ||
      (value >= 'a' && value <= 'f') ||
      (value >= 'A' && value <= 'F');
}

uint8_t hexValue(char value) {
  if (value >= '0' && value <= '9')
    return static_cast<uint8_t>(value - '0');
  if (value >= 'a' && value <= 'f')
    return static_cast<uint8_t>(10 + value - 'a');
  return static_cast<uint8_t>(10 + value - 'A');
}

bool parseHexColor(const std::string &value, int64_t &out) {
  if (value.empty() || value[0] != '#')
    return false;
  const std::size_t length = value.size() - 1;
  if (length != 3 && length != 4 && length != 6 && length != 8)
    return false;
  for (std::size_t index = 1; index < value.size(); ++index) {
    if (!isHexDigit(value[index]))
      return false;
  }

  auto nibble = [&](std::size_t index) { return hexValue(value[index]); };
  uint8_t red = 0;
  uint8_t green = 0;
  uint8_t blue = 0;
  uint8_t alpha = 0xff;
  if (length == 3 || length == 4) {
    red = static_cast<uint8_t>((nibble(1) << 4) | nibble(1));
    green = static_cast<uint8_t>((nibble(2) << 4) | nibble(2));
    blue = static_cast<uint8_t>((nibble(3) << 4) | nibble(3));
    if (length == 4)
      alpha = static_cast<uint8_t>((nibble(4) << 4) | nibble(4));
  } else {
    red = static_cast<uint8_t>((nibble(1) << 4) | nibble(2));
    green = static_cast<uint8_t>((nibble(3) << 4) | nibble(4));
    blue = static_cast<uint8_t>((nibble(5) << 4) | nibble(6));
    if (length == 8)
      alpha = static_cast<uint8_t>((nibble(7) << 4) | nibble(8));
  }

  const uint32_t processed = (static_cast<uint32_t>(alpha) << 24) |
      (static_cast<uint32_t>(red) << 16) |
      (static_cast<uint32_t>(green) << 8) |
      static_cast<uint32_t>(blue);
#if defined(__ANDROID__)
  out = static_cast<int32_t>(processed);
#else
  out = static_cast<int64_t>(processed);
#endif
  return true;
}

bool isColorProp(const folly::dynamic &key) {
  if (!key.isString())
    return false;
  const auto &prop = key.getString();
  return prop == "color" || prop == "backgroundColor" ||
      prop == "borderColor" || prop == "borderTopColor" ||
      prop == "borderRightColor" || prop == "borderBottomColor" ||
      prop == "borderLeftColor" || prop == "borderStartColor" ||
      prop == "borderEndColor" || prop == "shadowColor" ||
      prop == "textShadowColor" || prop == "tintColor" ||
      prop == "textDecorationColor" || prop == "placeholderTextColor" ||
      prop == "cursorColor" || prop == "selectionColor" ||
      prop == "selectionHandleColor" || prop == "underlineColorAndroid" ||
      prop == "overlayColor" || prop == "accentColor" || prop == "fill" ||
      prop == "stroke" || prop == "thumbColor" ||
      prop == "trackColorFalse" || prop == "trackColorTrue";
}

bool parseAngleDegrees(const std::string &value, double &out) {
  try {
    std::size_t parsed = 0;
    const double numeric = std::stod(value, &parsed);
    if (parsed == value.size() && numeric == 0.0) {
      out = 0.0;
      return true;
    }
    const std::string unit = value.substr(parsed);
    if (unit == "deg") {
      out = numeric;
      return true;
    }
    if (unit == "rad") {
      constexpr double radiansToDegrees = 180.0 / 3.14159265358979323846;
      out = numeric * radiansToDegrees;
      return true;
    }
  } catch (...) {
  }
  return false;
}

void processFilterColors(folly::dynamic &value) {
  if (!value.isArray())
    return;
  for (auto &filter : value) {
    if (!filter.isObject())
      continue;
    auto hueRotate = filter.find("hueRotate");
    if (hueRotate != filter.items().end() && hueRotate->second.isString()) {
      double degrees = 0.0;
      if (parseAngleDegrees(hueRotate->second.getString(), degrees))
        filter["hueRotate"] = degrees;
    }
    auto dropShadow = filter.find("dropShadow");
    if (dropShadow == filter.items().end() || !dropShadow->second.isObject())
      continue;
    auto color = dropShadow->second.find("color");
    if (color == dropShadow->second.items().end() || !color->second.isString())
      continue;
    int64_t processed = 0;
    if (parseHexColor(color->second.getString(), processed))
      dropShadow->second["color"] = processed;
  }
}

void foldFilterDescriptor(folly::dynamic &style) {
  auto *descriptor = style.get_ptr("--nitrocss-filter");
  if (descriptor == nullptr)
    return;
  folly::dynamic filters = folly::dynamic::array();
  static constexpr const char *names[] = {
      "blur", "brightness", "contrast", "grayscale", "hueRotate",
      "invert", "opacity", "saturate", "sepia"};
  if (descriptor->isArray()) {
    for (const auto &entry : *descriptor) {
      if (!entry.isArray() || entry.size() < 2 || !entry[0].isInt())
        continue;
      const auto opcode = entry[0].getInt();
      if (opcode >= 0 && opcode <= 8 && entry[1].isNumber()) {
        filters.push_back(folly::dynamic::object(names[opcode], entry[1]));
      } else if (opcode == 9 && entry.size() >= 5) {
        filters.push_back(folly::dynamic::object(
            "dropShadow",
            folly::dynamic::object("offsetX", entry[1])
                ("offsetY", entry[2])
                ("standardDeviation", entry[3])
                ("color", entry[4])));
      }
    }
  }
  style.erase("--nitrocss-filter");
  if (!filters.empty())
    style["filter"] = std::move(filters);
}

void consumeStickyPosition(folly::dynamic &style) {
  auto *position = style.get_ptr("position");
  if (position == nullptr || !position->isString() ||
      position->getString() != "sticky") {
    return;
  }
  style.erase("position");
  style.erase("top");
  style.erase("right");
  style.erase("bottom");
  style.erase("left");
}

} // namespace

void NativeStyleNormalizer::normalize(folly::dynamic &style) {
  if (!style.isObject())
    return;
  consumeStickyPosition(style);
  foldFilterDescriptor(style);

  std::vector<folly::dynamic> unsupportedColorKeys;
  for (const auto &pair : style.items()) {
    if (pair.first.isString() && pair.first.getString() == "filter") {
      processFilterColors(style[pair.first]);
      continue;
    }
    if (!isColorProp(pair.first) || !pair.second.isString())
      continue;
    const auto &value = pair.second.getString();
    if (value.rfind("color-mix(", 0) == 0) {
      unsupportedColorKeys.push_back(pair.first);
      continue;
    }
    int64_t processed = 0;
    if (parseHexColor(value, processed))
      style[pair.first] = processed;
  }
  for (const auto &key : unsupportedColorKeys)
    style.erase(key);
}

} // namespace nitrocss
