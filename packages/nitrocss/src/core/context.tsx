import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  StyleDependency,
  type Dimensions,
  type Insets,
  type RuntimeSnapshot,
} from "../specs/types";
import { runtime } from "./runtime";
import type { NitroCssContextValue } from "./types";

interface NitroCssControls {
  setTheme: (name: string) => void;
  setColorScheme: (scheme: "light" | "dark" | "system") => void;
  /** Keeps React-owned props in sync when a detached screen is reattached. */
  snapshot: RuntimeSnapshot;
}

export const NitroCssContext = createContext<NitroCssControls | null>(null);

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

export interface NitroCssProviderProps {
  children: ReactNode;
}

/**
 * Provides stable theme controls. Runtime hooks subscribe independently to the
 * dependencies they read; the provider itself deliberately does not broadcast
 * every runtime change through the entire React tree.
 */
export function NitroCssProvider({
  children,
}: NitroCssProviderProps): React.JSX.Element {
  const value = useMemo<NitroCssControls>(
    () => ({
      setTheme: (name) => runtime.setTheme(name),
      setColorScheme: (scheme) => runtime.setColorScheme(scheme),
      // A getter keeps incidental React renders (navigation reattachment,
      // virtualization, parent state) on the latest native snapshot without
      // turning runtime changes into context broadcasts.
      get snapshot() {
        return runtime.current;
      },
    }),
    [],
  );

  return (
    <NitroCssContext.Provider value={value}>
      {children}
    </NitroCssContext.Provider>
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
export function useNitroCss(): NitroCssContextValue {
  const controls = useContext(NitroCssContext);
  if (!controls) {
    throw new Error("useNitroCss must be used within a <NitroCssProvider>");
  }
  const snapshot = useRuntimeSnapshot();
  return useMemo<NitroCssContextValue>(
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
  const controls = useContext(NitroCssContext);
  if (!controls) {
    throw new Error("useTheme must be used within a <NitroCssProvider>");
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
