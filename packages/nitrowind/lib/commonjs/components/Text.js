"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Text = void 0;
var _react = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _store = require("../core/store.js");
var _animated = require("./animated.js");
var _internal = require("./internal.js");
var _pseudo = require("./pseudo.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
/**
 * Drop-in replacement for RN's `Text` that accepts a `className`. Behaves like
 * {@link View}: JS resolves the first paint, the native engine owns updates.
 */
const Text = exports.Text = /*#__PURE__*/(0, _react.forwardRef)(function Text({
  className = "",
  style,
  children,
  __nitrowindPseudoState,
  ...rest
}, forwardedRef) {
  const snapshot = (0, _internal.useReactiveSnapshot)();
  const resolved = (0, _react.useMemo)(() => (0, _store.resolveStyles)(className, snapshot, __nitrowindPseudoState), [className, snapshot, __nitrowindPseudoState]);
  const ref = (0, _internal.useLinkedRef)(className, "Text", resolved, snapshot, forwardedRef, [], __nitrowindPseudoState, undefined, style);

  // A class using an animation utility swaps the host for `Animated.Text`.
  const Animated = resolved.isAnimated ? (0, _animated.getAnimatedText)() : null;
  const Base = Animated ?? _reactNative.Text;
  const animationProps = Animated ? {
    entering: resolved.entering,
    exiting: resolved.exiting,
    layout: resolved.layout
  } : undefined;
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(Base, {
    ref: ref,
    style: [resolved.styles, style],
    ...animationProps,
    ...rest,
    children: (0, _pseudo.withChildPseudoState)(children, snapshot)
  });
});
//# sourceMappingURL=Text.js.map