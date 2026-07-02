import type { HybridObject } from "react-native-nitro-modules";
import type {
  ColorScheme,
  Dimensions,
  Insets,
  Orientation,
  RuntimeSnapshot,
  RuntimeChangeSource,
  StyleDependency,
  ThemeConfig,
} from "./types";

export type ColorSchemeMode = "light" | "dark" | "system";

/**
 * Platform source of truth, backed by Swift (iOS) and Kotlin (Android). Reads
 * appearance, dimensions, safe-area insets, orientation, font scale and RTL,
 * and pushes changes into the C++ runtime.
 */
export interface NativePlatform extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  getThemeConfig(): ThemeConfig;
  setTheme(theme: string): void;
  setColorScheme(scheme: ColorSchemeMode): void;
  registerExtraThemes(themes: string[]): void;

  getCurrent(): RuntimeSnapshot;
  getColorScheme(): ColorScheme;
  getDimensions(): Dimensions;
  getInsets(): Insets;
  getOrientation(): Orientation;
  getFontScale(): number;
  getPixelRatio(): number;
  getIsRTL(): boolean;

  /**
   * Subscribe to native appearance/layout changes. The listener receives the
   * changed dependencies, the fresh snapshot, and what triggered it.
   */
  addRuntimeChangeListener(
    listener: (
      dependencies: StyleDependency[],
      runtime: RuntimeSnapshot,
      source: RuntimeChangeSource,
    ) => void,
  ): void;
}
