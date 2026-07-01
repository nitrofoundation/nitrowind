"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NitrowindProvider = NitrowindProvider;
exports.useColorScheme = useColorScheme;
exports.useDimensions = useDimensions;
exports.useFontScale = useFontScale;
exports.useInsets = useInsets;
exports.useNitrowind = useNitrowind;
exports.useRuntimeSnapshot = useRuntimeSnapshot;
exports.useTheme = useTheme;
var _react = _interopRequireWildcard(require("react"));
var _types = require("../specs/types.js");
var _runtime = require("./runtime.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const NitrowindContext = /*#__PURE__*/(0, _react.createContext)(null);
const ALL_RUNTIME_DEPENDENCIES = [_types.StyleDependency.Theme, _types.StyleDependency.ColorScheme, _types.StyleDependency.Dimensions, _types.StyleDependency.Insets, _types.StyleDependency.Orientation, _types.StyleDependency.Rtl, _types.StyleDependency.FontScale, _types.StyleDependency.Rem, _types.StyleDependency.ContainerSize];
/**
 * Provides reactive access to the runtime snapshot and theme controls. Wrap
 * your app root with this once.
 */
function NitrowindProvider({
  children
}) {
  const value = (0, _react.useMemo)(() => ({
    setTheme: name => _runtime.runtime.setTheme(name),
    setColorScheme: scheme => _runtime.runtime.setColorScheme(scheme)
  }), []);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(NitrowindContext.Provider, {
    value: value,
    children: children
  });
}
function useRuntimeSnapshot(dependencies = ALL_RUNTIME_DEPENDENCIES) {
  const [snapshot, setSnapshot] = (0, _react.useState)(() => _runtime.runtime.current);
  (0, _react.useEffect)(() => _runtime.runtime.subscribe(dependencies, () => setSnapshot(_runtime.runtime.current)), [dependencies]);
  return snapshot;
}

/** Access the current runtime snapshot and theme controls. */
function useNitrowind() {
  const controls = (0, _react.useContext)(NitrowindContext);
  if (!controls) {
    throw new Error("useNitrowind must be used within a <NitrowindProvider>");
  }
  const snapshot = useRuntimeSnapshot();
  return (0, _react.useMemo)(() => ({
    snapshot,
    themeName: snapshot.currentThemeName,
    setTheme: controls.setTheme,
    setColorScheme: controls.setColorScheme
  }), [controls, snapshot]);
}
function useColorScheme() {
  return useRuntimeSnapshot([_types.StyleDependency.ColorScheme]).colorScheme;
}
function useTheme() {
  const controls = (0, _react.useContext)(NitrowindContext);
  if (!controls) {
    throw new Error("useTheme must be used within a <NitrowindProvider>");
  }
  const snapshot = useRuntimeSnapshot([_types.StyleDependency.Theme]);
  return (0, _react.useMemo)(() => ({
    themeName: snapshot.currentThemeName,
    setTheme: controls.setTheme
  }), [controls, snapshot.currentThemeName]);
}
function useDimensions() {
  return useRuntimeSnapshot([_types.StyleDependency.Dimensions]).screen;
}
function useInsets() {
  return useRuntimeSnapshot([_types.StyleDependency.Insets]).insets;
}
function useFontScale() {
  return useRuntimeSnapshot([_types.StyleDependency.FontScale]).fontScale;
}
//# sourceMappingURL=context.js.map