import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StyleDependency, type Dimensions, type Insets } from "../specs/types";
import { runtime } from "./runtime";
import type { NitrowindContextValue } from "./types";

interface NitrowindControls {
  setTheme: (name: string) => void;
  setColorScheme: (scheme: "light" | "dark" | "system") => void;
}

const NitrowindContext = createContext<NitrowindControls | null>(null);

const ALL_RUNTIME_DEPENDENCIES = [
  StyleDependency.Theme,
  StyleDependency.ColorScheme,
  StyleDependency.Dimensions,
  StyleDependency.Insets,
  StyleDependency.Orientation,
  StyleDependency.Rtl,
  StyleDependency.FontScale,
  StyleDependency.Rem,
  StyleDependency.ContainerSize,
];

export interface NitrowindProviderProps {
  children: ReactNode;
}

/**
 * Provides reactive access to the runtime snapshot and theme controls. Wrap
 * your app root with this once.
 */
export function NitrowindProvider({
  children,
}: NitrowindProviderProps): React.JSX.Element {
  const value = useMemo<NitrowindControls>(
    () => ({
      setTheme: (name) => runtime.setTheme(name),
      setColorScheme: (scheme) => runtime.setColorScheme(scheme),
    }),
    [],
  );

  return (
    <NitrowindContext.Provider value={value}>
      {children}
    </NitrowindContext.Provider>
  );
}

export function useRuntimeSnapshot(
  dependencies: StyleDependency[] = ALL_RUNTIME_DEPENDENCIES,
) {
  const [snapshot, setSnapshot] = useState(() => runtime.current);

  useEffect(
    () => runtime.subscribe(dependencies, () => setSnapshot(runtime.current)),
    [dependencies],
  );

  return snapshot;
}

/** Access the current runtime snapshot and theme controls. */
export function useNitrowind(): NitrowindContextValue {
  const controls = useContext(NitrowindContext);
  if (!controls) {
    throw new Error("useNitrowind must be used within a <NitrowindProvider>");
  }
  const snapshot = useRuntimeSnapshot();
  return useMemo<NitrowindContextValue>(
    () => ({
      snapshot,
      themeName: snapshot.currentThemeName,
      setTheme: controls.setTheme,
      setColorScheme: controls.setColorScheme,
    }),
    [controls, snapshot],
  );
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
  return useMemo(
    () => ({
      themeName: snapshot.currentThemeName,
      setTheme: controls.setTheme,
    }),
    [controls, snapshot.currentThemeName],
  );
}

export function useDimensions(): Dimensions {
  return useRuntimeSnapshot([StyleDependency.Dimensions]).screen;
}

export function useInsets(): Insets {
  return useRuntimeSnapshot([StyleDependency.Insets]).insets;
}

export function useFontScale(): number {
  return useRuntimeSnapshot([StyleDependency.FontScale]).fontScale;
}
