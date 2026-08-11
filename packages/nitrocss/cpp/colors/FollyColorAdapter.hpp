#pragma once

#include "NativeColorConverter.hpp"

#include <folly/dynamic.h>

namespace nitrocss::colors {

/** Convert a Folly style value into the portable semantic/wide-gamut decoder value. */
DescriptorValue fromFollyDynamic(const folly::dynamic& value);

/** One-call bridge used by the shared style engine. */
DecodeResult decodeFollyDescriptor(const folly::dynamic& value);

enum class NativeColorPlatform { Apple, Android };

/**
 * Encode a resolved color using React Native's RawValue color contracts.
 * These objects reach UIColor/ColorStateList without an early sRGB conversion.
 */
std::optional<folly::dynamic> toNativeFollyColor(
    const ResolvedColor& color,
    NativeColorPlatform platform);

}  // namespace nitrocss::colors
