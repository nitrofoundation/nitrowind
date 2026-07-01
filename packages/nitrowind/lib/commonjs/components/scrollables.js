"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SectionList = exports.ScrollView = exports.FlatList = void 0;
var _react = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _store = require("../core/store.js");
var _internal = require("./internal.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
/**
 * Scrollable containers (`ScrollView`, `FlatList`, `SectionList`) that accept a
 * `className` for the outer host node and a `contentContainerClassName` for the
 * inner content container.
 *
 * The outer node is linked to the native engine like every other styled
 * component, so theme / inset / dimension changes commit without a React
 * re-render. The content container is resolved in JS at mount (it has no host
 * ref to link); for the common case — static layout classes like padding / gap
 * — that is exactly right.
 */

/** Drop-in replacement for RN's `ScrollView` that accepts `className`. */
const ScrollView = exports.ScrollView = /*#__PURE__*/(0, _react.forwardRef)(function ScrollView({
  className = "",
  contentContainerClassName,
  style,
  contentContainerStyle,
  ...rest
}, forwardedRef) {
  const snapshot = (0, _internal.useReactiveSnapshot)();
  const resolved = (0, _react.useMemo)(() => (0, _store.resolveStyles)(className, snapshot), [className, snapshot]);
  const content = (0, _react.useMemo)(() => contentContainerClassName ? (0, _store.resolveStyles)(contentContainerClassName, snapshot) : undefined, [contentContainerClassName, snapshot]);
  const ref = (0, _internal.useLinkedRef)(className, "ScrollView", resolved, snapshot, forwardedRef, [], undefined, undefined, style);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.ScrollView, {
    ref: ref,
    style: [resolved.styles, style],
    contentContainerStyle: content ? [content.styles, contentContainerStyle] : contentContainerStyle,
    ...rest
  });
});
function FlatListInner({
  className = "",
  contentContainerClassName,
  style,
  contentContainerStyle,
  ...rest
}, forwardedRef) {
  const snapshot = (0, _internal.useReactiveSnapshot)();
  const resolved = (0, _react.useMemo)(() => (0, _store.resolveStyles)(className, snapshot), [className, snapshot]);
  const content = (0, _react.useMemo)(() => contentContainerClassName ? (0, _store.resolveStyles)(contentContainerClassName, snapshot) : undefined, [contentContainerClassName, snapshot]);
  const ref = (0, _internal.useLinkedRef)(className, "FlatList", resolved, snapshot, forwardedRef, [], undefined, undefined, style);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.FlatList, {
    ref: ref,
    style: [resolved.styles, style],
    contentContainerStyle: content ? [content.styles, contentContainerStyle] : contentContainerStyle,
    ...rest
  });
}
const FlatListImpl = /*#__PURE__*/(0, _react.forwardRef)(FlatListInner);
FlatListImpl.displayName = "Nitrowind(FlatList)";

/** Drop-in replacement for RN's `FlatList` that accepts `className`. */
const FlatList = exports.FlatList = FlatListImpl;
function SectionListInner({
  className = "",
  contentContainerClassName,
  style,
  contentContainerStyle,
  ...rest
}, forwardedRef) {
  const snapshot = (0, _internal.useReactiveSnapshot)();
  const resolved = (0, _react.useMemo)(() => (0, _store.resolveStyles)(className, snapshot), [className, snapshot]);
  const content = (0, _react.useMemo)(() => contentContainerClassName ? (0, _store.resolveStyles)(contentContainerClassName, snapshot) : undefined, [contentContainerClassName, snapshot]);
  const ref = (0, _internal.useLinkedRef)(className, "SectionList", resolved, snapshot, forwardedRef, [], undefined, undefined, style);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.SectionList, {
    ref: ref,
    style: [resolved.styles, style],
    contentContainerStyle: content ? [content.styles, contentContainerStyle] : contentContainerStyle,
    ...rest
  });
}
const SectionListImpl = /*#__PURE__*/(0, _react.forwardRef)(SectionListInner);
SectionListImpl.displayName = "Nitrowind(SectionList)";

/** Drop-in replacement for RN's `SectionList` that accepts `className`. */
const SectionList = exports.SectionList = SectionListImpl;
//# sourceMappingURL=scrollables.js.map