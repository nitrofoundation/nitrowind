"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.View = void 0;
var _react = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _store = require("../core/store.js");
var _animated = require("./animated.js");
var _containerContext = require("./containerContext.js");
var _grid = require("./grid.js");
var _internal = require("./internal.js");
var _pseudo = require("./pseudo.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
/**
 * Drop-in replacement for RN's `View` that accepts a `className`. The initial
 * style is resolved in JS for first paint; the native engine then owns all
 * subsequent updates (no React re-render on theme/dimension changes).
 */
const View = exports.View = /*#__PURE__*/(0, _react.forwardRef)(function View({
  className = "",
  style,
  onLayout,
  children,
  __nitrowindPseudoState,
  ...rest
}, forwardedRef) {
  const snapshot = (0, _internal.useReactiveSnapshot)();
  const resolved = (0, _react.useMemo)(() => (0, _store.resolveStyles)(className, snapshot, __nitrowindPseudoState), [className, snapshot, __nitrowindPseudoState]);
  const ref = (0, _internal.useLinkedRef)(className, "View", resolved, snapshot, forwardedRef, [], __nitrowindPseudoState, undefined, style);

  // `useContainer` returns a single `onLayout` that already merges the container
  // size reporter (JS fallback) with the caller's own handler.
  const {
    onLayout: handleLayout,
    containerStyle,
    provider
  } = (0, _containerContext.useContainer)(resolved, onLayout);
  const gridFallback = (0, _grid.useGridFallback)(children, className, handleLayout, [resolved.styles, containerStyle, style]);

  // A class using an animation utility (`entering-*`, `animate-wiggle`, …) swaps
  // the host for Reanimated's `Animated.View` so it can drive the animation.
  const Animated = resolved.isAnimated ? (0, _animated.getAnimatedView)() : null;
  const Base = Animated ?? _reactNative.View;
  const animationProps = Animated ? {
    entering: resolved.entering,
    exiting: resolved.exiting,
    layout: resolved.layout
  } : undefined;
  const node = /*#__PURE__*/(0, _jsxRuntime.jsx)(Base, {
    ref: ref,
    style: [resolved.styles, containerStyle, style],
    onLayout: gridFallback.onLayout,
    ...animationProps,
    ...rest,
    children: (0, _pseudo.withChildPseudoState)(gridFallback.children, snapshot)
  });
  return provider ? /*#__PURE__*/(0, _jsxRuntime.jsx)(_containerContext.ContainerProvider, {
    value: provider,
    children: node
  }) : node;
});
//# sourceMappingURL=View.js.map