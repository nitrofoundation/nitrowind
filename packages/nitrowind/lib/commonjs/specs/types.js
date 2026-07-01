"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StyleDependency = exports.RuntimeChangeSource = exports.Orientation = exports.ColorScheme = void 0;
/**
 * A plain JS object passed across the Nitro bridge.
 */
/**
 * Bridges a React Native ref/shadow-node JS value to a C++
 * `std::shared_ptr<const ShadowNode>`. The conversion is implemented in our
 * hand-written `JSIConverter+ShadowNode.hpp` (see `cpp/jsi/`).
 */
/**
 * Bridges a JS style object to a C++ `folly::dynamic` (aliased `SharedFolly`).
 * Implemented in `JSIConverter+SharedFolly.hpp`.
 */
/**
 * Which runtime values a compiled style depends on. Used as bit positions for a
 * dependency bitmask so the engine only recomputes affected nodes on change.
 */
let StyleDependency = exports.StyleDependency = /*#__PURE__*/function (StyleDependency) {
  StyleDependency[StyleDependency["Theme"] = 0] = "Theme";
  StyleDependency[StyleDependency["ColorScheme"] = 1] = "ColorScheme";
  StyleDependency[StyleDependency["Dimensions"] = 2] = "Dimensions";
  StyleDependency[StyleDependency["Insets"] = 3] = "Insets";
  StyleDependency[StyleDependency["Orientation"] = 4] = "Orientation";
  StyleDependency[StyleDependency["Rtl"] = 5] = "Rtl";
  StyleDependency[StyleDependency["FontScale"] = 6] = "FontScale";
  StyleDependency[StyleDependency["Rem"] = 7] = "Rem";
  /** A parent container's measured size (container queries). */
  StyleDependency[StyleDependency["ContainerSize"] = 8] = "ContainerSize";
  /** A nearest group ancestor's interactive state. */
  StyleDependency[StyleDependency["GroupState"] = 9] = "GroupState";
  return StyleDependency;
}({});
let ColorScheme = exports.ColorScheme = /*#__PURE__*/function (ColorScheme) {
  ColorScheme[ColorScheme["Light"] = 0] = "Light";
  ColorScheme[ColorScheme["Dark"] = 1] = "Dark";
  ColorScheme[ColorScheme["Unspecified"] = 2] = "Unspecified";
  return ColorScheme;
}({});
let Orientation = exports.Orientation = /*#__PURE__*/function (Orientation) {
  Orientation[Orientation["Portrait"] = 0] = "Portrait";
  Orientation[Orientation["Landscape"] = 1] = "Landscape";
  return Orientation;
}({});
/** Source that triggered a runtime change (for diagnostics/animation). */
let RuntimeChangeSource = exports.RuntimeChangeSource = /*#__PURE__*/function (RuntimeChangeSource) {
  RuntimeChangeSource[RuntimeChangeSource["System"] = 0] = "System";
  RuntimeChangeSource[RuntimeChangeSource["User"] = 1] = "User";
  RuntimeChangeSource[RuntimeChangeSource["Layout"] = 2] = "Layout";
  return RuntimeChangeSource;
}({});
/**
 * Snapshot of all runtime values (mirrors uniwind's `UniwindRuntimeCurrent`).
 */
/** Per-component context captured at link time. */
/** Interactive pseudo-state of a component (focus/active/disabled/hover). */
/** A diagnostic update emitted when the engine mutates the shadow tree. */
//# sourceMappingURL=types.js.map