"use strict";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { StyleDependency } from "../specs/types.js";
import { runtime } from "./runtime.js";
import { jsx as _jsx } from "react/jsx-runtime";
const NitrowindContext = /*#__PURE__*/createContext(null);
const ALL_RUNTIME_DEPENDENCIES = [StyleDependency.Theme, StyleDependency.ColorScheme, StyleDependency.Dimensions, StyleDependency.Insets, StyleDependency.Orientation, StyleDependency.Rtl, StyleDependency.FontScale, StyleDependency.Rem, StyleDependency.ContainerSize];
/**
 * Provides reactive access to the runtime snapshot and theme controls. Wrap
 * your app root with this once.
 */
export function NitrowindProvider({
  children
}) {
  const value = useMemo(() => ({
    setTheme: name => runtime.setTheme(name),
    setColorScheme: scheme => runtime.setColorScheme(scheme)
  }), []);
  return /*#__PURE__*/_jsx(NitrowindContext.Provider, {
    value: value,
    children: children
  });
}
export function useRuntimeSnapshot(dependencies = ALL_RUNTIME_DEPENDENCIES) {
  const [snapshot, setSnapshot] = useState(() => runtime.current);
  useEffect(() => runtime.subscribe(dependencies, () => setSnapshot(runtime.current)), [dependencies]);
  return snapshot;
}

/** Access the current runtime snapshot and theme controls. */
export function useNitrowind() {
  const controls = useContext(NitrowindContext);
  if (!controls) {
    throw new Error("useNitrowind must be used within a <NitrowindProvider>");
  }
  const snapshot = useRuntimeSnapshot();
  return useMemo(() => ({
    snapshot,
    themeName: snapshot.currentThemeName,
    setTheme: controls.setTheme,
    setColorScheme: controls.setColorScheme
  }), [controls, snapshot]);
}
export function useColorScheme() {
  return useRuntimeSnapshot([StyleDependency.ColorScheme]).colorScheme;
}
export function useTheme() {
  const controls = useContext(NitrowindContext);
  if (!controls) {
    throw new Error("useTheme must be used within a <NitrowindProvider>");
  }
  const snapshot = useRuntimeSnapshot([StyleDependency.Theme]);
  return useMemo(() => ({
    themeName: snapshot.currentThemeName,
    setTheme: controls.setTheme
  }), [controls, snapshot.currentThemeName]);
}
export function useDimensions() {
  return useRuntimeSnapshot([StyleDependency.Dimensions]).screen;
}
export function useInsets() {
  return useRuntimeSnapshot([StyleDependency.Insets]).insets;
}
export function useFontScale() {
  return useRuntimeSnapshot([StyleDependency.FontScale]).fontScale;
}
//# sourceMappingURL=context.js.map