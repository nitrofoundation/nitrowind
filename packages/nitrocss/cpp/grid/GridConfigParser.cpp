#include "GridConfigParser.hpp"

namespace nitrocss::grid {
namespace {

double numberOr(const folly::dynamic &value, double fallback) {
  if (value.isDouble())
    return value.getDouble();
  if (value.isInt())
    return static_cast<double>(value.getInt());
  return fallback;
}

Track parseTrack(const folly::dynamic &value, const Track &fallback) {
  if (!value.isObject())
    return fallback;
  Track track = fallback;
  if (auto *type = value.get_ptr("type"); type != nullptr && type->isString()) {
    const auto &name = type->getString();
    if (name == "fr")
      track.type = TrackType::Fr;
    else if (name == "px")
      track.type = TrackType::Px;
    else if (name == "auto")
      track.type = TrackType::Auto;
    else if (name == "min-content")
      track.type = TrackType::MinContent;
    else if (name == "max-content")
      track.type = TrackType::MaxContent;
  }
  if (auto *valueField = value.get_ptr("value"); valueField != nullptr)
    track.value = numberOr(*valueField, track.value);
  return track;
}

std::vector<Track> parseTracks(const folly::dynamic &value) {
  std::vector<Track> tracks;
  if (!value.isArray())
    return tracks;
  tracks.reserve(value.size());
  for (const auto &entry : value)
    tracks.push_back(parseTrack(entry, Track{}));
  return tracks;
}

int intOr(const folly::dynamic &value, const char *key, int fallback) {
  if (!value.isObject())
    return fallback;
  if (auto *field = value.get_ptr(key); field != nullptr) {
    if (field->isInt())
      return static_cast<int>(field->getInt());
    if (field->isDouble())
      return static_cast<int>(field->getDouble());
  }
  return fallback;
}

} // namespace

GridConfig parseGridConfig(const folly::dynamic &value) {
  GridConfig config;
  if (!value.isObject())
    return config;
  if (auto *columns = value.get_ptr("columns"); columns != nullptr)
    config.columns = parseTracks(*columns);
  if (auto *rows = value.get_ptr("rows"); rows != nullptr)
    config.rows = parseTracks(*rows);
  if (auto *autoRow = value.get_ptr("autoRow"); autoRow != nullptr)
    config.autoRow = parseTrack(*autoRow, config.autoRow);
  if (auto *dense = value.get_ptr("dense"); dense != nullptr && dense->isBool())
    config.dense = dense->getBool();
  if (auto *masonry = value.get_ptr("masonry");
      masonry != nullptr && masonry->isBool()) {
    config.masonry = masonry->getBool();
  }
  if (auto *gap = value.get_ptr("columnGap"); gap != nullptr)
    config.columnGap = numberOr(*gap, 0.0);
  if (auto *gap = value.get_ptr("rowGap"); gap != nullptr)
    config.rowGap = numberOr(*gap, 0.0);
  if (auto *padding = value.get_ptr("paddingHorizontal"); padding != nullptr)
    config.paddingHorizontal = numberOr(*padding, 0.0);
  if (auto *padding = value.get_ptr("paddingTop"); padding != nullptr)
    config.paddingTop = numberOr(*padding, 0.0);
  if (auto *padding = value.get_ptr("paddingBottom"); padding != nullptr)
    config.paddingBottom = numberOr(*padding, 0.0);
  if (auto *items = value.get_ptr("items"); items != nullptr && items->isArray()) {
    config.items.reserve(items->size());
    for (const auto &item : *items) {
      Placement placement;
      placement.columnStart = intOr(item, "columnStart", 0);
      placement.columnSpan = intOr(item, "columnSpan", 1);
      placement.rowStart = intOr(item, "rowStart", 0);
      placement.rowSpan = intOr(item, "rowSpan", 1);
      config.items.push_back(placement);
    }
  }
  return config;
}

} // namespace nitrocss::grid
