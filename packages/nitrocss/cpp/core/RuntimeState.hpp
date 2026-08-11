#pragma once

#include "StyleEngine.hpp"

#include <cstdint>
#include <string>

namespace nitrocss {

/** Plain mirror of the JS `RuntimeSnapshot` (kept free of generated types). */
struct RuntimeState {
  int colorScheme = 0; // Light=0, Dark=1, Unspecified=2
  bool hasAdaptiveThemes = true;
  std::string currentThemeName = "light";
  double screenWidth = 0;
  double screenHeight = 0;
  double insetTop = 0;
  double insetRight = 0;
  double insetBottom = 0;
  double insetLeft = 0;
  int orientation = 0; // Portrait=0, Landscape=1
  double pixelRatio = 1;
  double fontScale = 1;
  bool rtl = false;
  double rem = 16;
  double hairlineWidth = 1;

  ResolveContext toContext() const {
    ResolveContext ctx{currentThemeName, colorScheme, rtl, rem};
    ctx.screenWidth = screenWidth;
    ctx.screenHeight = screenHeight;
    ctx.fontScale = fontScale;
    ctx.insetTop = insetTop;
    ctx.insetRight = insetRight;
    ctx.insetBottom = insetBottom;
    ctx.insetLeft = insetLeft;
    return ctx;
  }
};

/** Compute which dependencies changed between two states (bitmask). */
inline uint32_t diffStates(const RuntimeState& a, const RuntimeState& b) {
  uint32_t mask = 0;
  if (a.currentThemeName != b.currentThemeName) mask |= depFlag(Dependency::Theme);
  if (a.colorScheme != b.colorScheme) mask |= depFlag(Dependency::ColorScheme);
  if (a.screenWidth != b.screenWidth || a.screenHeight != b.screenHeight) {
    mask |= depFlag(Dependency::Dimensions);
  }
  if (a.insetTop != b.insetTop || a.insetRight != b.insetRight ||
      a.insetBottom != b.insetBottom || a.insetLeft != b.insetLeft) {
    mask |= depFlag(Dependency::Insets);
  }
  if (a.orientation != b.orientation) mask |= depFlag(Dependency::Orientation);
  if (a.rtl != b.rtl) mask |= depFlag(Dependency::Rtl);
  if (a.fontScale != b.fontScale) mask |= depFlag(Dependency::FontScale);
  if (a.rem != b.rem) mask |= depFlag(Dependency::Rem);
  return mask;
}

} // namespace nitrocss
